import { NextResponse } from "next/server";
import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import { issueInvoice } from "@/lib/billing/invoice";
import { assertAdmin, errorBody, errorStatus } from "@/lib/billing/admin-guard";

/**
 * List partner invoices (GET) and issue a new one (POST). Same admin-token
 * gate as /api/admin/billing.
 *
 *   GET  /api/admin/invoices?month=2026-07
 *   POST /api/admin/invoices  { partner, month }
 */
export async function GET(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const params = new URLSearchParams();
  params.set("fields", "id,number,version,status,period_month,total_chf,issued_at,due_at,paid_at,doc_url");
  params.set("sort", "-issued_at");
  params.set("limit", "100");
  // Every invoice row carries `environment`; without this filter a staging-issued
  // invoice shows up in the production admin list (and vice versa).
  params.set("filter[environment][_eq]", getEnvironment());
  const month = searchParams.get("month");
  if (month) params.set("filter[period_month][_eq]", month);
  try {
    const res = await directusFetch<{ data: unknown[] }>(
      `/items/partner_invoices?${params}`, { next: { revalidate: 0 } },
    );
    return NextResponse.json({ rows: res?.data ?? [] });
  } catch (e) {
    return NextResponse.json(errorBody(e), { status: errorStatus(e) });
  }
}

export async function POST(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { partner, month } = body as { partner?: string; month?: string };
  if (!partner || !month) {
    return NextResponse.json({ error: "partner_and_month_required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await issueInvoice(partner, month));
  } catch (e) {
    return NextResponse.json(errorBody(e), { status: errorStatus(e) });
  }
}
