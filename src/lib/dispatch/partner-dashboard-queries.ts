import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";

export interface PartnerDispatchCard {
  id: string;
  dispatched_at: string;
  stage: string;
  stage_entered_at: string;
  disqualified: boolean;
  disqualification_reason: string | null;
  gift: boolean;
  billable: boolean;
  billable_locked_at: string | null;
  canton: string;
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
  "gift",
  "billable",
  "billable_locked_at",
  "canton",
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
