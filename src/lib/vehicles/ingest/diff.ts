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

/**
 * Structural equality for Directus JSON columns. Object keys are compared
 * unordered, but arrays are compared element-by-element in order — a
 * reorder counts as a change. This matters for `images_urls`, where the
 * first element is the primary/thumbnail image, so a reordering is a real
 * change worth writing, not noise to ignore.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "number" && typeof b === "number") {
    // Directus round-trips numbers through JSON, which introduces float
    // noise (e.g. 1.7 becoming 1.7000000000000002) that is not a real data
    // change. Compare with a relative epsilon instead of `===` so this
    // noise doesn't register as a diff, while genuinely different
    // measurements (1.7 vs 1.8, 225 vs 230) still do. NaN correctly stays
    // unequal to itself: `Math.abs(NaN - NaN)` is NaN, and any comparison
    // against NaN is false.
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }

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

/**
 * Fields that must never, by themselves, cause a record to classify as
 * UPDATE. These are Directus columns holding scrape metadata rather than
 * vehicle data, so they legitimately differ on every single run:
 *
 * - `evdb_time_fetched` (from `metadata.parsed_at`) is the moment the
 *   scraper parsed the page. Even with perfect timestamp-format
 *   normalization it changes on every scrape by definition — treating it
 *   as an ordinary field would make every vehicle a permanent UPDATE and
 *   trip the change-ratio guard at 100% on every run.
 *
 * When a record IS being updated for some other, real reason, these
 * fields still appear in `changes` (and thus the PATCH body) so the value
 * stays current — they just can't be the *reason* a record is updated.
 */
export const NON_TRIGGERING_FIELDS: ReadonlySet<string> = new Set(["evdb_time_fetched"]);

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
    const allChanges: PlanEntry["changes"] = {};
    for (const [key, next] of Object.entries(candidate)) {
      if (!deepEqual(existing[key], next)) {
        allChanges[key] = { from: existing[key], to: next };
      }
    }

    // A diff limited to non-triggering fields (scrape metadata) is not a
    // real change — classify as UNCHANGED and report no changes at all.
    // But if there IS a real reason to update, non-triggering fields ride
    // along in `changes` so the PATCH refreshes them too.
    const hasTriggeringChange = Object.keys(allChanges).some(
      (key) => !NON_TRIGGERING_FIELDS.has(key),
    );
    const changes = hasTriggeringChange ? allChanges : {};

    entries.push({
      bucket: hasTriggeringChange ? "UPDATE" : "UNCHANGED",
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

/**
 * Bucket counts are per-entry, not per-vehicle: because the slug embeds
 * range/battery/model, most UPDATEs also emit a sibling SLUG_DRIFT entry
 * for the same evdb_id. Totals can therefore sum to more than
 * `plan.scrapeCount` — do not render them to a human as mutually exclusive
 * per-vehicle counts.
 */
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
