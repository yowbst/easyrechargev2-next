import { effectiveClassification } from "./publish-rule";
import type { CmsCompany } from "./types";

export interface CantonReport {
  canton: string;
  rows: number;
  installers: number;
  published: number;
  partners: number;
  enriched: number;
  gone: number;
  prospects: Record<string, number>;
}

/** Counts per canton from the CMS rows; archived-and-gone rows are counted apart. */
export function buildReport(rows: CmsCompany[], cantons?: string[]): CantonReport[] {
  const want = cantons?.length ? new Set(cantons) : null;
  const byCanton = new Map<string, CantonReport>();
  for (const r of rows) {
    const canton = String(r.canton ?? "??");
    if (want && !want.has(canton)) continue;
    const c =
      byCanton.get(canton) ??
      { canton, rows: 0, installers: 0, published: 0, partners: 0, enriched: 0, gone: 0, prospects: {} };
    byCanton.set(canton, c);
    if (r.status === "archived" && r.register_gone_at) {
      c.gone += 1;
      continue;
    }
    c.rows += 1;
    if (effectiveClassification(r) === "installer") c.installers += 1;
    if (r.status === "published") c.published += 1;
    if (r.partner) c.partners += 1;
    if (r.enrichment_status === "done") c.enriched += 1;
    const ps = String(r.prospect_status ?? "none");
    c.prospects[ps] = (c.prospects[ps] ?? 0) + 1;
  }
  return [...byCanton.values()].sort((a, b) => b.installers - a.installers || a.canton.localeCompare(b.canton));
}
