import { NextResponse } from "next/server";
import { addManualLeadLine } from "@/lib/billing/invoice";
import { assertAdmin, errorBody, errorStatus } from "@/lib/billing/admin-guard";

/**
 * Append a `lead` line that has no dispatch behind it — a lead billed without a
 * ledger row (the spec's pre-go-live July leads). Unlike an adjustment it counts
 * towards the lead quantity on the document. Totals are recomputed from the
 * invoice's actual lines. Refused on a paid or cancelled invoice. Same
 * admin-token gate as /api/admin/billing.
 *
 *   POST /api/admin/invoices/<id>/manual-lead
 *     { label, unit_price_chf, description?, dispatched_at?, canton?,
 *       postal_code?, locality?, last_name?, lead_category?, product? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    label?: string; unit_price_chf?: number; description?: string;
    dispatched_at?: string; canton?: string; postal_code?: string;
    locality?: string; last_name?: string; lead_category?: string; product?: string;
  };
  const { label, unit_price_chf } = body;
  if (!label || typeof unit_price_chf !== "number" || !Number.isFinite(unit_price_chf)) {
    return NextResponse.json({ error: "label_and_unit_price_required" }, { status: 400 });
  }
  try {
    const totals = await addManualLeadLine(id, label, unit_price_chf, {
      description: body.description ?? null,
      dispatchedAt: body.dispatched_at ?? null,
      canton: body.canton ?? null,
      postalCode: body.postal_code ?? null,
      locality: body.locality ?? null,
      lastName: body.last_name ?? null,
      leadCategory: body.lead_category ?? null,
      product: body.product ?? null,
    });
    return NextResponse.json({ ok: true, ...totals });
  } catch (e) {
    return NextResponse.json(errorBody(e), { status: errorStatus(e) });
  }
}
