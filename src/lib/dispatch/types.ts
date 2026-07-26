export type DispatchMode = "off" | "shadow" | "live";

export type PartnerStatus = "active" | "paused";
export type AreaMode = "exclusive" | "shared";
export type Language = "fr" | "de";
export type Environment = "development" | "staging" | "production";

export type DispatchStatus =
  | "dispatched"
  | "skipped_quota" // retained for back-compat reads; new rows never use this
  | "skipped_no_partner"
  | "skipped_test"
  | "skipped_dedup";

export type LegalForm = "corporation" | "llc" | "gp" | "sp";

export type LeadCategory =
  | "owner_no_solar"
  | "owner_solar"
  | "co_owner_no_solar"
  | "co_owner_solar"
  | "tenant_no_solar"
  | "tenant_solar";

export type DispatchStage =
  | "new"
  | "contacted"
  | "appointment"
  | "quote_sent"
  | "won"
  | "lost";

export type DisqualificationReason =
  | "already_known"
  | "wrong_contact_info"
  | "unreachable"
  | "not_interested"
  | "ghosted"
  | "out_of_area"
  | "project_cancelled"
  | "competitor"
  | "long_timeframe"
  | "no_authorization"
  | "other";

/**
 * Why a partner lost a lead they engaged. Distinct from a disqualification:
 * a Lost lead was real and worked, so it stays billable (partner's commercial
 * risk). Captured when marking a lead "Perdu" from an engaged stage.
 */
export type LostReason =
  | "competitor"
  | "not_interested"
  | "ghosted"
  | "price"
  | "postponed"
  | "other";

export const LOST_REASONS: LostReason[] = [
  "competitor",
  "not_interested",
  "ghosted",
  "price",
  "postponed",
  "other",
];

export const DISPATCH_STAGES: DispatchStage[] = [
  "new",
  "contacted",
  "appointment",
  "quote_sent",
  "won",
  "lost",
];

/**
 * Funnel rank. Won and Lost share rank 4 — both are terminal outcomes; partners
 * may swap between them after the fact. Moving to a strictly lower rank is
 * disallowed (you can't un-quote a lead).
 */
export const STAGE_RANK: Record<DispatchStage, number> = {
  new: 0,
  contacted: 1,
  appointment: 2,
  quote_sent: 3,
  won: 4,
  lost: 4,
};

export function canMoveStage(
  from: DispatchStage,
  to: DispatchStage,
): boolean {
  return STAGE_RANK[to] >= STAGE_RANK[from];
}

export const DISQUALIFICATION_REASONS: DisqualificationReason[] = [
  "already_known",
  "wrong_contact_info",
  "unreachable",
  "not_interested",
  "ghosted",
  "out_of_area",
  "project_cancelled",
  "competitor",
  "long_timeframe",
  "no_authorization",
  "other",
];

export const LEAD_CATEGORIES: LeadCategory[] = [
  "owner_no_solar",
  "owner_solar",
  "co_owner_no_solar",
  "co_owner_solar",
  "tenant_no_solar",
  "tenant_solar",
];

export interface Canton {
  id: string;
  code: string;
  is_active: boolean;
}

export interface Partner {
  id: string;
  status: PartnerStatus;
  name: string;
  slug: string;
  notification_email: string;
  monthly_quota: number;
  priority: number;
  language: Language;
  billable_rate: number;
  environment: Environment;
  // Business identification (administrative metadata).
  business_name?: string | null;
  legal_form?: LegalForm | null;
  uid?: string | null;
  street_name?: string | null;
  street_number?: string | null;
  postal_code?: string | null;
  locality?: string | null;
  canton?: { id: string; code: string } | null;
  // Dashboard auth + per-partner billing overrides.
  dashboard_token?: string | null;
  disqualification_overrides?: Record<string, number> | null;
  // Per-partner lead-scoring weight overrides (factor key → weight). Merged
  // over DEFAULT_SCORING_WEIGHTS; absent ⇒ defaults.
  lead_scoring_weights?: Record<string, number> | null;
  // Pricing policy (M2O). Multiple partners can share one policy. The
  // `settings` JSON holds the price matrix (and any future per-policy knobs).
  pricing_policy?: {
    id: string;
    name?: string;
    settings?: PricingPolicySettings | null;
  } | string | null;
}

export interface PricingPolicySettings {
  /** Per-product price matrix: prices[product][category] = CHF. */
  prices?: Record<string, Record<string, number>>;
  // Reserved for future knobs (canton overrides, monthly caps, etc.).
  [key: string]: unknown;
}

export interface TargetAddress {
  streetName: string | null;
  streetNumber: string | null;
  postalCode: string | null;
  locality: string | null;
  canton: string | null; // 2-letter code of the partner's HQ canton
}

export interface PartnerArea {
  id: string;
  partner: Partner;
  canton: Canton;
  mode: AreaMode;
  priority_override: number | null;
  quota_override: number | null;
}

export interface DispatchContext {
  submissionId: string;
  canton: string;
  locale: Language;
  environment: Environment;
  isTest: boolean;
  product: string;
}

export interface DispatchTarget {
  partnerSlug: string;
  displayName: string;
  email: string;
  language: Language;
  mode: AreaMode;
  billableRate: number;
  // Business identification — surfaced so Make can render partner-facing
  // documents (contracts, invoice references) or pass to downstream CRM
  // without a second Directus round-trip.
  businessName: string | null;
  legalForm: LegalForm | null;
  uid: string | null;
  address: TargetAddress;
  // Partner dashboard credential — surfaced so the webhook can build the
  // partner's CRM URL. Null when the partner has no token.
  dashboardToken: string | null;
  // Lead pricing snapshot (resolved at dispatch time).
  priceChf: number | null; // null = gift
  leadCategory: LeadCategory;
  gift: boolean;
}

export interface DispatchSummary {
  resolved: number;
  dispatched: number;
  skipped: number;
  /** Subset of `skipped` attributable to dedup (same email + same partner recently). */
  skippedDedup: number;
  reasons: string[];
}

export interface DispatchDedupInfo {
  skippedPartnerSlugs: string[];
  windowDays: number;
}

export interface DispatchResult {
  mode: DispatchMode;
  canton: string;
  isTest: boolean;
  billableRate: number | null;
  summary: DispatchSummary;
  targets: DispatchTarget[];
  dedup: DispatchDedupInfo;
}
