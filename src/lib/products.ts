// Single source of truth for quote-form product keys. A product is a
// distinct lead vertical (own quote funnel, own partner pricing column in
// pricing_policy.settings.prices[product][category], own Google Ads
// conversion actions). Adding one:
//   1. Append the key to PRODUCTS and its Directus page to FUNNEL_ROUTES.
//   2. Register its ProductFunnel in src/components/quote-shell/funnels.ts
//      and its categories in src/lib/dispatch/categorize.ts.
//   3. Add global_config.google_ads.conversions.<key> in Directus.
//   4. Add the product's price column to partner pricing policies.
//   5. Map the product to its Ads conversion action in the Make scenario
//      (module "events:ingest", productDestinationId — see
//      docs/operations/partner-dispatch.md).
export const PRODUCTS = ["ecp", "battery"] as const;

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

/** Product segment of the human-readable quote ref, in the lead's language. */
const REF_LABELS: Record<Product, { fr: string; de: string }> = {
  ecp: { fr: "BORNE", de: "LADESTATION" },
  battery: { fr: "BATTERIE", de: "BATTERIE" },
};

export function productRefLabel(product: unknown, language: unknown): string {
  const labels = REF_LABELS[normalizeProduct(product)];
  return language === "de" ? labels.de : labels.fr;
}

/** Directus page route_id → product of the quote funnel that page hosts. */
export const FUNNEL_ROUTES = {
  quote: "ecp",
  "quote-battery": "battery",
} as const satisfies Record<string, Product>;

export type FunnelRouteId = keyof typeof FUNNEL_ROUTES;

export function isFunnelRoute(routeId: string): routeId is FunnelRouteId {
  return Object.prototype.hasOwnProperty.call(FUNNEL_ROUTES, routeId);
}

export function funnelRouteFor(product: Product): FunnelRouteId {
  const entry = (Object.entries(FUNNEL_ROUTES) as [FunnelRouteId, Product][])
    .find(([, p]) => p === product);
  if (!entry) throw new Error(`No funnel route for product "${product}"`);
  return entry[0];
}

/**
 * Directus pages holding the success-page copy for a product, most specific
 * first. The charger page is the fallback, so a new product only translates
 * what differs.
 */
export function successPageIds(product: Product): string[] {
  return product === "ecp"
    ? ["quote-success"]
    : [`${funnelRouteFor(product)}-success`, "quote-success"];
}

/** Same as successPageIds, for the submission view page. */
export function viewPageIds(product: Product): string[] {
  return product === "ecp"
    ? ["quote-view"]
    : [`${funnelRouteFor(product)}-view`, "quote-view"];
}
