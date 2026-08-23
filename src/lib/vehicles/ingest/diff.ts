import { buildPayload } from "./fieldmap";
import { generateSlug } from "./clean";
import { indexByEvdbId } from "./queries";
import type {
  CmsVehicle,
  IngestPlan,
  PlanBucket,
  PlanEntry,
  ScrapedVehicle,
} from "./types";

/** Order-insensitive structural equality for Directus JSON columns. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

export function buildPlan(
  scraped: ScrapedVehicle[],
  cms: CmsVehicle[],
  opts: { sourceFile?: string; brandIds?: Map<string, string> } = {},
): IngestPlan {
  const cmsIndex = indexByEvdbId(cms);
  const entries: PlanEntry[] = [];
  const seen = new Set<string>();

  for (const row of scraped) {
    const evdbId = String(row.evdb_id);
    seen.add(evdbId);

    const existing = cmsIndex.get(evdbId);
    const brandId = opts.brandIds?.get(String(row.make_slug)) ?? null;

    if (!existing) {
      entries.push({
        bucket: "CREATE",
        evdbId,
        slug: generateSlug(row),
        changes: {},
        payload: buildPayload(row, { isCreate: true, brandId }),
      });
      continue;
    }

    const candidate = buildPayload(row, { isCreate: false, brandId });
    const changes: PlanEntry["changes"] = {};
    for (const [key, next] of Object.entries(candidate)) {
      if (!deepEqual(existing[key], next)) {
        changes[key] = { from: existing[key], to: next };
      }
    }

    entries.push({
      bucket: Object.keys(changes).length ? "UPDATE" : "UNCHANGED",
      evdbId,
      slug: existing.slug,
      cmsId: existing.id,
      changes,
    });

    // Slug is frozen; drift is reported as its own entry, never applied.
    // Pushed after the primary entry so plan order always surfaces the
    // CREATE/UPDATE/UNCHANGED classification first.
    const generated = generateSlug(row);
    if (generated !== existing.slug) {
      entries.push({
        bucket: "SLUG_DRIFT",
        evdbId,
        slug: existing.slug,
        cmsId: existing.id,
        changes: {},
        generatedSlug: generated,
      });
    }
  }

  for (const row of cms) {
    if (row.evdb_id && !seen.has(String(row.evdb_id))) {
      entries.push({
        bucket: "GONE",
        evdbId: String(row.evdb_id),
        slug: row.slug,
        cmsId: row.id,
        changes: {},
      });
    }
  }

  return {
    createdAt: new Date().toISOString(),
    sourceFile: opts.sourceFile ?? "",
    cmsCount: cms.length,
    scrapeCount: scraped.length,
    entries,
    completed: [],
  };
}

export function summarize(plan: IngestPlan): Record<PlanBucket, number> {
  const out: Record<PlanBucket, number> = {
    CREATE: 0,
    UPDATE: 0,
    SLUG_DRIFT: 0,
    GONE: 0,
    UNCHANGED: 0,
  };
  for (const e of plan.entries) out[e.bucket] += 1;
  return out;
}

/** Refuses plans that look like a broken scrape rather than a real change. */
export function assertPlanSane(
  plan: IngestPlan,
  opts: { minScrapeRatio?: number; maxChangeRatio?: number } = {},
): void {
  const minScrapeRatio = opts.minScrapeRatio ?? 0.8;
  const maxChangeRatio = opts.maxChangeRatio ?? 0.3;

  if (plan.cmsCount > 0) {
    const ratio = plan.scrapeCount / plan.cmsCount;
    if (ratio < minScrapeRatio) {
      throw new Error(
        `Scrape returned ${plan.scrapeCount} rows against ${plan.cmsCount} in the CMS ` +
          `(${(ratio * 100).toFixed(0)}%, floor ${(minScrapeRatio * 100).toFixed(0)}%). ` +
          `This looks like a failed scrape, not a shrinking market.`,
      );
    }
  }

  const s = summarize(plan);
  const mutating = s.CREATE + s.UPDATE;
  if (plan.cmsCount > 0) {
    const ratio = mutating / plan.cmsCount;
    if (ratio > maxChangeRatio) {
      throw new Error(
        `Plan change ratio ${(ratio * 100).toFixed(0)}% exceeds the ` +
          `${(maxChangeRatio * 100).toFixed(0)}% ceiling ` +
          `(${s.CREATE} creates, ${s.UPDATE} updates). ` +
          `Re-run with --max-change-ratio to override if this is intentional.`,
      );
    }
  }
}
