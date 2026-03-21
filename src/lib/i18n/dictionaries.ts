/**
 * Server-side translation utilities.
 *
 * Replaces i18next: translations are fetched from Directus and flattened into
 * plain objects. Server Components use them directly; Client Components receive
 * them as a `dictionary` prop with a simple `t(key)` lookup.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CmsData = Record<string, any>;

/** Simple {var} interpolation for translation strings. */
export function t(
  dictionary: Record<string, string>,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let value = dictionary[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return value;
}

/**
 * Flatten nested object into dot-notation keys.
 * Handles nested objects and arrays of objects with 'id' keys.
 */
export function flattenTranslations(
  obj: CmsData,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      continue;
    } else if (typeof value === "string") {
      result[newKey] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[newKey] = String(value);
    } else if (Array.isArray(value)) {
      value.forEach((item: CmsData, idx: number) => {
        if (typeof item === "object" && item !== null && item.id) {
          const itemPrefix = `${newKey}.${item.id}`;
          Object.assign(result, flattenTranslations(item, itemPrefix));
        } else if (
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean"
        ) {
          result[`${newKey}.${idx}`] = String(item);
        }
      });
    } else if (typeof value === "object") {
      Object.assign(result, flattenTranslations(value, newKey));
    }
  }

  return result;
}

/** Normalize {{var}} → {var} to match single-brace interpolation. */
function normalizePlaceholders(s: string): string {
  return s.replace(/\{\{(\w+)\}\}/g, "{$1}");
}

/** Flatten + normalize placeholders. */
function flattenWithNormalize(
  obj: CmsData,
  prefix = "",
): Record<string, string> {
  const flat = flattenTranslations(obj, prefix);
  for (const k of Object.keys(flat)) {
    flat[k] = normalizePlaceholders(flat[k]);
  }
  return flat;
}

/**
 * Extract translations from a Directus layout payload.
 * Returns a flat dictionary with keys like `layout.footer.*`, `layout.nav.header.*`, etc.
 */
export function extractLayoutDictionary(layoutData: CmsData): Record<string, string> {
  const translations: Record<string, string> = {};
  const t0 = layoutData?.translations?.[0];

  if (t0?.footer && typeof t0.footer === "object") {
    Object.assign(translations, flattenWithNormalize(t0.footer, "layout.footer"));
  }

  if (t0?.header && typeof t0.header === "object") {
    Object.assign(translations, flattenWithNormalize(t0.header, "layout.header"));
  }

  if (t0?.shared && typeof t0.shared === "object") {
    Object.assign(translations, flattenWithNormalize(t0.shared, "shared"));
    if (typeof t0.shared.common === "object") {
      Object.assign(
        translations,
        flattenWithNormalize(t0.shared.common, "common"),
      );
    }
  }

  if (t0?.blocks && typeof t0.blocks === "object") {
    Object.assign(translations, flattenWithNormalize(t0.blocks, "blocks"));
  }

  // Navigation labels
  const addNavItems = (items: CmsData[] | undefined, prefix: string) => {
    (items || []).forEach((item) => {
      const key = item?.key;
      const label = item?.translations?.[0]?.label;
      if (key && label) {
        translations[`${prefix}.${key}`] = normalizePlaceholders(label);
      }
    });
  };

  addNavItems(
    layoutData?.header_navigation?.items,
    "layout.nav.header",
  );
  addNavItems(
    layoutData?.footer_quicklinks_navigation?.items,
    "layout.nav.footer_quicklinks",
  );
  addNavItems(
    layoutData?.footer_about_navigation?.items,
    "layout.nav.footer_about",
  );

  return translations;
}

/**
 * Extract translations from a Directus page payload.
 * Returns a flat dictionary with keys like `pages.{routeId}.*`, `pages.{routeId}.blocks.*`, etc.
 */
export function extractPageDictionary(
  routeId: string,
  page: CmsData,
  langCode: string,
): Record<string, string> {
  const pickTrans = (arr: CmsData[] | undefined) => {
    if (!arr?.length) return undefined;
    return arr.find((t) => t.languages_code === langCode) ?? arr[0];
  };

  const translations: Record<string, string> = {};
  const t0 = pickTrans(page?.translations);

  // Page content
  if (t0?.content && typeof t0.content === "object") {
    Object.assign(
      translations,
      flattenTranslations(t0.content, `pages.${routeId}`),
    );
  }

  // Page body (rich text string)
  if (t0?.body && typeof t0.body === "string") {
    translations[`pages.${routeId}.body`] = t0.body;
  }

  // SEO
  if (t0?.seo && typeof t0.seo === "object") {
    const seoNormalized = normalizeSEO(t0.seo as Record<string, unknown>);
    Object.assign(
      translations,
      flattenTranslations(seoNormalized, `pages.${routeId}.seo`),
    );
    Object.assign(
      translations,
      flattenTranslations(seoNormalized, "page.seo"),
    );
  }

  // Blocks (M2A junction)
  const BLOCK_KEY_MAP: Record<string, string> = {
    getquote: "get-quote",
    miniquote: "mini-quote",
  };

  const blocks = page?.blocks || [];
  for (const junction of blocks) {
    const collection = junction?.collection;
    const item = junction?.item;
    if (!item) continue;

    const rawKey = collection?.replace("block_", "") || item.key || "";
    if (!rawKey) continue;
    const blockKey = BLOCK_KEY_MAP[rawKey] || rawKey;

    const bt = pickTrans(item.translations);
    if (!bt) continue;

    const isSystemField = (f: string) =>
      f === "id" || f === "languages_code" || f.endsWith("_id");

    const prefix = `pages.${routeId}.blocks.${blockKey}`;

    if (bt.content && typeof bt.content === "object") {
      Object.assign(translations, flattenTranslations(bt.content, prefix));
    }

    if (bt.headline) {
      translations[`${prefix}.title`] = bt.headline;
      translations[`${prefix}.headline`] = bt.headline;
    }
    if (bt.subheadline) {
      translations[`${prefix}.subtitle`] = bt.subheadline;
      translations[`${prefix}.subheadline`] = bt.subheadline;
    }

    if (Array.isArray(bt.ctas) && bt.ctas.length > 0) {
      bt.ctas.forEach((cta: CmsData, idx: number) => {
        if (!cta) return;
        if (cta.label) {
          if (idx === 0) translations[`${prefix}.cta.label`] = cta.label;
          translations[`${prefix}.cta.${idx}.label`] = cta.label;
        }
      });
    }

    for (const [field, value] of Object.entries(bt)) {
      if (isSystemField(field)) continue;
      if (["headline", "subheadline", "content", "ctas"].includes(field))
        continue;
      if (value === null || value === undefined) continue;

      if (typeof value === "string") {
        translations[`${prefix}.${field}`] = value;
      } else if (typeof value === "number" || typeof value === "boolean") {
        translations[`${prefix}.${field}`] = String(value);
      } else if (typeof value === "object" && !Array.isArray(value)) {
        Object.assign(
          translations,
          flattenTranslations(value, `${prefix}.${field}`),
        );
      }
    }
  }

  // Normalize placeholders
  for (const key of Object.keys(translations)) {
    translations[key] = normalizePlaceholders(translations[key]);
  }

  return translations;
}

/**
 * Normalize Directus SEO field names to standard keys.
 */
function normalizeSEO(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    switch (key) {
      case "meta_description":
        out["description"] = value;
        break;
      case "og_image":
        out["image"] = value;
        break;
      case "no_index":
        out["noIndex"] = value;
        break;
      default:
        out[key] = value;
    }
  }
  return out;
}
