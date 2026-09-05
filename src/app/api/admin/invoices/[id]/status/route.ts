import { NextResponse } from "next/server";
import { setInvoiceStatus } from "@/lib/billing/invoice";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/lib/billing/types";
import { assertAdmin, errorBody, errorStatus } from "@/lib/billing/admin-guard";

/**
 * Move an invoice through issued -> sent -> paid, or to disputed/cancelled.
 * Same admin-token gate as /api/admin/billing.
 *
 *   POST /api/admin/invoices/<id>/status  { status, note? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { status, note } = (await req.json().catch(() => ({}))) as { status?: string; note?: string };
  if (!status || !INVOICE_STATUSES.includes(status as InvoiceStatus)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  try {
    await setInvoiceStatus(id, status as InvoiceStatus, note);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json(errorBody(e), { status: errorStatus(e) });
  }
}
