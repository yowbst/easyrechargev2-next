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
 *
 * Observed mangled separators, all mapped back to "&":
 *   - `&` (literal backslash) and `%5Cu0026` (percent-encoded backslash)
 *   - `u0026` (backslash dropped entirely by the scraper)
 *   - `&amp;` (HTML entity)
 */
export function normalizeAssetQuery(search: string): string {
  if (!search) return search;
  return search
    .replace(/(?:%5C|\\)u0026/gi, "&") // literal or %-encoded backslash + u0026
    // bare `u0026` (backslash stripped entirely) is only treated as a separator
    // when a known transform param follows — a bare match inside a legitimate
    // value (e.g. `key=heroU0026banner`) must stay untouched
    .replace(/u0026(?=(?:format|quality|width|height|fit|withoutEnlargement|key)=)/gi, "&")
    .replace(/&amp;/gi, "&");
}

// Directus image transform params we emit, with the values we consider valid.
// Anything else (unknown key, or malformed value like a truncated `format=we`)
// is dropped before forwarding so it can't trigger a Directus 400 INVALID_QUERY.
const ALLOWED_FORMATS = new Set(["auto", "jpg", "jpeg", "png", "webp", "tiff", "avif"]);
const ALLOWED_FITS = new Set(["cover", "contain", "inside", "outside"]);

/**
 * Whitelist and validate the transform params before forwarding to Directus.
 *
 * Crawlers frequently request truncated or otherwise mangled query strings
 * (e.g. `?format=we`) that no separator repair can fix. Rather than pass the
 * garbage through and let Directus reject the whole request with a 400, keep
 * only the params we recognise with values that are valid, and drop the rest.
 */
export function sanitizeTransformParams(search: string): string {
  if (!search) return "";
  const params = new URLSearchParams(search);
  const clean = new URLSearchParams();

  for (const [key, rawValue] of params) {
    const value = rawValue.trim();
    switch (key) {
      case "width":
      case "height":
        if (/^\d+$/.test(value) && +value >= 1 && +value <= 10000) clean.set(key, value);
        break;
      case "quality":
        if (/^\d+$/.test(value) && +value >= 1 && +value <= 100) clean.set(key, value);
        break;
      case "format": {
        const f = value.toLowerCase();
        if (ALLOWED_FORMATS.has(f)) clean.set(key, f);
        break;
      }
      case "fit": {
        const fit = value.toLowerCase();
        if (ALLOWED_FITS.has(fit)) clean.set(key, fit);
        break;
      }
      case "withoutEnlargement":
        if (value === "true" || value === "false") clean.set(key, value);
        break;
      case "key":
        if (/^[a-zA-Z0-9_-]+$/.test(value)) clean.set(key, value);
        break;
      // any other/unknown param is intentionally dropped
    }
  }

  const qs = clean.toString();
  return qs ? `?${qs}` : "";
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
    const qs = sanitizeTransformParams(normalizeAssetQuery(url.search || ""));
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
      // 400s are overwhelmingly crawler/link-preview bots requesting mangled or
      // truncated transform query strings that no repair can fix. Log them for
      // visibility but do NOT capture them as exceptions — they are not
      // actionable and only create error-tracking noise. Every other status
      // stays captured: 401/403 means the Directus token is broken (site-wide
      // image outage) and 404 means a live page references a deleted asset.
      const isBotNoise = upstream.status === 400;
      console.error(
        `[Asset proxy] Upstream ${upstream.status} for ${id}: ${errorBody}`,
      );
      serverLog(isBotNoise ? "WARNING" : "ERROR", "Asset proxy upstream error", { route: "assets", asset_id: id, status: upstream.status, error: errorBody });
      if (!isBotNoise) {
        try {
          const posthog = getPostHogServer();
          posthog.captureException(new Error(`Asset proxy ${upstream.status}: ${errorBody}`), "anonymous", { context: "asset_proxy", asset_id: id, upstream_status: upstream.status });
          after(() => posthog.flush());
        } catch { /* don't let PostHog break the error response */ }
      }
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
