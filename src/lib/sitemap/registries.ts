/**
 * Sitemap URL registries — fetch URL entries from Directus for sitemap generation.
 * Each registry returns entries for a specific content type.
 */

import { directusFetch } from "@/lib/directus";

const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";
const LANG_MAP: Record<string, "fr" | "de"> = { "fr-FR": "fr", "de-DE": "de" };
const VEHICLE_ROUTES = {
  fr: { vehicles: "vehicules", brands: "marques" },
  de: { vehicles: "fahrzeuge", brands: "marken" },
} as const;

interface UrlEntry {
  url: string;
  lastModified?: string;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
  alternates?: { languages: Record<string, string> };
}

function buildAlternates(paths: Partial<Record<"fr" | "de", string>>): Record<string, string> {
  const languages: Record<string, string> = {};
  if (paths.fr) {
    languages["x-default"] = `${SITE_URL}${paths.fr}`;
    languages.fr = `${SITE_URL}${paths.fr}`;
  }
  if (paths.de) languages.de = `${SITE_URL}${paths.de}`;
  return languages;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isNoIndex(seo: any): boolean {
  if (!seo) return false;
  return !!(seo.no_index || seo.noIndex);
}

// ─── CMS Pages ───────────────────────────────────────────

export async function getCmsEntries(): Promise<UrlEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await directusFetch<{ data: any[] }>(
    "/items/pages?fields=id,route_id,type,date_updated,translations.slug,translations.languages_code,translations.seo&filter[_or][0][type][_eq]=static&filter[_or][1][type][_eq]=app&limit=200",
    { next: { revalidate: 300 } },
  );

  const pages = result?.data || [];
  const entries: UrlEntry[] = [];

  for (const page of pages) {
    const routeId = page.route_id;
    if (!routeId) continue;

    const isHome = routeId === "home";
    const slugs: Partial<Record<"fr" | "de", string>> = {};
    const noIndexMap: Partial<Record<"fr" | "de", boolean>> = {};

    for (const t of page.translations || []) {
      const lang = LANG_MAP[t.languages_code];
      if (lang && t.slug != null) slugs[lang] = t.slug;
      if (lang && isNoIndex(t.seo)) noIndexMap[lang] = true;
    }

    const paths: Partial<Record<"fr" | "de", string>> = {};
    if (isHome) {
      paths.fr = `/fr`;
      paths.de = `/de`;
    } else {
      if (slugs.fr) paths.fr = `/fr/${slugs.fr}`;
      if (slugs.de) paths.de = `/de/${slugs.de}`;
    }

    if (!paths.fr && !paths.de) continue;

    const languages = buildAlternates(paths);

    for (const lang of ["fr", "de"] as const) {
      const path = paths[lang];
      if (!path || noIndexMap[lang]) continue;

      entries.push({
        url: `${SITE_URL}${path}`,
        lastModified: page.date_updated,
        changeFrequency: "monthly",
        priority: isHome ? 1.0 : 0.8,
        alternates: { languages },
      });
    }
  }

  return entries;
}

// ─── Blog Posts ──────────────────────────────────────────

