import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

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
