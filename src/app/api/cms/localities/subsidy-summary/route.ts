import { NextResponse } from "next/server";
import { chargingSubsidySummary } from "@/lib/localities-server";
import { serverLog } from "@/lib/posthog-server";

/**
 * GET /api/cms/localities/subsidy-summary?postalCode=1003&locality=Lausanne
 * → { locality, available, maxChf } or { locality: null } when unknown.
 * Read by the quote funnel's side panel; the mini-quote hands over the postal
 * code and locality name, not the Directus id.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const postalCode = searchParams.get("postalCode")?.trim() ?? "";
  const locality = searchParams.get("locality")?.trim() ?? "";
  if (!/^\d{4}$/.test(postalCode) || !locality) return NextResponse.json({ locality: null });

  try {
    const summary = await chargingSubsidySummary(postalCode, locality);
    return NextResponse.json(summary ?? { locality: null }, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    serverLog("WARNING", "Subsidy summary failed", { route: "localities/subsidy-summary", postal_code: postalCode, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ locality: null });
  }
}
