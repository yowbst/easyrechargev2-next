import { serverLog } from "@/lib/posthog-server";
import type { QuoteWebhookPayload } from "@/lib/dispatch/webhook";

// Server-side ChatGPT Ads Conversions API: one `lead_created` per real quote
// lead ("ECP" / "BATTERY Quote Form Submitted (API)" — same pixel, the
// products differ by source_url). Same scope as the Google Ads upload in
// Make: production, not a test, dispatched to at least one partner.
//
// Only sent when the lead carries a ChatGPT click reference (oppref, from
// the proxy's _oppref cookie) or the pixel's browser reference (obref) —
// no e-mail or phone is sent. `id` = submission id = the pixel's event_id,
// so OpenAI dedupes the browser and server events.
//
// Env: OPENAI_ADS_API_KEY + OPENAI_ADS_PIXEL_ID; either missing = no-op.

export const OPENAI_EVENTS_URL = "https://bzr.openai.com/v1/events";

/** The API rejects events older than 7 days. */
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function buildOpenAILeadEvent(payload: QuoteWebhookPayload, now = Date.now()) {
  const { submission, dispatch, session } = payload;
  if (submission.environment !== "production") return null;
  if (dispatch.isTest || dispatch.summary.dispatched <= 0) return null;

  const attribution = (payload.attribution ?? {}) as Record<string, unknown>;
  const oppref = str(attribution.oppref);
  const obref = str(attribution.obref);
  if (!oppref && !obref) return null;

  const timestamp = Date.parse(submission.submittedAt);
  if (!Number.isFinite(timestamp) || now - timestamp > MAX_EVENT_AGE_MS) return null;

  const host = submission.locationHost
    ? `https://${submission.locationHost}`
    : process.env.SITE_URL || "https://easyrecharge.ch";

  const user: Record<string, string> = {};
  if (obref) user.obref = obref;
  if (session.ip) user.ip_address = session.ip;
  if (session.userAgent) user.user_agent = session.userAgent;

  return {
    id: submission.id,
    type: "lead_created",
    timestamp_ms: timestamp,
    ...(oppref ? { oppref } : {}),
    source_url: `${host}${submission.locationPath ?? ""}`,
    action_source: "web",
    ...(Object.keys(user).length > 0 ? { user } : {}),
    data: { type: "customer_action" },
  };
}

export async function sendOpenAILeadConversion(
  payload: QuoteWebhookPayload,
): Promise<{ sent: boolean; status?: number; reason?: string }> {
  const apiKey = process.env.OPENAI_ADS_API_KEY;
  const pixelId = process.env.OPENAI_ADS_PIXEL_ID;
  if (!apiKey || !pixelId) return { sent: false, reason: "not_configured" };

  const event = buildOpenAILeadEvent(payload);
  if (!event) return { sent: false, reason: "not_eligible" };

  try {
    const res = await fetch(`${OPENAI_EVENTS_URL}?pid=${encodeURIComponent(pixelId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ validate_only: false, events: [event] }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 500);
      serverLog("WARNING", "OpenAI conversion rejected", {
        route: "quote",
        submission_id: event.id,
        status: res.status,
        detail,
      });
      return { sent: false, status: res.status, reason: "rejected" };
    }
    return { sent: true, status: res.status };
  } catch (err) {
    serverLog("ERROR", "OpenAI conversion failed", {
      route: "quote",
      submission_id: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: false, reason: "network_error" };
  }
}
