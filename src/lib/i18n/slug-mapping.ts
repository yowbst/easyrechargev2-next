/**
 * Slug utilities for language-aware URL conversion.
 * Top-level page slugs are owned by Directus (PageRegistry). This file only
 * handles sub-segment translation for nested routes (e.g., vehicle brand URLs).
 */

export type Language = "fr" | "de";

const SEGMENT_TRANSLATIONS: Record<string, Record<Language, string>> = {
  marque: { fr: "marque", de: "marke" },
  marke: { fr: "marque", de: "marke" },
  marques: { fr: "marques", de: "marken" },
  marken: { fr: "marques", de: "marken" },
};

function translateSegment(segment: string, targetLanguage: Language): string {
  return SEGMENT_TRANSLATIONS[segment]?.[targetLanguage] ?? segment;
}

/**
 * Convert a URL path to a new language using the PageRegistry.
 * Falls back to translating sub-segments for nested paths.
 */
export function convertPathToLanguage(
  currentPath: string,
  targetLanguage: Language,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pageRegistry?: Record<string, any>,
): string | null {
  const match = currentPath.match(/^\/([a-z]{2})(\/.*)?$/);
  if (!match) return `/${targetLanguage}`;

  const [, currentLang, remainingPath] = match;
  if (!remainingPath || remainingPath === "/") return `/${targetLanguage}`;

  const segments = remainingPath.slice(1).split("/").filter(Boolean);
  if (segments.length === 0) return `/${targetLanguage}`;

  const firstSlug = segments[0];

  // Use PageRegistry for first-segment translation
  if (pageRegistry) {
    for (const page of Object.values(pageRegistry)) {
      if (page.slugs?.[currentLang as Language] === firstSlug) {
        const targetFirstSlug = page.slugs?.[targetLanguage];
        if (targetFirstSlug) {
          const translatedSegments = [targetFirstSlug];
          for (let i = 1; i < segments.length; i++) {
            translatedSegments.push(
              translateSegment(segments[i], targetLanguage),
            );
          }
          return `/${targetLanguage}/${translatedSegments.join("/")}`;
        }
        return `/${targetLanguage}`;
      }
    }
  }

  // Unknown first segment — try sub-segment translation as last resort
  const translatedSegments = segments.map((seg) =>
    translateSegment(seg, targetLanguage),
  );
  if (translatedSegments.join("/") !== segments.join("/")) {
    return `/${targetLanguage}/${translatedSegments.join("/")}`;
  }

  return `/${targetLanguage}`;
}
