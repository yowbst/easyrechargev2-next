import { NextResponse, after } from "next/server";
import { DIRECTUS_URL } from "@/lib/directus";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";

/**
 * Repair query strings where the "&" separators were escaped and never decoded.
 *
 * Our OG/transform image URLs (e.g. `?format=webp&quality=80&width=1200...`) get
 * embedded in JSON-LD and the RSC flight payload, where Next.js escapes "&" to the
 * HTML-safe sequence `&` (and HTML attributes escape it to `&amp;`). Crawlers
 * and link-preview bots that scrape those URLs without decoding then request the
 * proxy with the escaped form, collapsing every transform param into a single
 * `format` value and triggering a Directus 400. Restore real separators here.
 */
function normalizeAssetQuery(search: string): string {
  if (!search) return search;
  return search
    .replace(/(?:%5C|\\)u0026/gi, "&") // literal or %-encoded backslash + u0026
    .replace(/&amp;/gi, "&");
}

/**
 * Proxy Directus asset files (images, etc.).
 * Retries once on 500/502/503 to handle transient Directus/storage failures.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const token = process.env.DIRECTUS_STATIC_TOKEN;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const url = new URL(req.url);
    const qs = normalizeAssetQuery(url.search || "");
    const assetUrl = `${DIRECTUS_URL}/assets/${id}${qs}`;

    let upstream: Response | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      upstream = await fetch(assetUrl, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (upstream.ok) break;
      const isTransient = upstream.status >= 500;
      if (isTransient && attempt < 2) {
        await upstream.body?.cancel();
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      const errorBody = await upstream.text().catch(() => "");
      console.error(
        `[Asset proxy] Upstream ${upstream.status} for ${id}: ${errorBody}`,
      );
      serverLog("ERROR", "Asset proxy upstream error", { route: "assets", asset_id: id, status: upstream.status, error: errorBody });
      try {
        const posthog = getPostHogServer();
        posthog.captureException(new Error(`Asset proxy ${upstream.status}: ${errorBody}`), "anonymous", { context: "asset_proxy", asset_id: id, upstream_status: upstream.status });
        after(() => posthog.flush());
      } catch { /* don't let PostHog break the error response */ }
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream!.headers.get("content-type");
    const body = await upstream!.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[Asset proxy] Error:", error);
    serverLog("ERROR", "Asset proxy failed", { route: "assets", asset_id: id, error: error instanceof Error ? error.message : String(error) });
    try {
      const posthog = getPostHogServer();
      posthog.captureException(error, "anonymous", { context: "asset_proxy", asset_id: id });
      after(() => posthog.flush());
    } catch { /* don't let PostHog break the error response */ }
    return new NextResponse(null, { status: 502 });
  }
}
