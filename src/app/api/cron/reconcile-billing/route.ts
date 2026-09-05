import { NextResponse } from "next/server";
import { reconcileBilling } from "@/lib/dispatch/admin";

/**
 * Daily backstop that locks billing on dispatches whose acceptance window has
 * elapsed. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 *
 * Without this the lock only ever fires when a partner moves a stage — which,
 * as of 2026-09, had never happened for 14 of 15 July leads.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await reconcileBilling({ dryRun: false });
  console.log("[cron] reconcile-billing", { locked: result.locked });
  return NextResponse.json(result);
}
