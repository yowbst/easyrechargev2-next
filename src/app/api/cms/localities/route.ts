import { NextResponse } from "next/server";
import { directusFetch, DIRECTUS_DEFAULT_LOCALE } from "@/lib/directus";
import { serverLog } from "@/lib/posthog-server";

const LOCALITIES_COLLECTION =
  process.env.DIRECTUS_LOCALITIES_COLLECTION || "localities";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "8", 10) || 8, 1),
    50,
  );
  const locale = searchParams.get("locale") || DIRECTUS_DEFAULT_LOCALE;

  if (!search || search.length < 2) {
    return NextResponse.json({ data: [], meta: { note: "search too short" } });
  }

  try {
    const params = new URLSearchParams();
    params.set(
      "fields",
      "id,name,postal_code,additional_digit,language,canton_2l,canton.*,canton.translations.name",
    );
    params.set("filter[_or][0][name][_icontains]", search);
    params.set("filter[_or][1][postal_code][_icontains]", search);
    params.set(
      "deep[canton][translations][_filter][languages_code][_eq]",
      locale,
    );
    params.set("sort", "name,postal_code");
    params.set("limit", String(limit));

    const data = await directusFetch(
      `/items/${LOCALITIES_COLLECTION}?${params.toString()}`,
      { next: { revalidate: 86400 } },
    );

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("[Localities] Error:", error);
    serverLog("ERROR", "Localities fetch failed", { route: "localities", error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to fetch localities" },
      { status: 500 },
    );
  }
}
