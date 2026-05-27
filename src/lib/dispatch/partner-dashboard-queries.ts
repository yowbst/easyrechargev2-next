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
  gift: boolean;
  billable: boolean;
  billable_locked_at: string | null;
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
  "gift",
  "billable",
  "billable_locked_at",
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
export interface PartnerCrmConfig {
  /** Per-stage rotting threshold (visual nudge on the card). */
  rotting_days_by_stage: Record<string, number>;
  /** Per-stage allowed disqualification reasons. Empty = all reasons allowed. */
  reasons_by_stage: Record<string, string[]>;
}

const PARTNER_CRM_DEFAULTS: PartnerCrmConfig = {
  rotting_days_by_stage: { new: 5, contacted: 7, appointment: 14, quote_sent: 21 },
  reasons_by_stage: {},
};

/**
 * CRM-specific config stored on the Directus `partner-crm` page `config` field
 * (kept separate from site_settings.dispatch which drives the dispatch/billing
 * engine). Falls back to sensible defaults if the page or keys are absent.
 */
export async function fetchPartnerCrmConfig(): Promise<PartnerCrmConfig> {
  try {
    const res = await directusFetch<{
      data: { config?: Partial<PartnerCrmConfig> | null }[];
    }>(
      `/items/pages?filter[route_id][_eq]=partner-crm&fields=config&limit=1`,
      { next: { revalidate: 60 } },
    );
    const cfg = res?.data?.[0]?.config ?? {};
    return {
      rotting_days_by_stage: {
        ...PARTNER_CRM_DEFAULTS.rotting_days_by_stage,
        ...(cfg.rotting_days_by_stage ?? {}),
      },
      reasons_by_stage: cfg.reasons_by_stage ?? {},
    };
  } catch {
    return PARTNER_CRM_DEFAULTS;
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
