import { NextResponse, after } from "next/server";
import { DIRECTUS_URL } from "@/lib/directus";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";

/**
 * Proxy Directus asset files (images, etc.).
 * Fallback for cases where Directus assets require auth.
 * If assets are public, use direct URLs via next/image remotePatterns instead.
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

    // Forward query params (e.g. ?width=600&height=400 for transforms)
    const url = new URL(req.url);
    const qs = url.search || "";
    const upstream = await fetch(`${DIRECTUS_URL}/assets/${id}${qs}`, {
      headers,
      redirect: "follow",
    });

    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type");
    const body = await upstream.arrayBuffer();

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
