import { NextResponse, after } from "next/server";
import { listSiteUrls } from "@/lib/sitemap/list-urls";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // cms | blog | vehicles | all (default)
  const lang = searchParams.get("lang"); // fr | de (optional filter)

  try {
    const result = await listSiteUrls({
      type: type ?? undefined,
      lang: (lang as "fr" | "de" | null) ?? undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Debug URLs] Error:", error);
    serverLog("ERROR", "Debug URLs fetch failed", { route: "debug/urls", error: error instanceof Error ? error.message : String(error) });
    try {
      const posthog = getPostHogServer();
      posthog.captureException(error, "anonymous", { context: "debug_urls" });
      after(() => posthog.flush());
    } catch { /* don't let PostHog break the error response */ }
    return NextResponse.json(
      { error: "Failed to fetch URLs" },
      { status: 500 },
    );
  }
}
