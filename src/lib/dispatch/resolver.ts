import type { PartnerArea, DispatchTarget } from "./types";

interface ResolvedArea {
  area: PartnerArea;
  effectivePriority: number;
  effectiveQuota: number;
  used: number;
  remaining: number;
}

export interface SkippedQuotaEntry {
  partnerId: string;
  partnerSlug: string;
  mode: "exclusive" | "shared";
}

export interface ResolverResult {
  targets: DispatchTarget[];
  reasons: string[];
  skippedQuota: SkippedQuotaEntry[];
}

/**
 * Pure decision function: given the candidate partner_areas for a canton and
 * a quota lookup, return the list of dispatch targets.
 *
 * Algorithm (matches plan Phase 2):
 *   1. Filter to active partners (defensive — query already filters).
 *   2. Compute effective quota and remaining per area.
 *   3. Exclusive branch: if an exclusive area exists with remaining > 0, return it.
 *      If exhausted, fall through to shared branch.
 *   4. Shared branch: rank by (used ASC, priority ASC, id ASC), take top N.
 *   5. Empty result is fine — the orchestrator records `skipped_no_partner`.
 */
export function resolveDispatchTargets(
  areas: PartnerArea[],
  quotaUsed: Map<string, number>,
  maxSharedTargets: number,
): ResolverResult {
  const reasons: string[] = [];
  const skippedQuota: SkippedQuotaEntry[] = [];

  // 1 + 2: enrich with quota math, filter active.
  const enriched: ResolvedArea[] = areas
    .filter((a) => a.partner?.status === "active")
    .map((a) => {
      const effectivePriority =
        a.priority_override ?? a.partner.priority ?? 100;
      const effectiveQuota =
        a.quota_override ?? a.partner.monthly_quota ?? 0;
      const used = quotaUsed.get(a.partner.id) ?? 0;
      const remaining = effectiveQuota === 0 ? Infinity : effectiveQuota - used;
      return { area: a, effectivePriority, effectiveQuota, used, remaining };
    });

  // 3: exclusive branch.
  const exclusives = enriched.filter((e) => e.area.mode === "exclusive");
  if (exclusives.length > 1) {
    console.warn(
      `[dispatch] More than one exclusive partner_area for canton (${exclusives.length}); picking lowest priority deterministically.`,
    );
  }
  exclusives.sort(
    (a, b) =>
      a.effectivePriority - b.effectivePriority ||
      a.area.partner.id.localeCompare(b.area.partner.id),
  );
  const exclusive = exclusives[0];

  if (exclusive) {
    if (exclusive.remaining > 0) {
      return {
        targets: [toTarget(exclusive, "exclusive")],
        reasons,
        skippedQuota,
      };
    }
    reasons.push("exclusive_over_quota");
    skippedQuota.push({
      partnerId: exclusive.area.partner.id,
      partnerSlug: exclusive.area.partner.slug,
      mode: "exclusive",
    });
  }

  // 4: shared branch.
  const sharedAll = enriched.filter((e) => e.area.mode === "shared");
  for (const e of sharedAll) {
    if (e.remaining <= 0) {
      skippedQuota.push({
        partnerId: e.area.partner.id,
        partnerSlug: e.area.partner.slug,
        mode: "shared",
      });
    }
  }
  const sharedCandidates = sharedAll
    .filter((e) => e.remaining > 0)
    .sort(
      (a, b) =>
        a.used - b.used ||
        a.effectivePriority - b.effectivePriority ||
        a.area.partner.id.localeCompare(b.area.partner.id),
    );

  const sharedTargets = sharedCandidates
    .slice(0, Math.max(0, maxSharedTargets))
    .map((e) => toTarget(e, "shared"));

  if (sharedTargets.length === 0 && enriched.length === 0) {
    reasons.push("no_partner_for_canton");
  } else if (sharedTargets.length === 0 && exclusive) {
    // Exclusive was exhausted and no shared fallback available — still treat as a coverage event.
    reasons.push("no_partner_for_canton");
  }

  return { targets: sharedTargets, reasons, skippedQuota };
}

function toTarget(e: ResolvedArea, modeUsed: "exclusive" | "shared"): DispatchTarget {
  const p = e.area.partner;
  return {
    partnerSlug: p.slug,
    displayName: p.name,
    email: p.notification_email,
    language: p.language,
    mode: modeUsed,
    billableRate: typeof p.billable_rate === "number"
      ? p.billable_rate
      : parseFloat(String(p.billable_rate ?? "1")),
    businessName: p.business_name ?? null,
    legalForm: p.legal_form ?? null,
    uid: p.uid ?? null,
    address: {
      streetName: p.street_name ?? null,
      streetNumber: p.street_number ?? null,
      postalCode: p.postal_code ?? null,
      locality: p.locality ?? null,
      canton: p.canton?.code ?? null,
    },
  };
}

/** Internal helper exposed for orchestrator: map resolved targets back to partner_areas (for ledger writes). */
export function targetToArea(
  target: DispatchTarget,
  areas: PartnerArea[],
): PartnerArea | undefined {
  return areas.find((a) => a.partner.slug === target.partnerSlug);
}
