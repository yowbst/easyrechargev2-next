import { NextResponse } from "next/server";
import { getMonthlyBilling } from "@/lib/dispatch/admin";

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
  const month = searchParams.get("month") ?? "";

  try {
    const result = await getMonthlyBilling(month);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_month") {
      return NextResponse.json({ error: "invalid_month" }, { status: 400 });
    }
    throw error;
  }
}
