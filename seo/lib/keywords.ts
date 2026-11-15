import { parse } from "csv-parse/sync";

export interface Keyword {
  term: string;
  source?: string;
  [column: string]: string | number | undefined;
}

// ── Discovery ───────────────────────────────────────────────────────────

/** Prefix and suffix variations of a topic, used as autocomplete seeds. */
export function generateSeeds(topic: string): string[] {
  const prefixes = ["", "comment ", "pourquoi ", "quel ", "combien ", "prix ", "meilleur "];
  const suffixes = ["", " suisse", " prix", " installation", " maison"];
  return [
    ...new Set([
      ...prefixes.map((p) => `${p}${topic}`.trim()),
      ...suffixes.map((s) => `${topic}${s}`.trim()),
    ]),
  ];
}

/** Dedupes by lowercased term, joining the `source` of every list that had it. */
export function mergeKeywords(items: Keyword[]): Keyword[] {
  const merged = new Map<string, Keyword>();
  for (const item of items) {
    const term = item.term.toLowerCase().trim();
    const existing = merged.get(term);
    if (!existing) {
      merged.set(term, { status: "new", ...item, term });
      continue;
    }
    const sources = new Set([...(existing.source ?? "").split(","), ...(item.source ?? "").split(",")].filter(Boolean));
    Object.assign(existing, item, { term, status: existing.status, source: [...sources].join(",") });
  }
  return [...merged.values()];
}

// ── Clustering ──────────────────────────────────────────────────────────

/**
 * Groups keywords by the longest shared word or word pair, so a model only has
 * to name groups, not read thousands of terms. Groups under `minGroupSize` are
 * pooled into `_ungrouped`.
 */
export function preGroupByNgrams<T extends { term: string }>(keywords: T[], minGroupSize = 2): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const kw of keywords) {
    const words = kw.term.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const ngrams: string[] = [];
    for (let i = 0; i < words.length; i++) {
      ngrams.push(words[i]);
      for (let j = i + 1; j < words.length; j++) ngrams.push(`${words[i]} ${words[j]}`);
    }
    ngrams.sort((a, b) => b.length - a.length);

    const existing = ngrams.find((ng) => groups.has(ng));
    if (existing) groups.get(existing)!.push(kw);
    else groups.set(ngrams[0] ?? kw.term, [kw]);
  }

  const result = new Map<string, T[]>();
  const ungrouped: T[] = [];
  for (const [key, members] of groups) {
    if (members.length >= minGroupSize) result.set(key, members);
    else ungrouped.push(...members);
  }
  if (ungrouped.length) result.set("_ungrouped", ungrouped);
  return result;
}

// ── Gaps ────────────────────────────────────────────────────────────────

const impressions = (k: Record<string, string>) => parseInt(k.gsc_impressions, 10) || 0;

/** Clusters with no published content, and clusters where under 30% of terms are covered. */
export function findGaps(keywords: Record<string, string>[]) {
  const clusters = new Map<string, Record<string, string>[]>();
  for (const kw of keywords) {
    if (!kw.cluster) continue;
    clusters.set(kw.cluster, [...(clusters.get(kw.cluster) ?? []), kw]);
  }

  const empty = [];
  const underserved = [];
  for (const [cluster, kws] of clusters) {
    const published = kws.filter((k) => k.status === "published").length;
    const covered = kws.some((k) => k.status === "published" || k.existing_url?.trim());
    if (!covered) {
      empty.push({
        cluster,
        keywords: kws.length,
        totalImpressions: kws.reduce((s, k) => s + impressions(k), 0),
        topKeywords: [...kws].sort((a, b) => impressions(b) - impressions(a)).slice(0, 5).map((k) => k.term),
      });
    } else if (published > 0 && published < kws.length * 0.3) {
      underserved.push({ cluster, published, total: kws.length, coverage: `${Math.round((published / kws.length) * 100)}%` });
    }
  }
  empty.sort((a, b) => b.totalImpressions - a.totalImpressions);
  return { totalClusters: clusters.size, empty, underserved };
}

// ── Google Ads / Keyword Planner imports ────────────────────────────────

/** Keyword Planner downloads are UTF-16LE TSV; the Search terms report is UTF-8 CSV. */
export function decodeAdsExport(buf: Buffer): string {
  const isUtf16 = buf[0] === 0xff && buf[1] === 0xfe;
  return buf.toString(isUtf16 ? "utf16le" : "utf-8").replace(/^﻿/, "");
}

/** Exports start with title/summary rows: find the real header row, then parse. */
export function parseAdsCsv(content: string): Record<string, string>[] {
  const lines = content.split("\n");
  const headerNames = [
    "search term", "terme de recherche", "suchbegriff", // Search terms report
    "keyword", "mot clé", "mot cle", // Keyword Planner
  ];
  let header = lines.findIndex((l) => {
    const cells = l.toLowerCase().split(/[\t,]/).map((c) => c.replace(/["\r]/g, "").trim());
    return cells.length > 1 && cells.some((c) => headerNames.includes(c));
  });
  if (header === -1) header = lines.findIndex((l) => (l.includes(",") || l.includes("\t")) && !/^\d/.test(l));
  if (header === -1) header = 0;

  return parse(lines.slice(header).join("\n"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    delimiter: lines[header].includes("\t") ? "\t" : ",",
  });
}

const toInt = (value: unknown) => String(parseInt(String(value ?? "").replace(/[^\d]/g, ""), 10) || 0);
const first = (r: Record<string, string>, ...names: string[]) => names.map((n) => r[n]).find((v) => v !== undefined);

/** One CSV record -> Keywords Master row, in either export format; null when it has no term. */
export function normalizeRecord(record: Record<string, string>): Keyword | null {
  const kpTerm = first(record, "Keyword", "Mot clé", "Mot cle") ?? "";
  const kpVolume = first(
    record,
    "Avg. monthly searches",
    "Recherches mensuelles moyennes",
    "Recherches mensuelles moy.",
    "Durchschnittl. Suchanfragen pro Monat",
    "Durchschnittliche Suchanfragen pro Monat",
  );
  if (kpTerm.trim() && kpVolume !== undefined) {
    const bid =
      first(record, "Top of page bid (high range)", "Enchère haut de page (plage haute)", "Gebot für obere Positionen (oberer Bereich)") ?? "";
    return {
      term: kpTerm.toLowerCase().trim(),
      source: "keyword_planner",
      volume_estimate: toInt(kpVolume),
      cpc: bid.replace(/[^\d.,]/g, ""),
      status: "new",
    };
  }

  const term = first(record, "Search term", "Terme de recherche", "Suchbegriff") ?? "";
  if (!term.trim()) return null;
  return {
    term: term.toLowerCase().trim(),
    source: "google_ads",
    volume_estimate: toInt(first(record, "Impr.", "Impressions", "Impr") ?? "0"),
    ads_clicks: toInt(first(record, "Clicks", "Clics", "Klicks") ?? "0"),
    cpc: (first(record, "Avg. CPC", "CPC moy.", "Durchschn. CPC") ?? "").replace(/[^\d.,]/g, ""),
    status: "new",
  };
}
