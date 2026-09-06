import type { PartnerArea, DispatchTarget, LeadCategory , GiftReason } from "./types";

interface ResolvedArea {
  area: PartnerArea;
  effectivePriority: number;
  effectiveQuota: number;
  used: number;
  overQuota: boolean;
}

export interface SkippedDedupEntry {
  partnerId: string;
  partnerSlug: string;
  mode: "exclusive" | "shared";
}

export interface ResolverResult {
  targets: DispatchTarget[];
  reasons: string[];
  skippedDedup: SkippedDedupEntry[];
}

export interface ResolverInput {
  areas: PartnerArea[];
  quotaUsed: Map<string, number>;
  maxSharedTargets: number;
  leadCategory: LeadCategory;
  partnerPrices: Map<string, Map<string, number>>;
  /** Partner IDs to skip with status `skipped_dedup`. */
  dedupPartnerIds: Set<string>;
}

/**
 * Pure decision function: given candidate partner_areas for a canton + quota
 * map + pricing + dedup set, return the list of dispatch targets.
 *
 * Algorithm:
 *   1. Filter to active partners; route dedup'd partners to skippedDedup.
 *   2. Compute used + overQuota per area.
 *   3. Exclusive branch: pick the single exclusive partner regardless of quota
 *      (over-quota → gift).
 *   4. Shared branch: rank by (used ASC, priority ASC, id ASC), take top N.
 *      Over-quota partners still dispatch as gifts.
 *   5. For each target, snapshot price_chf from partnerPrices[partnerId][leadCategory].
 *      Missing entry or price=0 → priceChf=null, gift=true (loud log).
 */
export function resolveDispatchTargets(input: ResolverInput): ResolverResult {
  const { areas, quotaUsed, maxSharedTargets, leadCategory, partnerPrices, dedupPartnerIds } =
    input;
  const reasons: string[] = [];
  const skippedDedup: SkippedDedupEntry[] = [];

  const eligible: PartnerArea[] = [];
  for (const a of areas) {
    if (a.partner?.status !== "active") continue;
    if (dedupPartnerIds.has(a.partner.id)) {
      skippedDedup.push({
        partnerId: a.partner.id,
        partnerSlug: a.partner.slug,
        mode: a.mode,
      });
      continue;
    }
    eligible.push(a);
  }

  const enriched: ResolvedArea[] = eligible.map((a) => {
    const effectivePriority = a.priority_override ?? a.partner.priority ?? 100;
    const effectiveQuota = a.quota_override ?? a.partner.monthly_quota ?? 0;
    const used = quotaUsed.get(a.partner.id) ?? 0;
    const overQuota = effectiveQuota > 0 && used >= effectiveQuota;
    return { area: a, effectivePriority, effectiveQuota, used, overQuota };
  });

  // Exclusive branch: at most one wins. Over-quota still dispatches as gift.
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
    return {
      targets: [toTarget(exclusive, "exclusive", leadCategory, partnerPrices)],
      reasons,
      skippedDedup,
    };
  }

  // Shared branch: rank, take top N. Over-quota still wins (gift).
  const sharedAll = enriched
    .filter((e) => e.area.mode === "shared")
    .sort(
      (a, b) =>
        a.used - b.used ||
        a.effectivePriority - b.effectivePriority ||
        a.area.partner.id.localeCompare(b.area.partner.id),
    );

  const sharedTargets = sharedAll
    .slice(0, Math.max(0, maxSharedTargets))
    .map((e) => toTarget(e, "shared", leadCategory, partnerPrices));

  if (sharedTargets.length === 0 && enriched.length === 0) {
    reasons.push("no_partner_for_canton");
  }

  return { targets: sharedTargets, reasons, skippedDedup };
}

function toTarget(
  e: ResolvedArea,
  modeUsed: "exclusive" | "shared",
  leadCategory: LeadCategory,
  partnerPrices: Map<string, Map<string, number>>,
): DispatchTarget {
  const p = e.area.partner;
  const priceLookup = partnerPrices.get(p.id);
  const rawPrice = priceLookup?.get(leadCategory);
  // Gift if: over quota OR no price row OR price is 0. Quota is checked first
  // because it is the legitimate case; the other two are configuration gaps.
  const missingPrice = rawPrice === undefined || rawPrice === null;
  const giftReason: GiftReason | null = e.overQuota
    ? "quota_exceeded"
    : missingPrice
      ? "no_price_row"
      : rawPrice === 0
        ? "price_zero"
        : null;
  const gift = giftReason !== null;
  const priceChf = gift ? null : (rawPrice as number);

  if (rawPrice === undefined) {
    console.warn(
      `[dispatch] No partner_lead_prices row for partner=${p.slug} category=${leadCategory} — dispatched as gift`,
    );
  }

  return {
    partnerSlug: p.slug,
    displayName: p.name,
    email: p.notification_email,
    language: p.language,
    mode: modeUsed,
    billableRate:
      typeof p.billable_rate === "number"
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
    dashboardToken: p.dashboard_token ?? null,
    priceChf,
    leadCategory,
    gift,
    giftReason,
  };
}

/** Internal helper exposed for orchestrator: map resolved targets back to partner_areas (for ledger writes). */
export function targetToArea(
  target: DispatchTarget,
  areas: PartnerArea[],
): PartnerArea | undefined {
  return areas.find((a) => a.partner.slug === target.partnerSlug);
}
