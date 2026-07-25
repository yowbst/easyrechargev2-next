// Single source of truth for quote-form product keys. A product is a
// distinct lead vertical (own quote funnel, own partner pricing column in
// pricing_policy.settings.prices[product][category], own Google Ads
// conversion actions). Adding one:
//   1. Append the key to PRODUCTS below.
//   2. Add global_config.google_ads.conversions.<key> in Directus.
//   3. Add the product's price column to partner pricing policies.
//   4. Map the product to its Ads conversion action in the Make scenario
//      (module "events:ingest", productDestinationId — see
//      docs/operations/partner-dispatch.md).
export const PRODUCTS = ["ecp"] as const;

export type Product = (typeof PRODUCTS)[number];

export const DEFAULT_PRODUCT: Product = "ecp";

export function isProduct(raw: unknown): raw is Product {
  return typeof raw === "string" && (PRODUCTS as readonly string[]).includes(raw);
}

/** Coerce untrusted input (form body, Directus page config, DB row) to a
 * valid product key, falling back to the default. Never throws. */
export function normalizeProduct(raw: unknown): Product {
  return isProduct(raw) ? raw : DEFAULT_PRODUCT;
}
