import { NextResponse } from "next/server";
import { directusFetch, DIRECTUS_DEFAULT_LOCALE } from "@/lib/directus";
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
  const { searchParams } = new URL(req.url);
  const locale = searchParams.get("locale") || DIRECTUS_DEFAULT_LOCALE;

  try {
    // Don't filter by locale — subsidies exist regardless of language
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await directusFetch<{ data: any }>(
      `/items/localities/${id}?fields=translations.subsidies`,
      { next: { revalidate: 3600 } },
    );

    const translations = data?.data?.translations || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasChargingSubsidy = translations.some((t: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t.subsidies || []).some((s: any) =>
        s.category === "charging-infrastructure" && s.audiences?.includes("personal"),
      ),
    );

    return NextResponse.json(
      { hasChargingSubsidy },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    console.error("[Subsidies] Error:", error);
    serverLog("WARNING", "Subsidies check failed, returning default", { route: "localities/subsidies", locality_id: id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ hasChargingSubsidy: false });
  }
}
