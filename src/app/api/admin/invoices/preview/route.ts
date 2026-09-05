import { NextResponse } from "next/server";
import { previewInvoice } from "@/lib/billing/invoice";
import { assertAdmin, errorBody, errorStatus } from "@/lib/billing/admin-guard";

/**
 * Dry-run an invoice for a partner/month: number, period, issuable flag,
 * scope lines and total. Writes nothing. Same admin-token gate as
 * /api/admin/billing.
 *
 *   POST /api/admin/invoices/preview  { partner, month }
 */
export async function POST(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { partner, month } = (await req.json().catch(() => ({}))) as { partner?: string; month?: string };
  if (!partner || !month) {
    return NextResponse.json({ error: "partner_and_month_required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await previewInvoice(partner, month));
  } catch (e) {
    return NextResponse.json(errorBody(e), { status: errorStatus(e) });
  }
}
