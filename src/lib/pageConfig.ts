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

export interface RouteTokenReport {
  /** `{r:id}` tokens whose id is not in the page registry. */
  unknownIds: string[];
  /** Hardcoded links to a registry page, with the token that should replace them. */
  hardcoded: Array<{ url: string; suggestion: string }>;
}

const HARDCODED_HREF = /href="(?:https?:\/\/(?:www\.)?easyrecharge\.ch)?(\/(fr|de)(?:\/([a-z0-9-]+))?)\/?(?=["?#])/g;

/**
 * Check CMS content before it is written: walks every string (translations
 * included) for `{r:id}` tokens with an unknown id, and for hardcoded links
 * to registry pages. Links to items (a vehicle, a locality, a post) have no
 * token and never match a registry slug, so they are left alone.
 */
export function checkRouteTokens(data: unknown, pageRegistry: PageRegistryEntry[]): RouteTokenReport {
  const unknownIds = new Set<string>();
  const hardcoded = new Map<string, string>();

  const visit = (value: unknown) => {
    if (typeof value === "string") {
      for (const [, id] of value.matchAll(/\{r:([a-zA-Z0-9_-]+)\}/g)) {
        if (!resolveRouteId(id, "fr", pageRegistry)) unknownIds.add(id);
      }
      for (const [, url, lang, slug] of value.matchAll(HARDCODED_HREF)) {
        const id = slug
          ? pageRegistry.find((p) => p.slugs[lang] === slug)?.id
          : "home";
        if (id) hardcoded.set(url, `{r:${id}}`);
      }
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(data);

  return {
    unknownIds: [...unknownIds],
    hardcoded: [...hardcoded].map(([url, suggestion]) => ({ url, suggestion })),
  };
}
