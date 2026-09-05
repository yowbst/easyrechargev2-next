import { NextResponse } from "next/server";
import { addAdjustmentLine } from "@/lib/billing/invoice";
import { assertAdmin, errorBody, errorStatus } from "@/lib/billing/admin-guard";

/**
 * Append a discount or correction line and recompute the total. Refused on a
 * paid or cancelled invoice. Same admin-token gate as /api/admin/billing.
 *
 *   POST /api/admin/invoices/<id>/adjustment  { description, amount_chf }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { description, amount_chf } = (await req.json().catch(() => ({}))) as {
    description?: string; amount_chf?: number;
  };
  if (!description || typeof amount_chf !== "number" || Number.isNaN(amount_chf)) {
    return NextResponse.json({ error: "description_and_amount_required" }, { status: 400 });
  }
  try {
    await addAdjustmentLine(id, description, amount_chf);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(errorBody(e), { status: errorStatus(e) });
  }
}
