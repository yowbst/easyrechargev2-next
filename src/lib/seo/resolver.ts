/**
 * Pure SEO helper functions ported from server/seo/seoResolver.ts.
 * No framework dependencies — used by generateMetadata in each page.
 */

const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";
const DIRECTUS_URL = process.env.DIRECTUS_URL || "";

// ── Types ──────────────────────────────────────────────────────────────

export interface CmsSEO {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  noIndex?: boolean;
}

export interface SeoData {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  ogType: "website" | "article";
  robots?: string;
  lang: string;
  alternates: { lang: string; url: string }[];
  articleMeta?: {
    publishedTime?: string;
    modifiedTime?: string;
    section?: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jsonLd?: any;
}

// ── Title / description helpers ─────────────────────────────────────────

const TITLE_SUFFIX = " | easyRecharge";
const TITLE_CONTENT_MAX = 60 - TITLE_SUFFIX.length;
const DESC_MAX = 155;

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&[a-zA-Z]+;/g, (entity) => {
      const entities: Record<string, string> = {
        "&nbsp;": " ",
        "&eacute;": "é",
        "&egrave;": "è",
        "&ecirc;": "ê",
        "&euml;": "ë",
        "&agrave;": "à",
        "&acirc;": "â",
        "&ocirc;": "ô",
        "&ucirc;": "û",
        "&uuml;": "ü",
        "&ccedil;": "ç",
        "&iuml;": "ï",
        "&aring;": "å",
        "&ouml;": "ö",
        "&auml;": "ä",
        "&ndash;": "–",
        "&mdash;": "—",
        "&laquo;": "«",
        "&raquo;": "»",
        "&hellip;": "…",
        "&rsquo;": "\u2019",
        "&lsquo;": "\u2018",
        "&rdquo;": "\u201D",
        "&ldquo;": "\u201C",
      };
      return entities[entity] || entity;
    });
}

export function truncate(text: string, max: number = DESC_MAX): string {
  if (!text || text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max - 1);
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, max - 1)) + "\u2026";
}

export function normalizeTitle(raw: string): string {
  const content = raw
    .replace(/\s*[|\-\u2013\u2014]\s*easyRecharge\s*$/i, "")
    .trim();
  return truncate(content, TITLE_CONTENT_MAX) + TITLE_SUFFIX;
}

// ── Template SEO logic ──────────────────────────────────────────────────

export function extractItemSEO(seoRaw: unknown): CmsSEO | undefined {
  if (!seoRaw || typeof seoRaw !== "object") return undefined;
  const raw = seoRaw as Record<string, unknown>;

  const str = (k: string) => {
    const v = raw[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  const title = str("title");
  const description = str("description") || str("meta_description");
  const canonical = str("canonical");
  const image = str("image") || str("og_image");

  let noIndex: boolean | undefined;
  if (typeof raw.noIndex === "boolean") noIndex = raw.noIndex;
  else if (typeof raw.no_index === "boolean")
    noIndex = raw.no_index as boolean;
  else if (raw.noIndex === "true" || raw.no_index === "true") noIndex = true;

  if (
    !title &&
    !description &&
    !canonical &&
    !image &&
    noIndex === undefined
  )
    return undefined;
  return { title, description, canonical, image, noIndex };
}

export function mergeItemOverTemplate(
  itemSEO: CmsSEO | undefined,
  templateSEO: CmsSEO | undefined,
): CmsSEO | undefined {
  if (!templateSEO && !itemSEO) return undefined;
  if (!templateSEO) return itemSEO;
  if (!itemSEO) return templateSEO;
  return {
    title: itemSEO.title || templateSEO.title,
    description: itemSEO.description || templateSEO.description,
    canonical: itemSEO.canonical || templateSEO.canonical,
    image: itemSEO.image || templateSEO.image,
    noIndex: itemSEO.noIndex ?? templateSEO.noIndex,
  };
}

export function resolveSEOFieldMappings(
  seo: CmsSEO | undefined,
  fieldMap?: Record<string, unknown>,
): CmsSEO | undefined {
  if (!seo) return undefined;

  const getFieldValue = (fieldName: string): string | undefined => {
    if (!fieldMap) return undefined;
    let val = fieldMap[fieldName];
    if (val === undefined) {
      const lower = fieldName.toLowerCase();
      const key = Object.keys(fieldMap).find((k) => k.toLowerCase() === lower);
      if (key) val = fieldMap[key];
    }
    if (typeof val === "string") return val;
    if (typeof val === "number") return String(val);
    return undefined;
  };

  const resolveValue = (value: string | undefined): string | undefined => {
    if (!value || !fieldMap) return value;

    if (value.startsWith("field:") || value.startsWith("f:")) {
      const fieldName = value.startsWith("f:")
        ? value.substring(2)
        : value.substring(6);
      return getFieldValue(fieldName);
    }

    if (value.includes("{field:") || value.includes("{f:")) {
      let result = value.replace(
        /\{(?:field|f):([^}]+)\}/g,
        (_match, fieldName) => {
          const resolved = getFieldValue(fieldName);
          return resolved !== undefined ? resolved : "";
        },
      );
      result = result
        .replace(/\s{2,}/g, " ")
        .replace(/,\s*,/g, ",")
        .replace(/\.\s*\./g, ".")
        .replace(/\s+([.,])/g, "$1")
        .replace(/([,(])\s*([),.])/g, "$2")
        .trim();
      return result;
    }

    return value;
  };

  return {
    title: resolveValue(seo.title),
    description: resolveValue(seo.description),
    canonical: resolveValue(seo.canonical),
    image: resolveValue(seo.image),
    noIndex: seo.noIndex,
  };
}

// ── Image URL helpers ───────────────────────────────────────────────────

export function resolveImageUrl(imageId?: string): string | undefined {
  if (!imageId) return undefined;
  if (imageId.startsWith("http") || imageId.startsWith("/")) return imageId;
  return `${DIRECTUS_URL}/assets/${imageId}`;
}

export function toAbsoluteImageUrl(imageUrl?: string): string | undefined {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith("http")) return imageUrl;
  return `${SITE_URL}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
}

export function resolveOgImage(
  resolvedSeo: CmsSEO | undefined,
  contentImage?: string,
  heroImage?: string,
): string | undefined {
  if (resolvedSeo?.image)
    return toAbsoluteImageUrl(resolveImageUrl(resolvedSeo.image));
  if (contentImage) return toAbsoluteImageUrl(contentImage);
  if (heroImage) return toAbsoluteImageUrl(resolveImageUrl(heroImage));
  return undefined;
}

// ── Alternate links builder ─────────────────────────────────────────────

export function buildAlternates(
  langPaths: Record<string, string>,
): { lang: string; url: string }[] {
  return Object.entries(langPaths).map(([lang, path]) => ({
    lang,
    url: `${SITE_URL}${path}`,
  }));
}

export function getSiteUrl(): string {
  return SITE_URL;
}
