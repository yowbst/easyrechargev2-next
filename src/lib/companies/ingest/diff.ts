import { computeStatus } from "./publish-rule";
import type {
  ClassifiedCompany,
  CmsCompany,
  CompanyPlan,
  CompanyStatus,
  PlanBucket,
  PlanEntry,
} from "./types";

/** Fields that never count as a change by themselves; they ride along when a row is written anyway. */
export const NON_TRIGGERING_FIELDS: ReadonlySet<string> = new Set([
  "register_seen_at",
  "pipeline_updated_at",
  // Directus rewrites timestamp formats on the way back; a real reclassification
  // changes the label fields too, so this one never needs to trigger on its own.
  "classified_at",
]);

/**
 * Equality that survives Directus round-trips. Decimal columns come back as
 * strings ("46.585354") and nulls as null or undefined; without this every
 * geocoded row would be a permanent UPDATE.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  if (empty(a) || empty(b)) return empty(a) && empty(b);
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  const na = num(a);
  const nb = num(b);
  if ((typeof a === "number" || typeof b === "number") && Number.isFinite(na) && Number.isFinite(nb)) {
    return Math.abs(na - nb) <= 1e-9 * Math.max(1, Math.abs(na), Math.abs(nb));
  }
  return a === b;
}

export interface PlanOptions {
  sourceFile?: string;
  /** normalised UID -> partners.id, production partners only */
  partnerByUid?: Map<string, string>;
  /** Cantons this run covered. GONE is only judged inside them. */
  scopeCantons?: string[];
  now?: string;
}

/** Register + classification fields written on every run. */
const REGISTER_FIELDS = [
  "uid", "chid", "register_url", "legal_name", "purpose_text", "purpose_hash",
  "legal_form_code", "legal_form_kind", "in_liquidation", "street_address",
  "postal_code", "locality", "canton", "bfs_id", "lat", "lng", "geo_source",
] as const;
const CLASSIFICATION_FIELDS = [
  "classification", "classification_confidence", "classification_reason",
  "classification_model", "classified_at", "classified_purpose_hash",
] as const;

const isGone = (r: CmsCompany) => r.status === "archived" && !!r.register_gone_at;

function flip(from: CompanyStatus | null | undefined, to: CompanyStatus): PlanEntry["statusFlip"] {
  if (from !== "published" && to === "published") return "PUBLISH";
  if (from === "published" && to !== "published") return "UNPUBLISH";
  return undefined;
}

export function buildCompanyPlan(
  classified: ClassifiedCompany[],
  cms: CmsCompany[],
  opts: PlanOptions = {},
): CompanyPlan {
  const now = opts.now ?? new Date().toISOString();
  const scope = opts.scopeCantons?.length ? new Set(opts.scopeCantons) : null;
  const inScope = (r: CmsCompany) => !scope || (r.canton !== null && scope.has(r.canton));
  const cmsByEhraid = new Map(cms.map((r) => [String(r.ehraid), r]));
  const entries: PlanEntry[] = [];
  const seen = new Set<string>();

  for (const c of classified) {
    seen.add(c.ehraid);
    const existing = cmsByEhraid.get(c.ehraid);
    const partnerId = (c.uid && opts.partnerByUid?.get(c.uid)) || null;
    const reappeared = !!existing && isGone(existing);

    const effectiveStatus = computeStatus({
      classification: c.classification,
      confidence: c.classification_confidence,
      override: existing?.classification_override ?? null,
      inLiquidation: c.in_liquidation,
      doNotDisplay: !!existing?.do_not_display,
      gone: false,
    });
    // A company back from the dead is reviewed before it is shown again.
    const status: CompanyStatus = reappeared ? "draft" : effectiveStatus;

    const candidate: Record<string, unknown> = { status, partner: partnerId };
    for (const f of REGISTER_FIELDS) candidate[f] = c[f];
    for (const f of CLASSIFICATION_FIELDS) candidate[f] = c[f];

    if (!existing) {
      entries.push({
        bucket: "CREATE",
        ehraid: c.ehraid,
        legalName: c.legal_name,
        canton: c.canton,
        classification: c.classification,
        statusFlip: flip(null, status),
        changes: {},
        payload: {
          ehraid: c.ehraid,
          ...candidate,
          partner_linked_at: partnerId ? now : null,
          register_first_seen_at: now,
          register_seen_at: now,
          register_gone_at: null,
          pipeline_updated_at: now,
        },
      });
      continue;
    }

    if (reappeared) candidate.register_gone_at = null;
    if ((existing.partner ?? null) !== partnerId) candidate.partner_linked_at = partnerId ? now : null;

    const all: PlanEntry["changes"] = {};
    for (const [key, next] of Object.entries(candidate)) {
      if (!sameValue(existing[key], next)) all[key] = { from: existing[key] ?? null, to: next };
    }
    const triggering = Object.keys(all).some((k) => !NON_TRIGGERING_FIELDS.has(k));
    let changes: PlanEntry["changes"] = {};
    if (triggering) {
      changes = {
        ...all,
        register_seen_at: { from: existing.register_seen_at ?? null, to: now },
        pipeline_updated_at: { from: existing.pipeline_updated_at ?? null, to: now },
      };
    }

    const bucket: PlanBucket = reappeared ? "REAPPEARED" : triggering ? "UPDATE" : "UNCHANGED";
    entries.push({
      bucket,
      ehraid: c.ehraid,
      legalName: c.legal_name,
      canton: c.canton,
      cmsId: existing.id,
      classification: c.classification,
      statusFlip: triggering ? flip(existing.status, status) : undefined,
      changes: bucket === "REAPPEARED" && !triggering ? all : changes,
    });
  }

  // In the CMS but absent from this run's candidates: struck off, or the purpose
  // no longer matches the installer pattern. Either way it must stop being shown.
  let cmsCount = 0;
  for (const r of cms) {
    if (!inScope(r) || isGone(r)) continue;
    cmsCount += 1;
    if (seen.has(String(r.ehraid))) continue;
    entries.push({
      bucket: "GONE",
      ehraid: String(r.ehraid),
      legalName: String(r.legal_name ?? ""),
      canton: String(r.canton ?? ""),
      cmsId: r.id,
      statusFlip: flip(r.status, "archived"),
      changes: {
        status: { from: r.status, to: "archived" },
        register_gone_at: { from: r.register_gone_at ?? null, to: now },
        pipeline_updated_at: { from: r.pipeline_updated_at ?? null, to: now },
      },
    });
  }

  return {
    createdAt: now,
    sourceFile: opts.sourceFile ?? "",
    cmsCount,
    candidateCount: classified.length,
    scopeCantons: scope ? [...scope] : undefined,
    entries,
    completed: [],
  };
}

