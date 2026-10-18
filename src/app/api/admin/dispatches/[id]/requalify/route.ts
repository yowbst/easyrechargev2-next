import { NextResponse } from "next/server";
import { act } from "@/lib/dispatch/lifecycle";
import { assertAdmin } from "@/lib/billing/admin-guard";

/**
 * Undo a disqualification. Leaves the row unlocked so the next reconcile
 * decides whether the acceptance window has elapsed, rather than this call
 * asserting a billing state of its own.
 *
 *   POST /api/admin/dispatches/<id>/requalify   { note? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { note } = (await req.json().catch(() => ({}))) as { note?: string };
  try {
    const result = await act(id, { kind: "admin" }, { type: "requalify", note });
    if (!result.ok) {
      const { error, status, invoice } = result;
      return NextResponse.json({ error, ...(invoice ? { invoice } : {}) }, { status });
    }
    return NextResponse.json({ ok: true, wasDisqualified: result.before.disqualified === true });
  } catch (e) {
    console.error("[admin/dispatches/requalify]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
