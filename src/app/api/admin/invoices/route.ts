import { NextResponse } from "next/server";
import { issueInvoice, listInvoices } from "@/lib/billing/invoice";
import { assertAdmin } from "@/lib/admin-auth";
import { errorBody, errorStatus } from "@/lib/billing/admin-guard";

/**
 * List partner invoices (GET) and issue a new one (POST). Admin-token gate: `assertAdmin`.
 *
 *   GET  /api/admin/invoices?month=2026-07&status=sent
 *   POST /api/admin/invoices  { partner, month }
 */
export async function GET(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  try {
    const rows = await listInvoices({
      month: searchParams.get("month"),
      status: searchParams.get("status"),
    });
    return NextResponse.json({ rows });
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
