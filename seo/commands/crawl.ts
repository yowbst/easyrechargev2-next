import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CRAWL_ISSUE_TYPES, analyzePageSeo } from "../lib/crawl-analysis";
import { dataDir, site } from "../lib/config";
import type { Issue } from "../lib/geo-analysis";
import { createLogger } from "../lib/logger";
import { ensureTab, markResolvedAuto, upsertRows } from "../lib/sheets";
import { ISSUES_HEADERS, SITE_HEALTH_HEADERS } from "../lib/tab-schemas";

const log = createLogger("crawl");

interface CrawledPage {
  url: string;
  title: string;
  description: string;
  status: number;
}

/** Breadth-first crawl from the home page over internal links. */
export async function crawl(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (n: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : undefined);
  const start = flag("url") ?? site.siteUrl;
  const maxPages = Number(flag("max-pages") ?? 200);
  const dryRun = argv.includes("--dry-run");
  const stamp = new Date().toISOString().slice(0, 10);

  const visited = new Set<string>();
  const queue = [start];
  const issues: Issue[] = [];
  const pages: CrawledPage[] = [];
  const note = (url: string, issue_type: string, severity: Issue["severity"], details: string) =>
    issues.push({ url, issue_type, severity, details, date_found: stamp, status: "open" });

  while (queue.length && visited.size < maxPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    log.info(`Crawling ${url} (${visited.size}/${maxPages})`);

    try {
      const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "easyrecharge-seo-crawler/1.0" } });
      if (res.redirected && res.url !== url) note(url, "redirect", "info", `Redirects to ${res.url}`);
      if (res.status >= 400) {
        note(url, `http_${res.status}`, res.status >= 500 ? "critical" : "warning", `HTTP ${res.status}`);
        continue;
      }
      if (res.status !== 200) continue;

      const { issues: pageIssues, links, title, description } = analyzePageSeo(url, await res.text(), site.siteUrl, stamp);
      issues.push(...pageIssues);
      pages.push({ url, title, description, status: res.status });
      for (const link of links) if (!visited.has(link)) queue.push(link);
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      log.error(`Failed to crawl ${url}`, { error: (err as Error).message });
    }
  }

  const dir = resolve(dataDir, "crawls");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${stamp}-crawl.json`), JSON.stringify({ pagesVisited: visited.size, pages, issues }, null, 2));

  if (!dryRun && pages.length) {
    await ensureTab(site.sheetsTabNames.siteHealth, SITE_HEALTH_HEADERS);
    const health = await upsertRows(
      site.sheetsTabNames.siteHealth,
      pages.map((p) => {
        const own = issues.filter((i) => i.url === p.url).map((i) => i.issue_type);
        return {
          url: p.url,
          page_title: p.title,
          crawl_status: String(p.status),
          crawl_has_title: p.title ? "yes" : "no",
          crawl_has_meta_desc: p.description ? "yes" : "no",
          crawl_has_canonical: own.includes("missing_canonical") ? "no" : "yes",
          crawl_has_h1: own.includes("missing_h1") ? "no" : "yes",
          last_crawl: stamp,
        };
      }),
      "url",
    );
    log.info(`Site Health: updated ${health.updated}, appended ${health.appended}`);
  }

  if (!dryRun && issues.length) {
    await ensureTab(site.sheetsTabNames.issues, ISSUES_HEADERS);
    const res = await upsertRows(
      site.sheetsTabNames.issues,
      issues.map((i) => ({ ...i, category: "crawl", fix_prompt: "" })),
      ["url", "issue_type"],
      ["status"],
    );
    log.info(`Issues: updated ${res.updated}, appended ${res.appended}`);

    const resolved = await markResolvedAuto(
      site.sheetsTabNames.issues,
      ["url", "issue_type"],
      issues.map((i) => `${i.url}|||${i.issue_type}`),
      (row) => row.category === "crawl" && (CRAWL_ISSUE_TYPES.includes(row.issue_type) || row.issue_type.startsWith("http_")),
    );
    log.info(`Issues: auto-resolved ${resolved.resolved} crawl issues`);
  }

  const bySeverity = { critical: 0, warning: 0, info: 0 };
  for (const i of issues) bySeverity[i.severity]++;
  console.log(`\n--- Crawl${dryRun ? " (dry run: Sheet untouched)" : ""} ---`);
  console.log(`Pages crawled: ${visited.size} | issues ${issues.length} (critical ${bySeverity.critical}, warning ${bySeverity.warning}, info ${bySeverity.info})`);
}
