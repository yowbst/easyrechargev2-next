import { NextResponse, after } from "next/server";
import { DIRECTUS_DEFAULT_LOCALE } from "@/lib/directus";
import { searchLocalitiesDirectus } from "@/lib/localities-server";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "8", 10) || 8, 1),
    50,
  );
  const locale = searchParams.get("locale") || DIRECTUS_DEFAULT_LOCALE;

  if (!search || search.length < 2) {
    return NextResponse.json({ data: [], meta: { note: "search too short" } });
  }

  try {
    const result = await searchLocalitiesDirectus(search, { limit, locale });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("[Localities] Error:", error);
    serverLog("ERROR", "Localities fetch failed", { route: "localities", error: error instanceof Error ? error.message : String(error) });
    try {
      const posthog = getPostHogServer();
      posthog.captureException(error, "anonymous", { context: "localities_search" });
      after(() => posthog.flush());
    } catch { /* don't let PostHog break the error response */ }
    return NextResponse.json(
      { error: "Failed to fetch localities" },
      { status: 500 },
    );
  }
}
