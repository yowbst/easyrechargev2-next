import { DEFAULT_PRODUCT } from "@/lib/products";
import type { Partner, PartnerArea } from "./types";

/**
 * What a partner receives, per product, from its `partner_products` rows
 * (one row per partner × product: status + monthly quota).
 *
 * A partner with no rows yet is served as before the battery launch: charger
 * only, with its legacy `partners.monthly_quota`. Once a partner has any row,
 * each product — the charger included — needs its own active row.
 *
 * Returns null when the partner does not receive the product.
 */
export function partnerProductConfig(
  partner: Partner,
  product: string,
): { monthlyQuota: number } | null {
  const rows = Array.isArray(partner.products) ? partner.products : [];
  if (rows.length === 0) {
    return product === DEFAULT_PRODUCT ? { monthlyQuota: partner.monthly_quota ?? 0 } : null;
  }
  const row = rows.find((r) => r?.product === product);
  if (!row || row.status !== "active") return null;
  return { monthlyQuota: row.monthly_quota ?? 0 };
}

/**
 * Monthly quota of an area for one product (0 = unlimited). The per-canton
 * `quota_override` predates the product split and only applies to the charger.
 */
export function effectiveQuota(area: PartnerArea, product: string): number {
  const base = partnerProductConfig(area.partner, product)?.monthlyQuota ?? 0;
  return product === DEFAULT_PRODUCT ? (area.quota_override ?? base) : base;
}