export interface PlanSummary {
  buckets: Record<PlanBucket, number>;
  publish: number;
  unpublish: number;
  createsByCanton: Record<string, number>;
  classification: Record<string, number>;
}

export function summarize(plan: CompanyPlan): PlanSummary {
  const buckets: Record<PlanBucket, number> = { CREATE: 0, UPDATE: 0, GONE: 0, REAPPEARED: 0, UNCHANGED: 0 };
  const createsByCanton: Record<string, number> = {};
  const classification: Record<string, number> = {};
  let publish = 0;
  let unpublish = 0;
  for (const e of plan.entries) {
    buckets[e.bucket] += 1;
    if (e.statusFlip === "PUBLISH") publish += 1;
    if (e.statusFlip === "UNPUBLISH") unpublish += 1;
    if (e.bucket === "CREATE") {
      createsByCanton[e.canton] = (createsByCanton[e.canton] ?? 0) + 1;
      classification[e.classification ?? "unclassified"] = (classification[e.classification ?? "unclassified"] ?? 0) + 1;
    }
  }
  return { buckets, publish, unpublish, createsByCanton, classification };
}

/** Refuses plans that look like a broken fetch or a mis-pointed input rather than a real refresh. */
export function assertPlanSane(
  plan: CompanyPlan,
  opts: { minCandidateRatio?: number; maxChangeRatio?: number; partial?: boolean } = {},
): void {
  if (opts.maxChangeRatio !== undefined && !Number.isFinite(opts.maxChangeRatio)) {
    throw new Error(`assertPlanSane: maxChangeRatio must be a finite number, got ${opts.maxChangeRatio}.`);
  }
  const maxChangeRatio = opts.maxChangeRatio ?? 0.3;
  const minCandidateRatio = opts.minCandidateRatio ?? 0.8;

  const invalid = plan.entries.filter(
    (e) => e.bucket === "CREATE" && (!e.payload?.ehraid || !e.payload?.legal_name || !e.payload?.canton),
  );
  if (invalid.length > 0) {
    throw new Error(
      `${invalid.length} CREATE entries lack ehraid, legal_name or canton, e.g. ${invalid[0].legalName || invalid[0].ehraid}. ` +
        `This usually means "plan" was pointed at a raw fetch instead of a classified file.`,
    );
  }
  const unclassified = plan.entries.filter((e) => e.bucket === "CREATE" && e.classification === "unclassified").length;
  const creates = plan.entries.filter((e) => e.bucket === "CREATE").length;
  if (creates > 0 && unclassified === creates) {
    throw new Error(`All ${creates} CREATE entries are unclassified. Run "classify" before "plan".`);
  }

  if (plan.cmsCount > 0 && !opts.partial && !plan.scopeCantons) {
    const ratio = plan.candidateCount / plan.cmsCount;
    if (ratio < minCandidateRatio) {
      throw new Error(
        `This run found ${plan.candidateCount} candidates against ${plan.cmsCount} live rows in the CMS ` +
          `(${(ratio * 100).toFixed(0)}%, floor ${(minCandidateRatio * 100).toFixed(0)}%). ` +
          `A truncated fetch looks exactly like this: check the raw file. ` +
          `If the drop is real, re-run with --partial; the change-ratio ceiling stays armed.`,
      );
    }
  }

  if (plan.cmsCount > 0) {
    const s = summarize(plan);
    const ratio = (s.buckets.CREATE + s.buckets.UPDATE) / plan.cmsCount;
    if (ratio > maxChangeRatio) {
      throw new Error(
        `Plan change ratio ${(ratio * 100).toFixed(0)}% exceeds the ${(maxChangeRatio * 100).toFixed(0)}% ceiling ` +
          `(${s.buckets.CREATE} creates, ${s.buckets.UPDATE} updates). ` +
          `Re-run with --max-change-ratio if this is intentional (for example after a model change).`,
      );
    }
  }
}
