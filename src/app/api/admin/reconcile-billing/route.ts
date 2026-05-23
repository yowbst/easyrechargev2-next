import { NextResponse } from "next/server";
import { directusFetch } from "@/lib/directus";
import { fetchDispatchConfig } from "@/lib/dispatch/queries";
import { isAcceptanceExpired } from "@/lib/dispatch/billing";

interface Row {
  id: string;
  dispatched_at: string;
  disqualified: boolean;
  gift: boolean;
  billable: boolean;
  partner: { disqualification_overrides: Record<string, number> | null } | null;
}

/**
 * Backstop that flips billable=true on any non-gift, non-disqualified dispatch
 * whose current-stage window has elapsed without movement. Safe to call before
 * generating an invoice. Same admin-token gate as /api/admin/billing.
 *
 *   curl -X POST -H "x-admin-token: $DIRECTUS_STATIC_TOKEN" \
 *     "https://.../api/admin/reconcile-billing"
 */
export async function POST(req: Request) {
  const adminToken = process.env.DIRECTUS_STATIC_TOKEN;
  const header = req.headers.get("x-admin-token");
  if (!adminToken || header !== adminToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const config = await fetchDispatchConfig();

  const params = new URLSearchParams();
  params.set(
    "fields",
    "id,dispatched_at,disqualified,gift,billable,partner.disqualification_overrides",
  );
  params.set("filter[status][_eq]", "dispatched");
  params.set("filter[billable][_eq]", "false");
  params.set("filter[disqualified][_eq]", "false");
  params.set("filter[gift][_eq]", "false");
  params.set("limit", "1000");

  const res = await directusFetch<{ data: Row[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );

  const now = new Date();
  const toLock: string[] = [];
  for (const r of res?.data ?? []) {
    if (
      isAcceptanceExpired(
        r.dispatched_at,
        config.billing,
        r.partner?.disqualification_overrides ?? null,
        now,
      )
    ) {
      toLock.push(r.id);
    }
  }

  for (const id of toLock) {
    await directusFetch(`/items/partner_dispatches/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        billable: true,
        billable_locked_at: now.toISOString(),
      }),
      next: { revalidate: 0 },
    });
  }

  return NextResponse.json({ locked: toLock.length, ids: toLock });
}
