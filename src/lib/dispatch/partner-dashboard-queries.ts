import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";

export interface PartnerDispatchCard {
  id: string;
  dispatched_at: string;
  stage: string;
  stage_entered_at: string;
  disqualified: boolean;
  disqualification_reason: string | null;
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
  "disqualified",
  "disqualification_reason",
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
export interface PartnerDispatchDetail extends PartnerDispatchCard {
  dispatched_at: string;
  mode_used: string | null;
  product: string | null;
  price_chf: number | string | null;
  stage_history: Array<{ stage: string; at: string }> | null;
}

const DETAIL_FIELDS = [
  ...CARD_FIELDS.split(","),
  "mode_used",
  "price_chf",
  "stage_history",
  "partner",
].join(",");

/**
 * Fetch one dispatch with the full form-submission payload joined, scoped
 * to the requesting partner. Returns null if the dispatch belongs to a
 * different partner (defensive — prevents URL fishing).
 */
export async function fetchPartnerDispatchDetail(
  dispatchId: string,
  partnerId: string,
): Promise<PartnerDispatchDetail | null> {
  const res = await directusFetch<{ data: (PartnerDispatchDetail & { partner: string }) | null }>(
    `/items/partner_dispatches/${dispatchId}?fields=${DETAIL_FIELDS}`,
    { next: { revalidate: 0 } },
  );
  const row = res?.data;
  if (!row || row.partner !== partnerId) return null;
  return row;
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
