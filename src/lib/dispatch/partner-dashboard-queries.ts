import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";

export interface PartnerDispatchCard {
  id: string;
  dispatched_at: string;
  stage: string;
  stage_entered_at: string;
  stage_history: Array<{ stage: string; at: string }> | null;
  disqualified: boolean;
  disqualification_reason: string | null;
  disqualification_note: string | null;
  disqualified_at: string | null;
  lost_reason: string | null;
  lost_note: string | null;
  gift: boolean;
  billable: boolean;
  billable_locked_at: string | null;
  /** CHF price snapshotted at dispatch time. null for gifts. Directus
   *  serialises decimals as strings (e.g. "40.00000") — consumers must
   *  coerce. */
  price_chf: number | string | null;
  canton: string;
  product: string | null;
  lead_category: string | null;
  submission: {
    id: string;
    user: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      language: string | null;
    } | null;
    data: Record<string, unknown> | null;
  } | null;
}

const CARD_FIELDS = [
  "id",
  "dispatched_at",
  "stage",
  "stage_entered_at",
  "stage_history",
  "disqualified",
  "disqualification_reason",
  "disqualification_note",
  "disqualified_at",
  "lost_reason",
  "lost_note",
  "gift",
  "billable",
  "billable_locked_at",
  "price_chf",
  "canton",
  "product",
  "lead_category",
  "submission.id",
  "submission.data",
  "submission.user.first_name",
  "submission.user.last_name",
  "submission.user.email",
  "submission.user.phone",
  "submission.user.language",
].join(",");

/**
 * Fetch every `dispatched` row for the given partner in the current
 * environment, newest first. Returns up to 500 cards (we don't paginate the
 * dashboard for v1).
 */
export interface PartnerLeadsConfig {
  /** Per-stage rotting threshold (visual nudge on the card). */
  rotting_days_by_stage: Record<string, number>;
  /** Per-stage allowed disqualification reasons. Empty = all reasons allowed. */
  reasons_by_stage: Record<string, string[]>;
}

const PARTNER_LEADS_DEFAULTS: PartnerLeadsConfig = {
  rotting_days_by_stage: { new: 5, contacted: 7, appointment: 14, quote_sent: 21 },
  reasons_by_stage: {},
};

/**
 * Leads-specific config stored on the Directus `partner-leads` page `config`
 * field (kept separate from site_settings.dispatch which drives the
 * dispatch/billing engine). Falls back to sensible defaults if the page or
 * keys are absent.
 */
export async function fetchPartnerLeadsConfig(): Promise<PartnerLeadsConfig> {
  try {
    const res = await directusFetch<{
      data: { config?: Partial<PartnerLeadsConfig> | null }[];
    }>(
      `/items/pages?filter[route_id][_eq]=partner-leads&fields=config&limit=1`,
      { next: { revalidate: 60 } },
    );
    const cfg = res?.data?.[0]?.config ?? {};
    return {
      rotting_days_by_stage: {
        ...PARTNER_LEADS_DEFAULTS.rotting_days_by_stage,
        ...(cfg.rotting_days_by_stage ?? {}),
      },
      reasons_by_stage: cfg.reasons_by_stage ?? {},
    };
  } catch {
    return PARTNER_LEADS_DEFAULTS;
  }
}

export interface PartnerStatsConfig {
  /** Per-stage maturity threshold (days). A lead must be at least this old
   *  to be counted in that stage's conversion-rate denominator. */
  lookback_days_by_stage: Record<string, number>;
}

const PARTNER_STATS_DEFAULTS: PartnerStatsConfig = {
  lookback_days_by_stage: {
    contacted: 3,
    appointment: 10,
    quote_sent: 21,
    won: 30,
  },
};

/**
 * Stats-specific config stored on the Directus `partner-stats` page. Same
 * defaults-merge pattern as the CRM config — falls back to sensible defaults
 * if the page or keys are absent.
 */
/**
 * Fetch the partner-stats page (translations only — no blocks). Uses a
 * 60-second ISR window so dictionary edits on the Directus side propagate
 * within a minute, sidestepping the heavier 3600s cache that `fetchPage`
 * applies to public CMS pages.
 */
export async function fetchPartnerStatsPage(locale: string) {
  try {
    const params = new URLSearchParams();
    params.set("fields", "*,translations.*");
    params.set("filter[route_id][_eq]", "partner-stats");
    params.set("deep[translations][_filter][languages_code][_eq]", locale);
    params.set("limit", "1");
    const res = await directusFetch<{
      data: Array<Record<string, unknown>> | null;
    }>(`/items/pages?${params}`, {
      next: { revalidate: 60, tags: ["page-partner-stats"] },
    });
    return res?.data?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Same 60s window as fetchPartnerStatsPage, for any partner-section page.
 * `fetchPage`'s 3600s cache is wrong here: it happily memoises a null for an
 * hour when the Directus page does not exist yet, so a freshly seeded
 * dictionary stays invisible and every label renders as [key].
 */
export async function fetchPartnerSectionPage(routeId: string, locale: string) {
  try {
    const params = new URLSearchParams();
    params.set("fields", "*,translations.*");
    params.set("filter[route_id][_eq]", routeId);
    params.set("deep[translations][_filter][languages_code][_eq]", locale);
    params.set("limit", "1");
    const res = await directusFetch<{
      data: Array<Record<string, unknown>> | null;
    }>(`/items/pages?${params}`, {
      next: { revalidate: 60, tags: [`page-${routeId}`] },
    });
    return res?.data?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function fetchPartnerStatsConfig(): Promise<PartnerStatsConfig> {
  try {
    const res = await directusFetch<{
      data: { config?: Partial<PartnerStatsConfig> | null }[];
    }>(
      `/items/pages?filter[route_id][_eq]=partner-stats&fields=config&limit=1`,
      { next: { revalidate: 60 } },
    );
    const cfg = res?.data?.[0]?.config ?? {};
    return {
      lookback_days_by_stage: {
        ...PARTNER_STATS_DEFAULTS.lookback_days_by_stage,
        ...(cfg.lookback_days_by_stage ?? {}),
      },
    };
  } catch {
    return PARTNER_STATS_DEFAULTS;
  }
}

export async function fetchPartnerDispatches(
  partnerId: string,
): Promise<PartnerDispatchCard[]> {
  const params = new URLSearchParams();
  params.set("fields", CARD_FIELDS);
  params.set("filter[partner][_eq]", partnerId);
  params.set("filter[environment][_eq]", getEnvironment());
  params.set("filter[status][_eq]", "dispatched");
  params.set("sort", "-dispatched_at");
  params.set("limit", "500");

  const res = await directusFetch<{ data: PartnerDispatchCard[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );
  return res?.data ?? [];
}
