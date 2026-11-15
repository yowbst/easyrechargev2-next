import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { google } from "googleapis";
import { dataDir, gscProperty, site } from "../lib/config";
import { googleAuth } from "../lib/google";
import { createLogger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import { appendRows, upsertRows } from "../lib/sheets";

const log = createLogger("gsc");

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

const pct = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Last 28 days of Search Console data -> seo/data/gsc, Performance and Keywords Master tabs. */
export async function gsc(): Promise<void> {
  const sc = google.searchconsole({
    version: "v1",
    auth: googleAuth(["https://www.googleapis.com/auth/webmasters.readonly"]),
  });

  const endDate = day(new Date());
  const startDate = day(new Date(Date.now() - 28 * 86_400_000));
  log.info(`Date range: ${startDate} to ${endDate}`);

  const fetchBy = async (dimension: "query" | "page"): Promise<GscRow[]> => {
    const res = await withRetry(
      () =>
        sc.searchanalytics.query({
          siteUrl: gscProperty(),
          requestBody: { startDate, endDate, dimensions: [dimension], rowLimit: 5000, type: "web" },
        }),
      { logger: log },
    );
    return (res.data.rows ?? []) as GscRow[];
  };

  const [queries, pages] = await Promise.all([fetchBy("query"), fetchBy("page")]);
  log.info(`Fetched ${queries.length} queries, ${pages.length} pages`);

  const stamp = endDate;
  const dir = resolve(dataDir, "gsc");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${stamp}-queries.json`), JSON.stringify(queries, null, 2));
  writeFileSync(resolve(dir, `${stamp}-pages.json`), JSON.stringify(pages, null, 2));

  const perf = await appendRows(
    site.sheetsTabNames.performance,
    pages.map((p) => ({
      date: stamp,
      page: p.keys[0],
      clicks: Math.round(p.clicks),
      impressions: Math.round(p.impressions),
      ctr: pct(p.ctr),
      position: p.position.toFixed(1),
    })),
  );
  log.info(`Performance tab: appended ${perf.appended} rows`);

  const kw = await upsertRows(
    site.sheetsTabNames.keywordsMaster,
    queries.map((q) => ({
      term: q.keys[0],
      gsc_impressions: Math.round(q.impressions),
      gsc_clicks: Math.round(q.clicks),
      gsc_ctr: pct(q.ctr),
      gsc_position: q.position.toFixed(1),
      last_updated: stamp,
    })),
    "term",
    ["intent", "cluster", "status", "volume_estimate", "cpc"],
  );
  log.info(`Keywords Master: updated ${kw.updated}, appended ${kw.appended}`);

  const quickWins = queries
    .filter((q) => q.position >= 5 && q.position <= 20 && q.impressions > 10)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);
  const lowCtr = pages
    .filter((p) => p.impressions > 50 && p.ctr < 0.03)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  console.log("\n--- Quick wins (position 5-20, >10 impressions) ---");
  for (const q of quickWins) console.log(`  pos ${q.position.toFixed(1)} | ${q.impressions} imp | ${q.keys[0]}`);
  console.log("\n--- Low CTR pages (>50 impressions, <3% CTR) ---");
  for (const p of lowCtr) console.log(`  ${pct(p.ctr)} CTR | ${p.impressions} imp | ${p.keys[0]}`);
}
