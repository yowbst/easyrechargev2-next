import { PostHog } from "posthog-node";
import { after } from "next/server";

let posthogClient: PostHog | null = null;

// ─── OTLP Logs ──────────────────────────────────────────

type LogLevel = "INFO" | "WARNING" | "ERROR" | "DEBUG";

const SEVERITY: Record<LogLevel, number> = {
  DEBUG: 5,
  INFO: 9,
  WARNING: 13,
  ERROR: 17,
};

/**
 * Send a structured log to PostHog's OTLP logs endpoint.
 * Fire-and-forget via `after()` so it never blocks the response.
 */
export function serverLog(
  level: LogLevel,
  body: string,
  attributes: Record<string, string | number | boolean | null | undefined> = {},
) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
  if (!key) return;

  const attrs = Object.entries(attributes)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ({
      key: k,
      value:
        typeof v === "number"
          ? { intValue: String(v) }
          : typeof v === "boolean"
            ? { boolValue: v }
            : { stringValue: String(v) },
    }));

  const payload = {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "easyrecharge-api" } },
            { key: "deployment.environment", value: { stringValue: process.env.VERCEL_ENV || "development" } },
          ],
        },
        scopeLogs: [
          {
            scope: { name: "server" },
            logRecords: [
              {
                timeUnixNano: String(Date.now() * 1_000_000),
                severityNumber: SEVERITY[level],
                severityText: level,
                body: { stringValue: body },
                attributes: attrs,
              },
            ],
          },
        ],
      },
    ],
  };

  after(() =>
    fetch(`${host}/i/v1/logs?token=${key}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
    }).catch(() => {}),
  );
}

// ─── PostHog Node client ────────────────────────────────

export function getPostHogServer(): PostHog {
  if (!posthogClient) {
    const key = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_POSTHOG_API_KEY is not set");

    posthogClient = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
      // Flush immediately in serverless — no background worker to rely on
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

/**
 * Extract the PostHog distinct_id from the request cookies.
 * The client SDK stores it in a cookie named `ph_<token>_posthog`.
 */
export function extractDistinctId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/ph_[^=]*_posthog=([^;]+)/);
  if (!match?.[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    const data = JSON.parse(decoded);
    return data.distinct_id ?? null;
  } catch {
    return null;
  }
}
