import { NextResponse } from "next/server";
import { hasChargingSubsidy } from "@/lib/localities-server";
import { serverLog } from "@/lib/posthog-server";

/**
 * GET /api/cms/localities/:id/subsidies
 * Returns { hasChargingSubsidy: boolean } for a given locality.
 * Lightweight check — only fetches the subsidies JSON category field.
 */
export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;

  try {
    const result = await hasChargingSubsidy(id);

    return NextResponse.json(
      { hasChargingSubsidy: result },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    console.error("[Subsidies] Error:", error);
    serverLog("WARNING", "Subsidies check failed, returning default", { route: "localities/subsidies", locality_id: id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ hasChargingSubsidy: false });
  }
}
