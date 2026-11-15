import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dataDir, site } from "../lib/config";
import { decodeAdsExport, findGaps, generateSeeds, mergeKeywords, normalizeRecord, parseAdsCsv, preGroupByNgrams, type Keyword } from "../lib/keywords";
import { createLogger } from "../lib/logger";
import { readTab, upsertRows } from "../lib/sheets";

const log = createLogger("keywords");
const PROTECTED = ["intent", "cluster", "status", "volume_estimate", "cpc"];

/** Latest `seo/data/gsc/*-queries.json`, written by `npm run seo -- gsc`. */
function latestGscQueries(): Keyword[] {
  const dir = resolve(dataDir, "gsc");
  if (!existsSync(dir)) return [];
  const file = readdirSync(dir).filter((f) => f.endsWith("-queries.json")).sort().reverse()[0];
  if (!file) return [];
  const rows = JSON.parse(readFileSync(resolve(dir, file), "utf-8")) as { keys: string[]; impressions: number; clicks: number; position: number }[];
  return rows.map((q) => ({
    term: q.keys[0],
    source: "gsc",
    gsc_impressions: Math.round(q.impressions),
    gsc_clicks: Math.round(q.clicks),
    gsc_position: q.position.toFixed(1),
  }));
}

async function autocomplete(seed: string): Promise<Keyword[]> {
  try {
    const params = new URLSearchParams({ q: seed, client: "firefox", hl: "fr", gl: "ch", oe: "utf-8" });
    const res = await fetch(`https://suggestqueries.google.com/complete/search?${params}`);
    if (!res.ok) {
      log.warn(`Autocomplete failed for "${seed}": HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as [string, string[]];
    return (data[1] ?? []).map((term) => ({ term, source: "autocomplete" }));
  } catch (err) {
    log.warn(`Autocomplete error for "${seed}": ${(err as Error).message}`);
    return [];
  }
}

async function discover(topic?: string): Promise<void> {
  if (!topic) throw new Error('Usage: npm run seo -- keywords discover "<topic>"');
  const words = topic.toLowerCase().split(/\s+/);
  const gsc = latestGscQueries().filter((k) => words.some((w) => k.term.toLowerCase().includes(w)));

  const suggestions: Keyword[] = [];
  for (const seed of generateSeeds(topic)) {
    suggestions.push(...(await autocomplete(seed)));
    await new Promise((r) => setTimeout(r, 100));
  }

  const keywords = mergeKeywords([...gsc, ...suggestions]);
  const res = await upsertRows(site.sheetsTabNames.keywordsMaster, keywords as Record<string, string | number>[], "term", PROTECTED);
  console.log(`\n--- Keyword discovery: "${topic}" ---`);
  console.log(`GSC relevant: ${gsc.length} | autocomplete: ${suggestions.length} | unique: ${keywords.length} | new to sheet: ${res.appended}`);
}

async function importAds(path: string | undefined, dryRun: boolean): Promise<void> {
  if (!path) throw new Error("Usage: npm run seo -- keywords import-ads <csv-path> [--dry-run]");
  const records = parseAdsCsv(decodeAdsExport(readFileSync(resolve(path))));
  const keywords = records.map(normalizeRecord).filter((k): k is Keyword => k !== null);
  const sources = [...new Set(keywords.map((k) => k.source))].join(", ");

  console.log(`\n--- Google Ads import${dryRun ? " (dry run: Sheet untouched)" : ""} ---`);
  console.log(`Rows parsed: ${records.length} | valid keywords: ${keywords.length} (${sources})`);
  if (dryRun) {
    for (const k of keywords.slice(0, 5)) console.log(`  ${k.term} | vol ${k.volume_estimate} | cpc ${k.cpc}`);
    return;
  }
  const res = await upsertRows(site.sheetsTabNames.keywordsMaster, keywords as Record<string, string | number>[], "term", ["intent", "cluster", "status"]);
  console.log(`Updated: ${res.updated} | new: ${res.appended}`);
}

async function cluster(): Promise<void> {
  const keywords = await readTab(site.sheetsTabNames.keywordsMaster);
  const unclustered = keywords.filter((k) => !k.cluster?.trim());
  console.log(`Keywords: ${keywords.length}, unclustered: ${unclustered.length}`);
  if (!unclustered.length) return;

  const groups = preGroupByNgrams(unclustered.map((k) => ({ term: k.term })));
  for (const [key, members] of groups) {
    console.log(`[${key}] (${members.length})`);
    members.slice(0, 5).forEach((m) => console.log(`  - ${m.term}`));
    if (members.length > 5) console.log(`  ... and ${members.length - 5} more`);
  }

  mkdirSync(dataDir, { recursive: true });
  const out = resolve(dataDir, `keywords-preclustered-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(out, JSON.stringify(Object.fromEntries([...groups].map(([k, v]) => [k, v.map((m) => m.term)])), null, 2));
  console.log(`\nPre-groups saved to ${out}. Name the clusters with the keyword-cluster skill.`);
}

async function gaps(): Promise<void> {
  const { totalClusters, empty, underserved } = findGaps(await readTab(site.sheetsTabNames.keywordsMaster));
  console.log(`\n--- Content gaps ---\nClusters: ${totalClusters} | with no content: ${empty.length}\n`);
  empty.forEach((g, i) => {
    console.log(`${i + 1}. [${g.cluster}] ${g.keywords} keywords, ${g.totalImpressions} impressions`);
    console.log(`   ${g.topKeywords.join(", ")}`);
  });
  if (underserved.length) {
    console.log("\n--- Under-served (content exists, low coverage) ---");
    underserved.forEach((u) => console.log(`  [${u.cluster}] ${u.coverage} (${u.published}/${u.total})`));
  }
}

const SUBCOMMANDS = "discover <topic> | import-ads <csv> | cluster | gaps";

export async function keywords(): Promise<void> {
  const [, sub, arg] = process.argv.slice(2);
  const dryRun = process.argv.includes("--dry-run");
  switch (sub) {
    case "discover": return discover(arg);
    case "import-ads": return importAds(arg, dryRun);
    case "cluster": return cluster();
    case "gaps": return gaps();
    default: throw new Error(`Usage: npm run seo -- keywords <${SUBCOMMANDS}>`);
  }
}
