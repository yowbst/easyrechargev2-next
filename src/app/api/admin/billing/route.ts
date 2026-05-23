import { NextResponse } from "next/server";
import { directusFetch } from "@/lib/directus";

interface Row {
  partner: string;
  count: { id: string | number };
  sum: { price_chf: string | number };
}

/**
 * Monthly billing report — sums `price_chf` per partner where billable=true
 * and the dispatch is neither a gift nor disqualified.
 *
 * Gated by `x-admin-token` matching DIRECTUS_STATIC_TOKEN, same convention as
 * other internal endpoints.
 *
 *   GET /api/admin/billing?month=2026-05
 *   curl -H "x-admin-token: $DIRECTUS_STATIC_TOKEN" "https://.../api/admin/billing?month=2026-05"
 */
export async function GET(req: Request) {
  const adminToken = process.env.DIRECTUS_STATIC_TOKEN;
  const header = req.headers.get("x-admin-token");
  if (!adminToken || header !== adminToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "invalid_month" }, { status: 400 });
  }

  const params = new URLSearchParams();
  params.set("aggregate[count]", "id");
  params.set("aggregate[sum]", "price_chf");
  params.set("groupBy", "partner");
  params.set("filter[month_bucket][_eq]", month);
  params.set("filter[billable][_eq]", "true");
  params.set("filter[gift][_eq]", "false");
  params.set("filter[disqualified][_eq]", "false");
  params.set("limit", "500");

  const res = await directusFetch<{ data: Row[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );

  const rows = (res?.data ?? []).map((r) => ({
    partnerId: r.partner,
    leadCount:
      typeof r.count?.id === "string" ? parseInt(r.count.id, 10) : (r.count?.id ?? 0),
    totalChf:
      typeof r.sum?.price_chf === "string"
        ? parseInt(r.sum.price_chf, 10)
        : (r.sum?.price_chf ?? 0),
  }));

  return NextResponse.json({
    month,
    rows,
    totalChf: rows.reduce((s, r) => s + (r.totalChf ?? 0), 0),
  });
}
