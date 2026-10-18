import { after } from "next/server";
import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";

/**
 * Lead-lifecycle events, POSTed to the second Make scenario ("Lead
 * lifecycle") on `site_settings.global_config.webhooks.dispatch_events`. The
 * first scenario (`webhooks.quote`) stays the new-lead path.
 *
 * - `reminder_due`   — sent by the reminders cron; Make e-mails the partner.
 * - `stage_changed`  — a partner moved a lead (kanban, e-mail button…).
 * - `disqualified`   — a partner or an admin disqualified a lead.
 * - `requalified`    — an admin undid a disqualification.
 *
 * The last three are decided by the Dispatch lifecycle module
 * (`lifecycle/rules.ts`).
 *
 * Every payload carries `environment`: staging partners exercise the same
 * path, and Make filters on it.
 */
export type DispatchEventName = "reminder_due" | "stage_changed" | "disqualified" | "requalified";

/** Where a lifecycle action came from. */
export type ActionSource = "kanban" | "email" | "amp" | "admin";

export async function getDispatchEventsWebhookUrl(): Promise<string | null> {
  try {
    // Uncached on purpose: the same site_settings URL is cached for an hour by
    // getQuoteWebhookUrl, and Vercel's data cache survives deploys — a cached
    // copy from before `dispatch_events` existed silently dropped events.
    const result = await directusFetch<{
      data: { global_config?: { webhooks?: { dispatch_events?: string } } }[];
    }>(`/items/site_settings?fields=global_config&filter[status][_eq]=published`, {
      next: { revalidate: 0 },
    });
    const raw = result?.data;
    const record = Array.isArray(raw) ? raw[0] : raw;
    return record?.global_config?.webhooks?.dispatch_events ?? null;
  } catch {
    return null;
  }
}

/**
 * POST one event and report the outcome. No webhook configured is not a
 * failure of the call site, but it is reported as `{ ok: false }` so the
 * reminders log never claims an e-mail went out.
 */
export async function sendDispatchEvent(
  event: DispatchEventName,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = await getDispatchEventsWebhookUrl();
  if (!url) {
    serverLog("WARNING", "Dispatch event dropped: no webhooks.dispatch_events configured", { event });
    return { ok: false, error: "no_webhook" };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        environment: getEnvironment(),
        at: new Date().toISOString(),
        ...payload,
      }),
    });
    if (!res.ok) {
      serverLog("WARNING", "Dispatch event webhook returned non-OK status", { event, status: res.status });
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    serverLog("ERROR", "Dispatch event webhook failed", { event, error });
    return { ok: false, error };
  }
}

/** Fire-and-forget variant for request handlers: runs after the response. */
export function emitDispatchEvent(event: DispatchEventName, payload: Record<string, unknown>): void {
  after(async () => {
    const result = await sendDispatchEvent(event, payload);
    if (result.ok || result.error === "no_webhook") return;
    try {
      const ph = getPostHogServer();
      ph.capture({
        distinctId: String(payload.dispatch_id ?? "anonymous"),
        event: "dispatch_event_failed",
        properties: { event, status: result.status, error: result.error },
      });
      await ph.flush();
    } catch {
      /* telemetry must not throw */
    }
  });
}
