import { NextResponse } from "next/server";
import { adminDisqualify } from "@/lib/dispatch/admin-override";
import { DISQUALIFICATION_REASONS, type DisqualificationReason } from "@/lib/dispatch/types";
import { assertAdmin } from "@/lib/billing/admin-guard";

/**
 * Operator override: disqualify a dispatch regardless of the billing lock, the
 * acceptance window, or the per-stage reason list — all three of which the
 * partner-facing route enforces. A partner disputing an invoice by email after
 * their window closed is the normal case this exists for.
 *
 *   POST /api/admin/dispatches/<id>/disqualify   { reason, note? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { reason, note } = (await req.json().catch(() => ({}))) as {
    reason?: string; note?: string;
  };
  if (!reason || !DISQUALIFICATION_REASONS.includes(reason as DisqualificationReason)) {
    return NextResponse.json(
      { error: "invalid_reason", allowed: DISQUALIFICATION_REASONS },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await adminDisqualify(id, reason as DisqualificationReason, note ?? null),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status =
      msg === "dispatch_not_found" ? 404
      : msg === "attached_to_live_invoice" || msg === "note_required_for_other" ? 409
      : msg === "invalid_reason" ? 400
      : 500;
    if (status === 500) console.error("[admin/dispatches/disqualify]", e);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoice = (e as any)?.invoice;
    return NextResponse.json(
      status === 500 ? { error: "internal_error" } : { error: msg, ...(invoice ? { invoice } : {}) },
      { status },
    );
  }
}
