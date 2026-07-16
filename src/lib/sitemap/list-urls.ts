import { getBlogEntries, getCmsEntries, getVehicleEntries } from "./registries";

export async function listSiteUrls(
  opts: { type?: string; lang?: "fr" | "de" } = {},
): Promise<{ summary: Record<string, { total: number; fr: number; de: number }>; totalUrls: number; urls: string[] }> {
  const type = opts.type ?? null;
  const lang = opts.lang ?? null;

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

  return {
    summary,
    totalUrls: paths.length,
    urls: paths,
  };
}
