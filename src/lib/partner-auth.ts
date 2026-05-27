import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import type { Partner } from "@/lib/dispatch/types";

const PARTNER_FIELDS = [
  "id",
  "status",
  "name",
  "slug",
  "notification_email",
  "language",
  "monthly_quota",
  "priority",
  "billable_rate",
  "environment",
  "dashboard_token",
  "disqualification_overrides",
  "lead_scoring_weights",
].join(",");

/**
 * Look up a partner by their dashboard URL token. Returns null if not found,
 * paused, or in the wrong environment — so callers render 404 without leaking
 * existence. Token comparison happens server-side in Directus; the URL token
 * is the only credential.
 */
export async function findPartnerByToken(token: string): Promise<Partner | null> {
  if (!token || typeof token !== "string" || token.length < 8) return null;

  const params = new URLSearchParams();
  params.set("fields", PARTNER_FIELDS);
  params.set("filter[dashboard_token][_eq]", token);
  params.set("filter[environment][_eq]", getEnvironment());
  params.set("filter[status][_eq]", "active");
  params.set("limit", "1");

  try {
    const res = await directusFetch<{ data: Partner[] }>(
      `/items/partners?${params}`,
      { next: { revalidate: 0 } },
    );
    return res?.data?.[0] ?? null;
  } catch {
    return null;
  }
}
