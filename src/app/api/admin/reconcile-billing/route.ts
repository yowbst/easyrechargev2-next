import { NextResponse } from "next/server";
import { reconcileBilling } from "@/lib/dispatch/admin";

/**
 * Backstop that flips billable=true on any non-gift, non-disqualified dispatch
 * whose current-stage window has elapsed without movement. Safe to call before
 * generating an invoice. Same admin-token gate as /api/admin/billing.
 *
 *   curl -X POST -H "x-admin-token: $DIRECTUS_STATIC_TOKEN" \
 *     "https://.../api/admin/reconcile-billing"
 */
export async function POST(req: Request) {
  const adminToken = process.env.DIRECTUS_STATIC_TOKEN;
  const header = req.headers.get("x-admin-token");
  if (!adminToken || header !== adminToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { locked, ids } = await reconcileBilling({ dryRun: false });

  return NextResponse.json({ locked, ids });
}
