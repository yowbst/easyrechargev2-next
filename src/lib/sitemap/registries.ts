/**
 * Sitemap URL registries — fetch URL entries from Directus for sitemap generation.
 * Ported from server/sitemap/*.ts
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noIndexMap: Partial<Record<"fr" | "de", boolean>> = {};

    for (const t of page.translations || []) {
      const lang = LANG_MAP[t.languages_code];
      if (lang && t.slug != null) slugs[lang] = t.slug;
      if (lang && t.seo) {
        if (t.seo.no_index || t.seo.noIndex) noIndexMap[lang] = true;
      }
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

    const languages: Record<string, string> = {};
    if (paths.fr) languages.fr = `${SITE_URL}${paths.fr}`;
    if (paths.de) languages.de = `${SITE_URL}${paths.de}`;

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

  // Fetch blog posts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await directusFetch<{ data: any[] }>(
    "/items/blog_posts?fields=id,date_updated,translations.slug,translations.languages_code,category.translations.slug,category.translations.languages_code&filter[status][_eq]=published&limit=1000",
    { next: { revalidate: 300 } },
  );

  const items = result?.data || [];
  const entries: UrlEntry[] = [];

  for (const item of items) {
    const postSlugs: Partial<Record<"fr" | "de", string>> = {};
    for (const t of item.translations || []) {
      const lang = LANG_MAP[t.languages_code];
      if (lang && t.slug) postSlugs[lang] = t.slug;
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

    const languages: Record<string, string> = {};
    if (paths.fr) languages.fr = `${SITE_URL}${paths.fr}`;
    if (paths.de) languages.de = `${SITE_URL}${paths.de}`;

    for (const lang of ["fr", "de"] as const) {
      const path = paths[lang];
      if (!path) continue;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await directusFetch<{ data: any[] }>(
    "/items/vehicles?fields=id,slug,date_updated&filter[status][_eq]=published&limit=1000",
    { next: { revalidate: 300 } },
  );

  const items = result?.data || [];
  const entries: UrlEntry[] = [];

  for (const item of items) {
    if (!item.slug) continue;

    const frPath = `/fr/${VEHICLE_ROUTES.fr.vehicles}/${item.slug}`;
    const dePath = `/de/${VEHICLE_ROUTES.de.vehicles}/${item.slug}`;
    const languages = {
      fr: `${SITE_URL}${frPath}`,
      de: `${SITE_URL}${dePath}`,
    };

    entries.push(
      {
        url: `${SITE_URL}${frPath}`,
        lastModified: item.date_updated,
        changeFrequency: "monthly",
        priority: 0.7,
        alternates: { languages },
      },
      {
        url: `${SITE_URL}${dePath}`,
        lastModified: item.date_updated,
        changeFrequency: "monthly",
        priority: 0.7,
        alternates: { languages },
      },
    );
  }

  // Brand pages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vehiclesResult = await directusFetch<{ data: any[] }>(
    "/items/vehicles?fields=brand.name,date_updated&filter[status][_eq]=published&limit=1000",
    { next: { revalidate: 300 } },
  );

  const brandMap = new Map<string, string>();
  for (const v of vehiclesResult?.data || []) {
    const name = v.brand?.name;
    if (!name) continue;
    if (!brandMap.has(name) || (v.date_updated && v.date_updated > (brandMap.get(name) || ""))) {
      brandMap.set(name, v.date_updated || "");
    }
  }

  for (const [brandName, lastmod] of brandMap) {
    const slug = brandName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const frPath = `/fr/${VEHICLE_ROUTES.fr.vehicles}/${VEHICLE_ROUTES.fr.brands}/${slug}`;
    const dePath = `/de/${VEHICLE_ROUTES.de.vehicles}/${VEHICLE_ROUTES.de.brands}/${slug}`;
    const languages = {
      fr: `${SITE_URL}${frPath}`,
      de: `${SITE_URL}${dePath}`,
    };

    entries.push(
      {
        url: `${SITE_URL}${frPath}`,
        lastModified: lastmod || undefined,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: { languages },
      },
      {
        url: `${SITE_URL}${dePath}`,
        lastModified: lastmod || undefined,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: { languages },
      },
    );
  }

  // Brand listing pages
  const frBrandList = `/fr/${VEHICLE_ROUTES.fr.vehicles}/${VEHICLE_ROUTES.fr.brands}`;
  const deBrandList = `/de/${VEHICLE_ROUTES.de.vehicles}/${VEHICLE_ROUTES.de.brands}`;
  const brandListLanguages = {
    fr: `${SITE_URL}${frBrandList}`,
    de: `${SITE_URL}${deBrandList}`,
  };
  entries.push(
    {
      url: `${SITE_URL}${frBrandList}`,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: { languages: brandListLanguages },
    },
    {
      url: `${SITE_URL}${deBrandList}`,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: { languages: brandListLanguages },
    },
  );

  return entries;
}
