import { NextResponse } from "next/server";
import { runReminders } from "@/lib/dispatch/reminders";

/**
 * Weekday-morning partner reminders (see src/lib/dispatch/reminders.ts).
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Does nothing until
 * `global_config.dispatch.reminders.enabled` is true in Directus.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runReminders({ dryRun: false });
  console.log("[cron] dispatch-reminders", {
    enabled: result.enabled,
    due: result.due,
    sent: result.sent,
    failed: result.failed,
    error: result.error,
  });
  return NextResponse.json(result);
}
