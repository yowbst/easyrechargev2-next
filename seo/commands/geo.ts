import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dataDir, site } from "../lib/config";
import { analyzePageGeo, type Issue, type Scorecard } from "../lib/geo-analysis";
import { createLogger } from "../lib/logger";
import { appendRows, ensureTab, upsertRows } from "../lib/sheets";
import { SCORE_HISTORY_HEADERS, SITE_HEALTH_HEADERS } from "../lib/tab-schemas";

const log = createLogger("geo");
const UA = { "User-Agent": "easyrecharge-geo-audit/1.0" };
const BOT_POINTS = 15;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const today = () => new Date().toISOString().slice(0, 10);

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: UA });
  return res.ok ? res.text() : null;
}

async function checkRobots() {
  const text = await fetchText(`${site.siteUrl}/robots.txt`).catch(() => null);
  if (text === null) return { exists: false, blockedBots: [] as string[] };
  const blockedBots = site.geo.aiBots.filter((bot) =>
    new RegExp(`User-agent:\\s*${escapeRe(bot)}[\\s\\S]*?Disallow:\\s*/`, "i").test(text),
  );
  return { exists: true, blockedBots };
}

async function checkLlmsTxt(): Promise<Record<string, { exists: boolean; status: number }>> {
  const out: Record<string, { exists: boolean; status: number }> = {};
  for (const file of ["llms.txt", "llms-full.txt"]) {
    try {
      const res = await fetch(`${site.siteUrl}/${file}`, { headers: UA });
      out[file] = { exists: res.ok, status: res.status };
    } catch {
      out[file] = { exists: false, status: 0 };
    }
  }
  return out;
}

/** French blog posts from the live sitemap, plus the home page. */
async function discoverPages(): Promise<string[]> {
  const xml = await fetchText(`${site.siteUrl}/sitemap/blog.xml`);
  const posts = [...(xml ?? "").matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => u.includes("/fr/"));
  return [`${site.siteUrl}/fr`, ...new Set(posts)];
}

export async function geo(): Promise<void> {
  const argv = process.argv.slice(2);
  const only = argv.includes("--url") ? argv[argv.indexOf("--url") + 1] : undefined;
  const dryRun = argv.includes("--dry-run");
  const stamp = today();

  const [robots, llms] = await Promise.all([checkRobots(), checkLlmsTxt()]);
  const siteIssues: Issue[] = [];
  const siteIssue = (url: string, issue_type: string, severity: Issue["severity"], details: string) =>
    siteIssues.push({ url, issue_type, severity, details, date_found: stamp, status: "open" });

  const botsAccessible = robots.blockedBots.length === 0;
  if (!botsAccessible)
    siteIssue(`${site.siteUrl}/robots.txt`, "geo_bots_blocked", "critical", `AI bots blocked: ${robots.blockedBots.join(", ")}`);
  if (!robots.exists) siteIssue(`${site.siteUrl}/robots.txt`, "geo_no_robots_txt", "warning", "robots.txt not found or not accessible");
  if (!llms["llms.txt"].exists)
    siteIssue(`${site.siteUrl}/llms.txt`, "geo_no_llms_txt", "warning", "llms.txt not found: AI crawlers cannot discover site structure");

  const botScore = botsAccessible ? BOT_POINTS : 0;
  const botsStatus = botsAccessible ? "yes" : `blocked: ${robots.blockedBots.join(", ")}`;

  const pages = only ? [only] : await discoverPages();
  log.info(`Auditing ${pages.length} page(s)`);

  const issues: Issue[] = [...siteIssues];
  const scorecards: Scorecard[] = [];
  for (const url of pages) {
    try {
      const html = await fetchText(url);
      if (!html) {
        log.warn(`Skipping ${url}: could not fetch`);
        continue;
      }
      const { issues: pageIssues, scorecard, rawScore } = analyzePageGeo(url, html, site.geo);
      scorecard.geo_score = rawScore + botScore;
      scorecard.bots_accessible = botsStatus;
      issues.push(...pageIssues);
      scorecards.push(scorecard);
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      log.error(`Failed to audit ${url}`, { error: (err as Error).message });
    }
  }

  if (!dryRun && scorecards.length) {
    await ensureTab(site.sheetsTabNames.siteHealth, SITE_HEALTH_HEADERS);
    const health = await upsertRows(
      site.sheetsTabNames.siteHealth,
      scorecards.map((s) => ({
        url: s.url,
        page_title: s.page_title,
        geo_score: s.geo_score,
        geo_schema_types: s.schema_types,
        geo_question_headings_pct: s.question_headings_pct,
        geo_direct_answers_pct: s.direct_answers_pct,
        geo_citation_density: s.citation_density,
        geo_has_author: s.has_author,
        geo_has_faq: s.has_faq,
        geo_content_age_days: s.content_age_days,
        geo_bots_accessible: s.bots_accessible,
        last_geo_audit: stamp,
      })),
      "url",
    );
    log.info(`Site Health: updated ${health.updated}, appended ${health.appended}`);

    await ensureTab(site.sheetsTabNames.scoreHistory, SCORE_HISTORY_HEADERS);
    await appendRows(
      site.sheetsTabNames.scoreHistory,
      scorecards.map((s) => ({
        date: stamp,
        url: s.url,
        audit_type: "geo",
        score: s.geo_score,
        detail_json: JSON.stringify({
          question_headings_pct: s.question_headings_pct,
          direct_answers_pct: s.direct_answers_pct,
          citation_density: s.citation_density,
          has_author: s.has_author,
          has_faq: s.has_faq,
          content_age_days: s.content_age_days,
        }),
      })),
    );
  }

  const dir = resolve(dataDir, "audits");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${stamp}-geo-audit.json`), JSON.stringify({ robots, llms, scorecards, issues }, null, 2));

  const avg = scorecards.length ? Math.round(scorecards.reduce((s, c) => s + c.geo_score, 0) / scorecards.length) : 0;
  console.log(`\n--- GEO audit${dryRun ? " (dry run: Sheet untouched)" : ""} ---`);
  console.log(`Pages audited: ${scorecards.length} | average ${avg}/100 | issues ${issues.length}`);
  console.log(`AI bots: ${botsAccessible ? "accessible" : "BLOCKED"} | llms.txt: ${llms["llms.txt"].exists ? "present" : "MISSING"}`);

  const byType = new Map<string, number>();
  for (const i of issues) byType.set(i.issue_type, (byType.get(i.issue_type) ?? 0) + 1);
  console.log("\nIssues by type:");
  for (const [type, n] of [...byType].sort((a, b) => b[1] - a[1])) console.log(`  ${type}: ${n}`);
  console.log("\nWorst pages:");
  for (const s of [...scorecards].sort((a, b) => a.geo_score - b.geo_score).slice(0, 5))
    console.log(`  ${s.geo_score}/100 | ${s.page_title || s.url}`);
}
