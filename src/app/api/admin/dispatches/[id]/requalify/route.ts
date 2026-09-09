import { NextResponse } from "next/server";
import { adminRequalify } from "@/lib/dispatch/admin-override";
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
    return NextResponse.json(await adminRequalify(id, note ?? null));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status =
      msg === "dispatch_not_found" ? 404
      : msg === "attached_to_live_invoice" ? 409
      : 500;
    if (status === 500) console.error("[admin/dispatches/requalify]", e);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoice = (e as any)?.invoice;
    return NextResponse.json(
      status === 500 ? { error: "internal_error" } : { error: msg, ...(invoice ? { invoice } : {}) },
      { status },
    );
  }
}
