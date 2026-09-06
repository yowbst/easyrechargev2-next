import { directusFetch } from "@/lib/directus";
import type {
  Environment,
  PartnerArea,
  DispatchStatus,
  AreaMode,
  DispatchStage,
  LeadCategory,
  GiftReason,
} from "./types";

const PARTNER_AREA_FIELDS = [
  "id",
  "mode",
  "priority_override",
  "quota_override",
  "canton.id",
  "canton.code",
  "canton.is_active",
  "partner.id",
  "partner.status",
  "partner.name",
  "partner.slug",
  "partner.notification_email",
  "partner.monthly_quota",
  "partner.priority",
  "partner.language",
  "partner.billable_rate",
  "partner.environment",
  // Business identification (sent in dispatch.targets[]).
  "partner.business_name",
  "partner.legal_form",
  "partner.uid",
  "partner.street_name",
  "partner.street_number",
  "partner.postal_code",
  "partner.locality",
  "partner.canton.id",
  "partner.canton.code",
  // Dashboard auth + per-partner billing overrides.
  "partner.dashboard_token",
  "partner.disqualification_overrides",
  // Pricing policy (multiple partners can share one policy). The settings JSON
  // holds the per-product, per-category price matrix.
  "partner.pricing_policy.id",
  "partner.pricing_policy.name",
  "partner.pricing_policy.settings",
].join(",");

/**
 * Fetch partner_areas for a canton, joined with their partner and the canton row.
 * Filters out paused partners, partners outside the current environment, and
 * inactive cantons (canton.is_active = false treats the canton as not-dispatchable,
 * matching the existing convention used by fetchCantonCoats for LI).
 */
export async function fetchPartnerAreasForCanton(
  cantonCode: string,
  environment: Environment,
): Promise<PartnerArea[]> {
  const params = new URLSearchParams();
  params.set("fields", PARTNER_AREA_FIELDS);
  params.set("filter[canton][code][_eq]", cantonCode);
  params.set("filter[canton][is_active][_eq]", "true");
  params.set("filter[partner][status][_eq]", "active");
  params.set("filter[partner][environment][_eq]", environment);
  params.set("filter[status][_eq]", "published");
  params.set("limit", "100");

  const res = await directusFetch<{ data: PartnerArea[] }>(
    `/items/partner_areas?${params}`,
    { next: { revalidate: 0 } },
  );
  return res?.data ?? [];
}

/**
 * Count `dispatched` ledger rows for the given partners in the current UTC month.
 * One Directus call, grouped by partner.
 */
