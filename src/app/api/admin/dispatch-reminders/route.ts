import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-auth";
import { runReminders } from "@/lib/dispatch/reminders";

/**
 * Manual run of the partner reminders. `?dryRun=1` lists what would go out
 * without sending or logging anything — and works while reminders are off.
 * Same admin-token gate as /api/admin/reconcile-billing.
 *
 *   curl -X POST -H "x-admin-token: $DIRECTUS_STATIC_TOKEN" \
 *     "https://.../api/admin/dispatch-reminders?dryRun=1"
 */
export async function POST(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  return NextResponse.json(await runReminders({ dryRun }));
}
