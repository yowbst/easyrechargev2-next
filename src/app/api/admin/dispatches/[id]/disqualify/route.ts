import { NextResponse } from "next/server";
import { act } from "@/lib/dispatch/lifecycle";
import { DISQUALIFICATION_REASONS } from "@/lib/dispatch/types";
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
  try {
    const result = await act(id, { kind: "admin" }, { type: "disqualify", reason: reason ?? "", note });
    if (!result.ok) {
      const { error, status, invoice } = result;
      return NextResponse.json(
        {
          error,
          ...(invoice ? { invoice } : {}),
          ...(error === "invalid_reason" ? { allowed: DISQUALIFICATION_REASONS } : {}),
        },
        { status },
      );
    }
    return NextResponse.json({ ok: true, reason, wasLocked: Boolean(result.before.billable_locked_at) });
  } catch (e) {
    console.error("[admin/dispatches/disqualify]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