export async function countDispatchesThisMonth(
  partnerIds: string[],
  environment: Environment,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (partnerIds.length === 0) return counts;

  const params = new URLSearchParams();
  params.set("aggregate[count]", "id");
  params.set("groupBy", "partner");
  params.set("filter[month_bucket][_eq]", currentMonthBucket());
  params.set("filter[status][_eq]", "dispatched");
  params.set("filter[environment][_eq]", environment);
  params.set("filter[partner][_in]", partnerIds.join(","));

  type Row = { partner: string; count: { id: string | number } };
  const res = await directusFetch<{ data: Row[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );
  for (const row of res?.data ?? []) {
    const n = typeof row.count?.id === "string" ? parseInt(row.count.id, 10) : (row.count?.id ?? 0);
    if (row.partner) counts.set(row.partner, n);
  }
  return counts;
}

export interface RecordDispatchInput {
  submission: string;
  partner: string;
  canton: string;
  mode_used: AreaMode;
  status: DispatchStatus;
  environment: Environment;
  // Product key (e.g. "ecp" for EV charging projects). Defaults to "ecp"
  // when not provided so older callers keep working.
  product?: string;
  // Lifecycle + pricing snapshot (only written when status === "dispatched").
  stage?: DispatchStage;
  price_chf?: number | null;
  lead_category?: LeadCategory | null;
  gift?: boolean;
  gift_reason?: GiftReason | null;
}

/** Insert one `partner_dispatches` row. Returns the created row id when available. */
export async function recordDispatch(input: RecordDispatchInput): Promise<string | null> {
  const now = new Date().toISOString();
  const body: Record<string, unknown> = {
    submission: input.submission,
    partner: input.partner,
    canton: input.canton,
    mode_used: input.mode_used,
    status: input.status,
    environment: input.environment,
    product: input.product ?? "ecp",
    month_bucket: currentMonthBucket(),
    dispatched_at: now,
  };
  if (input.status === "dispatched") {
    const stage: DispatchStage = input.stage ?? "new";
    body.stage = stage;
    body.stage_entered_at = now;
    body.price_chf = input.price_chf ?? null;
    body.lead_category = input.lead_category ?? null;
    body.gift = Boolean(input.gift);
    body.gift_reason = input.gift ? (input.gift_reason ?? null) : null;
    body.billable = false;
    body.stage_history = [{ stage, at: now }];
  }
  const res = await directusFetch<{ data?: { id?: string } }>(
    `/items/partner_dispatches`,
    {
      method: "POST",
      body: JSON.stringify(body),
      next: { revalidate: 0 },
    },
  );
  return res?.data?.id ?? null;
}

export interface BillingConfig {
  currency: string;
  /** Days the partner has after dispatched_at to disqualify; otherwise billing locks. */
  acceptance_window_days: number;
  dedup_window_days: number;
}

/**
 * Fetch `site_settings.global_config.dispatch` config (singleton). This holds
 * the dispatch/billing engine config only. CRM-display config (rotting
 * thresholds, per-stage disqualification reasons) lives on the partner-leads
 * page — see fetchPartnerLeadsConfig().
 */
export async function fetchDispatchConfig(): Promise<{
  max_shared_targets: number;
  test_email_patterns: string[];
  billing: BillingConfig;
}> {
  type DispatchCfg = {
    max_shared_targets?: number;
    test_email_patterns?: string[];
    billing?: Partial<BillingConfig>;
  };
  type SettingsRow = { global_config?: { dispatch?: DispatchCfg } };
  type Resp = { data: SettingsRow | SettingsRow[] | null };
  const billingDefaults: BillingConfig = {
    currency: "CHF",
    acceptance_window_days: 15,
    dedup_window_days: 30,
  };
  try {
    // `global_config` is a JSON column — Directus can't project into it with
    // dot-notation (`global_config.dispatch` returns the row id string), so we
    // fetch the whole field and read `.dispatch` here. site_settings may return
    // an object (singleton) or a single-element array depending on config.
    const res = await directusFetch<Resp>(
      `/items/site_settings?fields=global_config`,
      { next: { revalidate: 60 } },
    );
    const raw = res?.data;
    const record = Array.isArray(raw) ? raw[0] : raw;
    const cfg = record?.global_config?.dispatch ?? {};
    return {
      max_shared_targets: cfg.max_shared_targets ?? 1,
      test_email_patterns: cfg.test_email_patterns ?? [],
      billing: {
        currency: cfg.billing?.currency ?? billingDefaults.currency,
        acceptance_window_days:
          cfg.billing?.acceptance_window_days ??
          billingDefaults.acceptance_window_days,
        dedup_window_days:
          cfg.billing?.dedup_window_days ?? billingDefaults.dedup_window_days,
      },
    };
  } catch {
    return {
      max_shared_targets: 1,
      test_email_patterns: [],
      billing: billingDefaults,
    };
  }
}

/**
 * Build the price-per-category map for the given partner_areas.
 *
 * Pricing is policy-based: many partners share one `partner_pricing_policies`
 * row whose `settings` JSON holds the full matrix:
 *   { prices: { "<product>": { "<category>": <CHF> } } }
 *
 * Pure function — no Directus round-trip; the policy's `settings` JSON is
 * already pulled via PARTNER_AREA_FIELDS. Partners without a policy assigned,
 * or whose policy lacks a row for the current product+category, get gift
 * dispatches at the resolver layer.
 */
export function buildPartnerLeadPrices(
  areas: PartnerArea[],
  product: string,
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const a of areas) {
    const policy = a.partner.pricing_policy;
    if (!policy || typeof policy === "string") continue;
    const productPrices = policy.settings?.prices?.[product];
    if (!productPrices) continue;
    const priceMap = new Map<string, number>();
    for (const [cat, price] of Object.entries(productPrices)) {
      if (typeof price === "number") priceMap.set(cat, price);
    }
    if (priceMap.size > 0) out.set(a.partner.id, priceMap);
  }
  return out;
}

/**
 * Return the set of partner IDs that have received a dispatch (or skipped_dedup
 * ledger row) for this email within the last `dedupWindowDays`. Used by the
 * resolver to pre-empt reason (b) — repeat dispatches to the same partner.
 */
export async function findRecentDispatchesByEmail(
  email: string,
  candidatePartnerIds: string[],
  environment: Environment,
  dedupWindowDays: number,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!email || candidatePartnerIds.length === 0 || dedupWindowDays <= 0) return out;

  const since = new Date(Date.now() - dedupWindowDays * 86_400_000).toISOString();

  const params = new URLSearchParams();
  params.set("fields", "partner");
  params.set("filter[partner][_in]", candidatePartnerIds.join(","));
  params.set("filter[environment][_eq]", environment);
  params.set("filter[dispatched_at][_gte]", since);
  params.set("filter[submission][user][email][_eq]", email);
  params.set("filter[status][_in]", "dispatched,skipped_dedup");
  params.set("limit", "200");

  type Row = { partner: string };
  const res = await directusFetch<{ data: Row[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );
  for (const row of res?.data ?? []) {
    if (row.partner) out.add(row.partner);
  }
  return out;
}

export function currentMonthBucket(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
