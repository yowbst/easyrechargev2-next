import { directusFetch } from "../../src/lib/directus";
import { site } from "../lib/config";
import { createLogger } from "../lib/logger";
import { readTab, upsertRows } from "../lib/sheets";

const log = createLogger("freshness");

interface PostRow {
  id: string | number;
  date_updated: string | null;
  date_created: string | null;
  translations?: { title?: string; slug?: string; languages_code?: string }[];
}

/** Published posts untouched for more than the GEO threshold -> Content Calendar, busiest first. */
export async function freshness(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const threshold = site.geo.freshnessThresholdDays;

  const { data: posts } = await directusFetch<{ data: PostRow[] }>(
    "/items/blog_posts?fields=id,status,date_updated,date_created,translations.title,translations.slug,translations.languages_code" +
      "&filter[status][_eq]=published&limit=-1",
  );
  log.info(`Fetched ${posts.length} published posts`);

  const now = Date.now();
  const stale = posts
    .map((post) => {
      const fr = post.translations?.find((t) => t.languages_code === "fr-FR");
      const lastUpdated = post.date_updated || post.date_created;
      const ageDays = lastUpdated ? Math.round((now - new Date(lastUpdated).getTime()) / 86_400_000) : -1;
      return { id: post.id, title: fr?.title || "Untitled", slug: fr?.slug || "", ageDays, impressions: 0 };
    })
    .filter((p) => p.ageDays > threshold);

  // Rank by Search Console impressions when the Performance tab is readable.
  let performance: Record<string, string>[] = [];
  if (!dryRun) {
    try {
      performance = await readTab(site.sheetsTabNames.performance);
    } catch {
      log.warn("Could not read the Performance tab; ranking by age only");
    }
  }
  const impressions = new Map<string, number>();
  for (const row of performance) {
    if (!row.page || !row.impressions) continue;
    const slug = row.page.split("/").filter(Boolean).pop() ?? row.page;
    impressions.set(slug, (impressions.get(slug) ?? 0) + (parseInt(row.impressions, 10) || 0));
  }
  for (const p of stale) p.impressions = impressions.get(p.slug) ?? 0;
  stale.sort((a, b) => b.impressions - a.impressions || b.ageDays - a.ageDays);

  if (!dryRun && stale.length) {
    const res = await upsertRows(
      site.sheetsTabNames.contentCalendar,
      stale.map((p) => ({
        title: `[REFRESH] ${p.title}`,
        target_keyword: p.slug,
        status: "needs_review",
        target_date: "",
        directus_id: String(p.id),
        secondary_keywords: "",
        notes: `Stale: ${p.ageDays} days old. Impressions: ${p.impressions}`,
      })),
      "target_keyword",
      ["status", "target_date", "notes"],
    );
    log.info(`Content Calendar: updated ${res.updated}, appended ${res.appended}`);
  }

  console.log(`\n--- Content freshness${dryRun ? " (dry run: Sheet untouched)" : ""} ---`);
  console.log(`Published: ${posts.length} | stale (>${threshold} days): ${stale.length}`);
  stale.forEach((p, i) => console.log(`  ${i + 1}. [${p.ageDays}d] ${p.title} (${p.impressions} imp)`));
}