export async function getBlogEntries(): Promise<UrlEntry[]> {
  // Fetch blog page slugs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blogPageResult = await directusFetch<{ data: any[] }>(
    "/items/pages?fields=translations.slug,translations.languages_code&filter[route_id][_eq]=blog&limit=1",
    { next: { revalidate: 300 } },
  );
  const blogPage = blogPageResult?.data?.[0];
  const blogSlugs: Record<"fr" | "de", string> = { fr: "blog", de: "blog" };
  for (const t of blogPage?.translations || []) {
    const lang = LANG_MAP[t.languages_code];
    if (lang && t.slug) blogSlugs[lang] = t.slug;
  }

  // Fetch blog posts with SEO fields for noIndex check
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await directusFetch<{ data: any[] }>(
    "/items/blog_posts?fields=id,date_updated,translations.slug,translations.languages_code,translations.seo,category.translations.slug,category.translations.languages_code&filter[status][_eq]=published&limit=1000",
    { next: { revalidate: 300 } },
  );

  const items = result?.data || [];
  const entries: UrlEntry[] = [];

  for (const item of items) {
    const postSlugs: Partial<Record<"fr" | "de", string>> = {};
    const noIndexMap: Partial<Record<"fr" | "de", boolean>> = {};
    for (const t of item.translations || []) {
      const lang = LANG_MAP[t.languages_code];
      if (lang && t.slug) postSlugs[lang] = t.slug;
      if (lang && isNoIndex(t.seo)) noIndexMap[lang] = true;
    }

    const categorySlugs: Partial<Record<"fr" | "de", string>> = {};
    for (const t of item.category?.translations || []) {
      const lang = LANG_MAP[t.languages_code];
      if (lang && t.slug) categorySlugs[lang] = t.slug;
    }

    const paths: Partial<Record<"fr" | "de", string>> = {};
    if (postSlugs.fr && categorySlugs.fr)
      paths.fr = `/fr/${blogSlugs.fr}/${categorySlugs.fr}/${postSlugs.fr}`;
    if (postSlugs.de && categorySlugs.de)
      paths.de = `/de/${blogSlugs.de}/${categorySlugs.de}/${postSlugs.de}`;

    if (!paths.fr && !paths.de) continue;

    const languages = buildAlternates(paths);

    for (const lang of ["fr", "de"] as const) {
      const path = paths[lang];
      if (!path || noIndexMap[lang]) continue;

      entries.push({
        url: `${SITE_URL}${path}`,
        lastModified: item.date_updated,
        changeFrequency: "weekly",
        priority: 0.6,
        alternates: { languages },
      });
    }
  }

  return entries;
}

// ─── Vehicles ────────────────────────────────────────────

export async function getVehicleEntries(): Promise<UrlEntry[]> {
  // Single API call for both vehicle detail pages and brand aggregation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await directusFetch<{ data: any[] }>(
    "/items/vehicles?fields=id,slug,date_updated,brand.name,brand.slug&filter[status][_eq]=published&limit=1000",
    { next: { revalidate: 300 } },
  );

  const items = result?.data || [];
  const entries: UrlEntry[] = [];

  // Vehicle detail pages
  for (const item of items) {
    if (!item.slug) continue;

    const paths = {
      fr: `/fr/${VEHICLE_ROUTES.fr.vehicles}/${item.slug}`,
      de: `/de/${VEHICLE_ROUTES.de.vehicles}/${item.slug}`,
    };
    const languages = buildAlternates(paths);

    entries.push(
      {
        url: `${SITE_URL}${paths.fr}`,
        lastModified: item.date_updated,
        changeFrequency: "monthly",
        priority: 0.7,
        alternates: { languages },
      },
      {
        url: `${SITE_URL}${paths.de}`,
        lastModified: item.date_updated,
        changeFrequency: "monthly",
        priority: 0.7,
        alternates: { languages },
      },
    );
  }

  // Brand pages — aggregate from vehicles data
  const brandMap = new Map<string, { slug: string; lastmod: string }>();
  for (const v of items) {
    const name = v.brand?.name;
    const slug = v.brand?.slug;
    if (!name || !slug) continue;
    const existing = brandMap.get(name);
    if (!existing || (v.date_updated && v.date_updated > existing.lastmod)) {
      brandMap.set(name, { slug, lastmod: v.date_updated || "" });
    }
  }

  for (const [, { slug, lastmod }] of brandMap) {
    const paths = {
      fr: `/fr/${VEHICLE_ROUTES.fr.vehicles}/${VEHICLE_ROUTES.fr.brands}/${slug}`,
      de: `/de/${VEHICLE_ROUTES.de.vehicles}/${VEHICLE_ROUTES.de.brands}/${slug}`,
    };
    const languages = buildAlternates(paths);

    entries.push(
      {
        url: `${SITE_URL}${paths.fr}`,
        lastModified: lastmod || undefined,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: { languages },
      },
      {
        url: `${SITE_URL}${paths.de}`,
        lastModified: lastmod || undefined,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: { languages },
      },
    );
  }

  // Brand listing pages
  const brandListPaths = {
    fr: `/fr/${VEHICLE_ROUTES.fr.vehicles}/${VEHICLE_ROUTES.fr.brands}`,
    de: `/de/${VEHICLE_ROUTES.de.vehicles}/${VEHICLE_ROUTES.de.brands}`,
  };
  const brandListLanguages = buildAlternates(brandListPaths);
  entries.push(
    {
      url: `${SITE_URL}${brandListPaths.fr}`,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: { languages: brandListLanguages },
    },
    {
      url: `${SITE_URL}${brandListPaths.de}`,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: { languages: brandListLanguages },
    },
  );

  return entries;
}
