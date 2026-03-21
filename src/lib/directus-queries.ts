import { directusFetch, DIRECTUS_DEFAULT_LOCALE } from "./directus";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

/**
 * Build Directus /items/{collection} querystring from readable lists.
 * Directus expects bracketed keys; we provide them as plain strings.
 */
function buildItemsQuery(opts: {
  collection: string;
  fields: string[];
  filter?: AnyRecord;
  deep?: AnyRecord;
  sort?: string[];
  limit?: number;
}): string {
  const params = new URLSearchParams();

  params.set("fields", opts.fields.join(","));
  if (opts.sort?.length) params.set("sort", opts.sort.join(","));
  if (typeof opts.limit === "number") params.set("limit", String(opts.limit));

  if (opts.filter) {
    for (const [k, v] of Object.entries(opts.filter)) {
      params.set(`filter${k}`, String(v));
    }
  }

  if (opts.deep) {
    for (const [k, v] of Object.entries(opts.deep)) {
      params.set(`deep${k}`, String(v));
    }
  }

  return `/items/${opts.collection}?${params.toString()}`;
}

// ─── Layout ──────────────────────────────────────────────

const LAYOUT_FIELDS = [
  "id",
  "status",
  "logo_white",
  "logo_color",
  "header_config",
  "footer_config",
  "global_config",
  "translations.*",
  "header_navigation.key",
  "header_navigation.items.*",
  "header_navigation.items.translations.*",
  "header_navigation.items.page.id",
  "header_navigation.items.page.route_id",
  "header_navigation.items.page.translations.slug",
  "header_navigation.items.page.translations.languages_code",
  "footer_quicklinks_navigation.key",
  "footer_quicklinks_navigation.items.*",
  "footer_quicklinks_navigation.items.translations.*",
  "footer_quicklinks_navigation.items.page.id",
  "footer_quicklinks_navigation.items.page.route_id",
  "footer_quicklinks_navigation.items.page.translations.slug",
  "footer_quicklinks_navigation.items.page.translations.languages_code",
  "footer_about_navigation.key",
  "footer_about_navigation.items.*",
  "footer_about_navigation.items.translations.*",
  "footer_about_navigation.items.page.id",
  "footer_about_navigation.items.page.route_id",
  "footer_about_navigation.items.page.translations.slug",
  "footer_about_navigation.items.page.translations.languages_code",
];

