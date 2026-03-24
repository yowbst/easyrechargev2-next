import { NextResponse } from "next/server";
import {
  getCmsEntries,
  getBlogEntries,
  getVehicleEntries,
} from "@/lib/sitemap/registries";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // cms | blog | vehicles | all (default)
  const lang = searchParams.get("lang"); // fr | de (optional filter)

  try {
    const fetchers: Record<string, () => Promise<{ url: string; lastModified?: string }[]>> = {
      cms: getCmsEntries,
      blog: getBlogEntries,
      vehicles: getVehicleEntries,
    };

    const types = type && type !== "all" ? [type] : ["cms", "blog", "vehicles"];
    const results: Record<string, { url: string; lastModified?: string }[]> = {};

    await Promise.all(
      types.map(async (t) => {
        const fn = fetchers[t];
        if (fn) results[t] = await fn();
      }),
    );

    // Flatten and optionally filter by lang
    const all = Object.values(results).flat();
    const filtered = lang
      ? all.filter((e) => {
          try {
            const path = new URL(e.url).pathname;
            return path.startsWith(`/${lang}/`) || path === `/${lang}`;
          } catch {
            return true;
          }
        })
      : all;

    const paths = filtered.map((e) => {
      try {
        return new URL(e.url).pathname;
      } catch {
        return e.url;
      }
    });

    const summary: Record<string, { total: number; fr: number; de: number }> = {};
    for (const [t, entries] of Object.entries(results)) {
      const urls = entries.map((e) => { try { return new URL(e.url).pathname; } catch { return e.url; } });
      summary[t] = {
        total: entries.length,
        fr: urls.filter((u) => u.startsWith("/fr")).length,
        de: urls.filter((u) => u.startsWith("/de")).length,
      };
    }

    return NextResponse.json({
      summary,
      totalUrls: paths.length,
      urls: paths,
    });
  } catch (error) {
    console.error("[Debug URLs] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch URLs" },
      { status: 500 },
    );
  }
}
