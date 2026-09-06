/**
 * `site_settings.global_config` mixes public presentation values (stats, SLAs,
 * Trustpilot, the Google Ads tag) with things that must never leave the server:
 * the Make webhook URLs that accept quote and contact submissions, the dispatch
 * engine's test-email patterns, and its billing configuration.
 *
 * Anything handed to a client component is serialised into the page the browser
 * receives, so passing the whole object publishes all of it. TypeScript does not
 * catch this: excess-property checking only applies to object literals, and the
 * config arrives as a variable — so a prop typed with four keys silently accepts
 * an object carrying twenty.
 *
 * Pick explicitly instead. A key that is not named here does not reach the
 * browser, and adding a secret to `global_config` later cannot leak by default.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConfig = Record<string, any>;

export interface PublicQuoteConfig {
  stats?: { installations?: number; requests?: number };
  trustpilot?: { score?: number };
  slas?: {
    first_contact?: { value?: number; unit?: string };
    quote_delivery_timeline?: { value?: number | string; unit?: string };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  google_ads?: any;
}

/** The only keys of `global_config` the quote form is allowed to see. */
export const PUBLIC_QUOTE_CONFIG_KEYS = [
  "stats",
  "trustpilot",
  "slas",
  "google_ads",
] as const;

export function pickPublicQuoteConfig(
  globalConfig: AnyConfig | null | undefined,
): PublicQuoteConfig {
  const gc = globalConfig ?? {};
  const out: AnyConfig = {};
  for (const key of PUBLIC_QUOTE_CONFIG_KEYS) {
    if (gc[key] !== undefined) out[key] = gc[key];
  }
  return out as PublicQuoteConfig;
}
