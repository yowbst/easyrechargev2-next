import { NextResponse } from "next/server";
import { setInvoiceStatus } from "@/lib/billing/invoice";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/lib/billing/types";
import { assertAdmin } from "@/lib/admin-auth";
import { errorBody, errorStatus } from "@/lib/billing/admin-guard";

/**
 * Move an invoice through issued -> sent -> paid, or to disputed/cancelled.
 * Cancelling also marks the sent documents ANNULÉE (best-effort, reported in
 * `documents`) — that happens inside setInvoiceStatus, so MCP does the same.
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
    return NextResponse.json({ ok: true, ...(await setInvoiceStatus(id, status as InvoiceStatus, note)) });
  } catch (e) {
    return NextResponse.json(errorBody(e), { status: errorStatus(e) });
  }
}
