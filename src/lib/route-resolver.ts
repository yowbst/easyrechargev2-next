/**
 * Resolve route types from URL segments using the Directus page registry.
 * All slugs are dynamic — nothing is hardcoded.
 */

import { fetchPageRegistry, type PageRegistryEntry } from "./directus-queries";
import { getRouteSlug, type AppLangSlug } from "./i18n/config";

export type RouteType =
  | { type: "cms-page"; routeId: string; entry: PageRegistryEntry }
  | { type: "quote"; routeId: string; entry: PageRegistryEntry }
  | { type: "contact"; routeId: string; entry: PageRegistryEntry }
  | { type: "blog-listing"; routeId: string; entry: PageRegistryEntry }
  | { type: "vehicles-listing"; routeId: string; entry: PageRegistryEntry }
  | { type: "vehicle-detail"; slug: string; vehiclesEntry: PageRegistryEntry }
  | { type: "vehicle-brands"; vehiclesEntry: PageRegistryEntry }
  | { type: "vehicle-brand-detail"; brandSlug: string; vehiclesEntry: PageRegistryEntry }
  | { type: "blog-post"; blogSlug: string; categorySlug: string; postSlug: string; blogEntry: PageRegistryEntry }
  | { type: "quote-success"; quoteEntry: PageRegistryEntry }
  | null;

/**
 * Resolve a top-level slug (1-segment after lang) to a route type.
 */
export async function resolveSlugRoute(
  slug: string,
  lang: string,
): Promise<RouteType> {
  const registry = await fetchPageRegistry();
  const entry = registry.find((p) => p.slugs[lang] === slug);

  if (!entry) return null;

  const INTERACTIVE_PAGES = new Set(["quote", "contact"]);
  if (INTERACTIVE_PAGES.has(entry.id)) {
    return { type: entry.id as "quote" | "contact", routeId: entry.id, entry };
  }

  if (entry.id === "blog") {
    return { type: "blog-listing", routeId: entry.id, entry };
  }

  if (entry.id === "vehicles") {
    return { type: "vehicles-listing", routeId: entry.id, entry };
  }

  return { type: "cms-page", routeId: entry.id, entry };
}

/**
 * Resolve a 3-segment route: /{lang}/{slug}/{sub1}
 * Could be: vehicle detail, brand listing, or confirmation page.
 */
export async function resolveSub1Route(
  slug: string,
  sub1: string,
  lang: string,
): Promise<RouteType> {
  const registry = await fetchPageRegistry();
  const entry = registry.find((p) => p.slugs[lang] === slug);

  if (!entry) return null;

  // Vehicle routes: /{lang}/{vehiclesSlug}/{vehicleSlug}
  // or brand listing: /{lang}/{vehiclesSlug}/{brandsSegment}
  if (entry.id === "vehicles") {
    const brandsSegment = getRouteSlug(lang, "brands");
    if (sub1 === brandsSegment) {
      return { type: "vehicle-brands", vehiclesEntry: entry };
    }
    return { type: "vehicle-detail", slug: sub1, vehiclesEntry: entry };
  }

  // Quote success: /{lang}/{quoteSlug}/{confirmationSegment}
  if (entry.id === "quote") {
    return { type: "quote-success", quoteEntry: entry };
  }

  // Blog category page: /{lang}/{blogSlug}/{categorySlug} — render as blog listing
  if (entry.id === "blog") {
    return { type: "blog-listing", routeId: entry.id, entry };
  }

  return null;
}

/**
 * Resolve a 4-segment route: /{lang}/{slug}/{sub1}/{sub2}
 * Could be: blog post or vehicle brand detail.
 */
export async function resolveSub2Route(
  slug: string,
  sub1: string,
  sub2: string,
  lang: string,
): Promise<RouteType> {
  const registry = await fetchPageRegistry();
  const entry = registry.find((p) => p.slugs[lang] === slug);

  if (!entry) return null;

  // Vehicle brand detail: /{lang}/{vehiclesSlug}/{brandsSegment}/{brandSlug}
  if (entry.id === "vehicles") {
    return { type: "vehicle-brand-detail", brandSlug: sub2, vehiclesEntry: entry };
  }

  // Blog post: /{lang}/{blogSlug}/{categorySlug}/{postSlug}
  if (entry.id === "blog") {
    return {
      type: "blog-post",
      blogSlug: slug,
      categorySlug: sub1,
      postSlug: sub2,
      blogEntry: entry,
    };
  }

  return null;
}
