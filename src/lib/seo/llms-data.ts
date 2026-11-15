/**
 * Loads what /llms.txt lists, from Directus. Kept apart from the pure builder
 * in `llms.ts` so the builder can be tested without a CMS.
 */
import { directusFetch } from "@/lib/directus";
import { fetchBlogPosts, fetchLayout } from "@/lib/directus-queries";
import type { OrganizationConfig } from "./jsonLd";
import { cleanText, type LlmsInput, type LlmsLink, type LlmsSection } from "./llms";
import { extractItemSEO } from "./resolver";

const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";
type Lang = "fr" | "de";
const LOCALE: Record<Lang, string> = { fr: "fr-FR", de: "de-DE" };

/**
 * The pages worth pointing an AI crawler at, in reading order. Battery, legal,
 * confirmation and partner routes are left out on purpose; vehicle, locality
 * and post detail pages are reachable from the indexes listed here.
 */
const MAIN_ROUTES = ["home", "installation", "quote", "localities", "vehicles", "vehicle-brands", "blog", "contact"];

interface PageRow {
  route_id: string;
  translations?: { slug: string | null; languages_code: string; seo: unknown }[];
}

async function fetchMainPages(): Promise<PageRow[]> {
  const res = await directusFetch<{ data: PageRow[] }>(
    "/items/pages?fields=route_id,translations.slug,translations.languages_code,translations.seo" +
      `&filter[route_id][_in]=${MAIN_ROUTES.join(",")}&filter[status][_eq]=published&limit=50`,
    { next: { revalidate: 3600 } },
  );
  return res?.data ?? [];
}

function translation(row: PageRow | undefined, lang: Lang) {
  return row?.translations?.find((t) => t.languages_code === LOCALE[lang]);
}

function mainPageLinks(rows: PageRow[], lang: Lang): LlmsLink[] {
  const byRoute = new Map(rows.map((r) => [r.route_id, r]));
  const vehiclesSlug = translation(byRoute.get("vehicles"), lang)?.slug;

  return MAIN_ROUTES.flatMap((routeId): LlmsLink[] => {
    const t = translation(byRoute.get(routeId), lang);
    const seo = extractItemSEO(t?.seo);
    if (!t || seo?.noIndex) return [];

    let path: string | undefined;
    if (routeId === "home") path = `/${lang}`;
    else if (routeId === "vehicle-brands") path = vehiclesSlug && t.slug ? `/${lang}/${vehiclesSlug}/${t.slug}` : undefined;
    else if (t.slug) path = `/${lang}/${t.slug}`;

    const title = cleanText(seo?.title, 90);
    if (!path || !title) return [];
    return [{ title, url: `${SITE_URL}${path}`, description: cleanText(seo?.description) }];
  });
}

/** Published posts of one language, grouped by category, newest first within each. */
async function guideGroups(lang: Lang, blogSlug: string): Promise<LlmsSection["groups"]> {
  const posts = await fetchBlogPosts(LOCALE[lang]);
  const groups = new Map<string, LlmsLink[]>();

  for (const post of posts) {
    const t = post.translations?.[0];
    const category = post.category?.translations?.[0];
    if (!t?.slug || !category?.slug || extractItemSEO(t.seo)?.noIndex) continue;
    const title = cleanText(t.title, 120);
    if (!title) continue;

    const name = cleanText(category.name, 60) ?? category.slug;
    groups.set(name, [
      ...(groups.get(name) ?? []),
      {
        title,
        url: `${SITE_URL}/${lang}/${blogSlug}/${category.slug}/${t.slug}`,
        description: cleanText(t.excerpt) ?? cleanText(extractItemSEO(t.seo)?.description),
      },
    ]);
  }
  return [...groups].map(([heading, links]) => ({ heading, links }));
}

function organizationDetails(org: OrganizationConfig | undefined): string[] {
  const a = org?.address;
  const address = [a?.street, [a?.postal_code, a?.locality].filter(Boolean).join(" "), a?.region].filter(Boolean).join(", ");
  return [
    address && `- Adresse : ${address}, Suisse`,
    org?.uid && `- IDE : ${org.uid}`,
    `- Langues du site : français (/fr), allemand (/de)`,
  ].filter((x): x is string => !!x);
}

export async function loadLlmsInput(): Promise<LlmsInput> {
  const [rows, layout] = await Promise.all([fetchMainPages(), fetchLayout(LOCALE.fr)]);
  const blogRow = rows.find((r) => r.route_id === "blog");
  const blogSlug = (lang: Lang) => translation(blogRow, lang)?.slug || "blog";
  const [frGuides, deGuides] = await Promise.all([guideGroups("fr", blogSlug("fr")), guideGroups("de", blogSlug("de"))]);

  // The summary is the home page's own published description, not new copy.
  const homeFr = extractItemSEO(translation(rows.find((r) => r.route_id === "home"), "fr")?.seo);

  return {
    name: "easyRecharge",
    summary:
      cleanText(homeFr?.description, 400) ??
      "Plateforme suisse de demande de devis pour l'installation de bornes de recharge à domicile.",
    details: organizationDetails(layout?.global_config?.organization),
    sections: [
      { heading: "Pages principales", links: mainPageLinks(rows, "fr") },
      { heading: "Guides", links: [], groups: frGuides },
      { heading: "Deutsch: Hauptseiten", links: mainPageLinks(rows, "de") },
      { heading: "Deutsch: Ratgeber", links: [], groups: deGuides },
    ],
  };
}
