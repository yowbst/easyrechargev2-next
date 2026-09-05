import { NextResponse } from "next/server";
import { addInvoiceNote } from "@/lib/billing/invoice";
import { assertAdmin, errorStatus } from "@/lib/billing/admin-guard";

/**
 * Append a comment to the invoice's event log. Same admin-token gate as
 * /api/admin/billing.
 *
 *   POST /api/admin/invoices/<id>/note  { actor?, note }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { actor, note } = (await req.json().catch(() => ({}))) as { actor?: string; note?: string };
  if (!note) return NextResponse.json({ error: "note_required" }, { status: 400 });
  const who = actor === "partner" || actor === "system" ? actor : "yoan";
  try {
    await addInvoiceNote(id, who, note);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: errorStatus(e) },
    );
  }
}
