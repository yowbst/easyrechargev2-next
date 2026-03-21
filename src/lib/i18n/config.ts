export type AppLangSlug = "fr" | "de" | "en";
export type DirectusLocale = "fr-FR" | "de-DE";

export const SUPPORTED_LANGS: AppLangSlug[] = ["fr", "de", "en"];
export const DEFAULT_LANG: AppLangSlug = "fr";

export interface Locales {
  slug: AppLangSlug;
  directus: DirectusLocale;
}

const localeTable: Record<AppLangSlug, Locales> = {
  fr: { slug: "fr", directus: "fr-FR" },
  de: { slug: "de", directus: "de-DE" },
  en: { slug: "en", directus: "fr-FR" }, // EN falls back to fr-FR in Directus
};

export function getLocales(urlLang: string): Locales {
  return localeTable[urlLang as AppLangSlug] ?? localeTable.fr;
}

export function slugToDirectusLocale(slug: string): DirectusLocale {
  return (localeTable[slug as AppLangSlug] ?? localeTable.fr).directus;
}

export function directusLocaleToSlug(locale: string): AppLangSlug {
  return locale.startsWith("de") ? "de" : "fr";
}

export function isValidLang(lang: string): lang is AppLangSlug {
  return SUPPORTED_LANGS.includes(lang as AppLangSlug);
}

// ─── Route slug mappings ─────────────────────────────────

const routeSlugs: Record<string, Record<AppLangSlug, string>> = {
  vehicles: { fr: "vehicules", de: "fahrzeuge", en: "vehicles" },
  brands: { fr: "marques", de: "marken", en: "brands" },
  quote: { fr: "devis", de: "offerte", en: "quote" },
};

export function getRouteSlug(
  langSlug: string,
  route: keyof typeof routeSlugs,
): string {
  return routeSlugs[route]?.[langSlug as AppLangSlug] ?? routeSlugs[route].fr;
}

// ─── Date / number locale mappings ───────────────────────

const dateLocales: Record<AppLangSlug, string> = {
  fr: "fr-CH",
  de: "de-CH",
  en: "en-US",
};

const i18nLocales: Record<AppLangSlug, string> = {
  fr: "fr-FR",
  de: "de-DE",
  en: "en-US",
};

export function getDateLocale(langSlug: string): string {
  return dateLocales[langSlug as AppLangSlug] ?? dateLocales.fr;
}

export function getI18nLocale(langSlug: string): string {
  return i18nLocales[langSlug as AppLangSlug] ?? i18nLocales.fr;
}
