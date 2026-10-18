import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-auth";
import { reconcileBilling } from "@/lib/dispatch/admin";

/**
 * Backstop that locks billing on every dispatched lead whose acceptance window
 * has ended (rule in the Dispatch lifecycle module). Safe to call before
 * generating an invoice. Same admin-token gate as /api/admin/billing.
 *
 *   curl -X POST -H "x-admin-token: $DIRECTUS_STATIC_TOKEN" \
 *     "https://.../api/admin/reconcile-billing"
 */
export async function POST(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { locked, ids } = await reconcileBilling({ dryRun: false });

  return NextResponse.json({ locked, ids });
}