export async function fetchLayout(locale: string = DIRECTUS_DEFAULT_LOCALE) {
  const deep: AnyRecord = {
    "[translations][_filter][languages_code][_eq]": locale,
    "[header_navigation][items][translations][_filter][languages_code][_eq]": locale,
    "[header_navigation][items][page][translations][_filter][languages_code][_eq]": locale,
    "[footer_quicklinks_navigation][items][translations][_filter][languages_code][_eq]": locale,
    "[footer_quicklinks_navigation][items][page][translations][_filter][languages_code][_eq]": locale,
    "[footer_about_navigation][items][translations][_filter][languages_code][_eq]": locale,
    "[footer_about_navigation][items][page][translations][_filter][languages_code][_eq]": locale,
  };

  const path = buildItemsQuery({
    collection: "site_settings",
    fields: LAYOUT_FIELDS,
    filter: { "[status][_eq]": "published" },
    deep,
    sort: ["id"],
  });

  const result = await directusFetch<{ data: AnyRecord | AnyRecord[] }>(path, {
    next: { revalidate: 60, tags: ["layout"] },
  });

  // site_settings is a singleton — Directus returns { data: {...} } not { data: [{...}] }
  const raw = result?.data;
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

// ─── Pages ───────────────────────────────────────────────

const PAGE_FIELDS = [
  "*",
  "translations.*",
  "blocks.id",
  "blocks.collection",
  "blocks.item:block_hero.*",
  "blocks.item:block_hero.translations.*",
  "blocks.item:block_faq.*",
  "blocks.item:block_faq.translations.*",
  "blocks.item:block_faq.faq_items.faq_items_id.*",
  "blocks.item:block_faq.faq_items.faq_items_id.translations.*",
  "blocks.item:block_getquote.*",
  "blocks.item:block_getquote.translations.*",
  "blocks.item:block_miniquote.*",
  "blocks.item:block_miniquote.translations.*",
  "blocks.item:block_testimonials.*",
  "blocks.item:block_testimonials.translations.*",
  "blocks.item:block_postgroup.*",
  "blocks.item:block_postgroup.translations.*",
  "blocks.item:block_postgroup.posts.blog_posts_id.*",
  "blocks.item:block_postgroup.posts.blog_posts_id.translations.*",
  "blocks.item:block_postgroup.posts.blog_posts_id.category.*",
  "blocks.item:block_postgroup.posts.blog_posts_id.category.translations.*",
  "blocks.item:block_postgroup.posts.blog_posts_id.tags.blog_tags_id.*",
  "blocks.item:block_postgroup.posts.blog_posts_id.tags.blog_tags_id.translations.*",
  "blocks.item:block_features.*",
  "blocks.item:block_features.translations.*",
  "blocks.item:block_process.*",
  "blocks.item:block_process.translations.*",
];

export async function fetchPage(
  routeId: string,
  locale: string = DIRECTUS_DEFAULT_LOCALE,
) {
  const deep: AnyRecord = {
    "[translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_hero][translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_faq][translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_faq][faq_items][faq_items_id][translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_getquote][translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_miniquote][translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_testimonials][translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_postgroup][translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_postgroup][posts][blog_posts_id][translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_postgroup][posts][blog_posts_id][category][translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_postgroup][posts][blog_posts_id][tags][blog_tags_id][translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_features][translations][_filter][languages_code][_eq]": locale,
    "[blocks][item:block_process][translations][_filter][languages_code][_eq]": locale,
  };

  const path = buildItemsQuery({
    collection: "pages",
    fields: PAGE_FIELDS,
    filter: { "[route_id][_eq]": routeId },
    deep,
    limit: 1,
  });

  const result = await directusFetch<{ data: AnyRecord[] }>(path, {
    next: { revalidate: 60, tags: [`page-${routeId}`] },
  });

  return result?.data?.[0] ?? null;
}

// ─── Page Registry ───────────────────────────────────────

export interface PageRegistryEntry {
  id: string;
  sysId: string;
  pageType: string;
  slugs: Record<string, string>;
}

export async function fetchPageRegistry(): Promise<PageRegistryEntry[]> {
  const fields = [
    "id",
    "route_id",
    "type",
    "translations.slug",
    "translations.languages_code",
  ];

  const filter: AnyRecord = {
    "[_or][0][type][_eq]": "static",
    "[_or][1][type][_eq]": "app",
  };

  const path = buildItemsQuery({
    collection: "pages",
    fields,
    filter,
    limit: 200,
  });

  const result = await directusFetch<{ data: AnyRecord[] }>(path, {
    next: { revalidate: 60, tags: ["page-registry"] },
  });

  const pages = result?.data || [];
  const langMap: Record<string, string> = { "fr-FR": "fr", "de-DE": "de" };
  const registry: Record<string, PageRegistryEntry> = {};

  for (const page of pages) {
    const routeId = page.route_id;
    if (!routeId) continue;

    if (!registry[routeId]) {
      registry[routeId] = {
        id: routeId,
        sysId: String(page.id),
        pageType: page.type || "static",
        slugs: {},
      };
    }

    for (const t of page.translations || []) {
      const lang = langMap[t.languages_code];
      if (lang && t.slug != null) {
        registry[routeId].slugs[lang] = t.slug;
      }
    }
  }

  return Object.values(registry);
}

// ─── Blog ────────────────────────────────────────────────

const BLOG_FIELDS = [
  "*",
  "translations.*",
  "category.*",
  "category.translations.*",
  "tags.blog_tags_id.*",
  "tags.blog_tags_id.translations.*",
];

export async function fetchBlogPosts(
  locale: string = DIRECTUS_DEFAULT_LOCALE,
  category?: string,
) {
  const filter: AnyRecord = {
    "[status][_eq]": "published",
  };
  if (category) {
    filter["[category][category_id][_eq]"] = category;
  }

  const deep: AnyRecord = {
    "[translations][_filter][languages_code][_eq]": locale,
    "[category][translations][_filter][languages_code][_eq]": locale,
    "[tags][blog_tags_id][translations][_filter][languages_code][_eq]": locale,
  };

  const path = buildItemsQuery({
    collection: "blog_posts",
    fields: BLOG_FIELDS,
    filter,
    deep,
    sort: ["-date_created"],
  });

  const result = await directusFetch<{ data: AnyRecord[] }>(path, {
    next: { revalidate: 300, tags: ["blog-posts"] },
  });

  return (result?.data || []).filter(
    (post: AnyRecord) => post.translations?.length > 0,
  );
}

export async function fetchBlogPost(
  slug: string,
  locale: string = DIRECTUS_DEFAULT_LOCALE,
) {
  const filter: AnyRecord = {
    "[status][_eq]": "published",
    "[translations][slug][_eq]": slug,
  };

  const deep: AnyRecord = {
    "[translations][_filter][languages_code][_eq]": locale,
    "[category][translations][_filter][languages_code][_eq]": locale,
    "[tags][blog_tags_id][translations][_filter][languages_code][_eq]": locale,
  };

  const path = buildItemsQuery({
    collection: "blog_posts",
    fields: BLOG_FIELDS,
    filter,
    deep,
    limit: 1,
  });

  const result = await directusFetch<{ data: AnyRecord[] }>(path, {
    next: { revalidate: 300, tags: [`blog-post-${slug}`] },
  });

  return result?.data?.[0] ?? null;
}

// ─── Vehicles ────────────────────────────────────────────

const VEHICLE_FIELDS = [
  "*",
  "brand.id",
  "brand.name",
  "brand.icon_simple",
  "brand.slug",
];

export async function fetchVehicles(
  locale: string = DIRECTUS_DEFAULT_LOCALE,
) {
  const path = buildItemsQuery({
    collection: "vehicles",
    fields: VEHICLE_FIELDS,
    filter: { "[status][_eq]": "published" },
    deep: { "[translations][_filter][languages_code][_eq]": locale },
    limit: 1000,
  });

  const result = await directusFetch<{ data: AnyRecord[] }>(path, {
    next: { revalidate: 300, tags: ["vehicles"] },
  });

  return result?.data || [];
}

export async function fetchVehicle(
  slug: string,
  locale: string = DIRECTUS_DEFAULT_LOCALE,
) {
  const path = buildItemsQuery({
    collection: "vehicles",
    fields: VEHICLE_FIELDS,
    filter: {
      "[status][_eq]": "published",
      "[slug][_eq]": slug,
    },
    deep: { "[translations][_filter][languages_code][_eq]": locale },
    limit: 1,
  });

  const result = await directusFetch<{ data: AnyRecord[] }>(path, {
    next: { revalidate: 300, tags: [`vehicle-${slug}`] },
  });

  return result?.data?.[0] ?? null;
}

// ─── Vehicle Brands ──────────────────────────────────────

export async function fetchVehicleBrands(
  locale: string = DIRECTUS_DEFAULT_LOCALE,
) {
  const path = buildItemsQuery({
    collection: "vehicle_brands",
    fields: ["*", "translations.*"],
    filter: { "[status][_eq]": "published" },
    deep: { "[translations][_filter][languages_code][_eq]": locale },
    limit: 200,
  });

  const result = await directusFetch<{ data: AnyRecord[] }>(path, {
    next: { revalidate: 300, tags: ["vehicle-brands"] },
  });

  return result?.data || [];
}
