/**
 * Route ID Resolution — Next.js version
 * Uses the page registry array (fetched server-side) instead of the client-side singleton.
 */

import type { PageRegistryEntry } from "./directus-queries";

type Language = "fr" | "de";
const SUPPORTED_LANGUAGES: Language[] = ["fr", "de"];

/**
 * Resolve a routeId to a language-specific URL path using a page registry.
 */
export function resolveRouteId(
  routeId: string | undefined,
  language: string,
  pageRegistry: PageRegistryEntry[],
): string | null {
  if (!routeId) return null;

  if (!SUPPORTED_LANGUAGES.includes(language as Language)) return null;

  const lang = language as Language;

  if (routeId === "home") return `/${lang}`;

  const entry = pageRegistry.find((p) => p.id === routeId);
  if (entry) {
    const slug = entry.slugs[lang];
    if (slug === "" || slug === undefined) return `/${lang}`;
    return `/${lang}/${slug}`;
  }

  return null;
}

/**
 * Resolve a CTA configuration to a URL
 */
export function resolveCtaUrl(
  cta: { link?: string; routeId?: string; page_route_id?: string } | undefined,
  language: string,
  pageRegistry: PageRegistryEntry[],
  fallbackPath: string,
): string {
  if (!cta) return fallbackPath;

  const routeId = cta.routeId || cta.page_route_id;
  if (routeId) {
    const resolved = resolveRouteId(routeId, language, pageRegistry);
    if (resolved) return resolved;
  }

  if (cta.link) return cta.link;

  return fallbackPath;
}

/**
 * Resolve {r:routeId} patterns in HTML strings to language-aware URLs.
 * Use this to process WYSIWYG content from Directus before rendering.
 *
 * Example: <a href="{r:quote}">Get a quote</a> → <a href="/fr/devis">Get a quote</a>
 */
export function resolveRouteLinks(
  html: string,
  language: string,
  pageRegistry: PageRegistryEntry[],
): string {
  return html.replace(/\{r:([a-zA-Z0-9_-]+)\}/g, (match, routeId) => {
    return resolveRouteId(routeId, language, pageRegistry) || match;
  });
}
