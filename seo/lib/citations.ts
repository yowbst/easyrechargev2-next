export interface Prompt {
  id: number;
  text: string;
}

/** Numbered lines (`12. Question ?`) of the frozen prompt file; headings and prose are ignored. */
export function parsePrompts(markdown: string): Prompt[] {
  return markdown
    .split("\n")
    .map((line) => line.match(/^(\d+)\.\s+(.+?)\s*$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ id: Number(m[1]), text: m[2] }));
}

export interface CitedSource {
  url?: string | null;
  domain?: string | null;
}

export interface CitationSummary {
  cited_domains: string;
  easyrecharge_cited: "yes" | "no";
  /** 1-based position of the first easyrecharge.ch source among the cited sources; empty when not cited. */
  rank: number | "";
}

const host = (s: CitedSource): string => {
  const raw = s.domain || s.url || "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.replace(/^www\./, "").toLowerCase();
  }
};

/** Reduces an answer's cited sources to the three columns of the AI Citations tab. */
export function summarizeSources(sources: CitedSource[] | null | undefined, ownDomain = "easyrecharge.ch"): CitationSummary {
  const domains = [...new Set((sources ?? []).map(host).filter(Boolean))];
  const idx = domains.findIndex((d) => d === ownDomain || d.endsWith(`.${ownDomain}`));
  return {
    cited_domains: domains.join(", "),
    easyrecharge_cited: idx >= 0 ? "yes" : "no",
    rank: idx >= 0 ? idx + 1 : "",
  };
}

export interface ScraperResult {
  sources?: unknown[] | null;
  search_results?: unknown[] | null;
  fan_out_queries?: string[] | null;
}

/** Did the assistant search the web for this answer? When it did not, there is nothing to cite. */
export function didSearch(result: ScraperResult | null | undefined): "yes" | "no" {
  const any = (result?.sources?.length ?? 0) + (result?.search_results?.length ?? 0) + (result?.fan_out_queries?.length ?? 0);
  return any > 0 ? "yes" : "no";
}

/**
 * Share of answers that searched and cited `domain`, per engine. Reads the
 * `cited_domains` column, so it works on fresh rows and on rows read back from the Sheet.
 */
export function citationShare(
  rows: { engine: string | number; searched: string | number; cited_domains: string | number }[],
  domain: string,
): Record<string, { cited: number; searched: number }> {
  const out: Record<string, { cited: number; searched: number }> = {};
  for (const r of rows) {
    if (r.searched !== "yes") continue;
    const e = String(r.engine);
    out[e] ??= { cited: 0, searched: 0 };
    out[e].searched++;
    const domains = String(r.cited_domains).split(",").map((d) => d.trim());
    if (domains.some((d) => d === domain || d.endsWith(`.${domain}`))) out[e].cited++;
  }
  return out;
}
