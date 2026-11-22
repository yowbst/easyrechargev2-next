import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import { partnerProductConfig } from "@/lib/dispatch/partner-products";
import type { Partner } from "@/lib/dispatch/types";
import { DEFAULT_PRODUCT } from "@/lib/products";

/** What a public page may show about a partner. Nothing else ever leaves the server. */
export interface PublicPartner {
  id: string;
  name: string;
  slug: string;
  locality: string | null;
  mode: "exclusive" | "shared";
}

/**
 * Explicit allowlist: the partners record also holds tokens, e-mails and prices, so a
 * public query must never ask for `partner.*`.
 */
const FIELDS = [
  "mode",
  "priority_override",
  "partner.id",
  "partner.status",
  "partner.name",
  "partner.slug",
  "partner.locality",
  "partner.priority",
  "partner.monthly_quota",
].join(",");
const PRODUCT_FIELDS = ["partner.products.product", "partner.products.status"].join(",");

export interface AreaRow {
  mode: "exclusive" | "shared";
  priority_override: number | null;
  partner: Pick<Partner, "id" | "status" | "name" | "slug" | "priority" | "monthly_quota" | "products"> & { locality?: string | null };
}

/**
 * The partners a lead from this canton would go to, in the dispatch resolver's terms:
 * an exclusive partner wins alone (lowest priority first); otherwise every shared
 * partner, by priority then name. Quotas are ignored on purpose: a partner over quota
 * still receives the lead (as a gift), so it is still the region's partner.
 */
export function selectRegionPartners(areas: AreaRow[], product: string = DEFAULT_PRODUCT): PublicPartner[] {
  const eligible = areas.filter(
    (a) => a.partner?.status === "active" && partnerProductConfig(a.partner as Partner, product) !== null,
  );
  const prio = (a: AreaRow) => a.priority_override ?? a.partner.priority ?? 100;
  const toPublic = (a: AreaRow): PublicPartner => ({
    id: a.partner.id,
    name: a.partner.name,
    slug: a.partner.slug,
    locality: a.partner.locality ?? null,
    mode: a.mode,
  });
  const exclusive = eligible
    .filter((a) => a.mode === "exclusive")
    .sort((x, y) => prio(x) - prio(y) || x.partner.id.localeCompare(y.partner.id))[0];
  if (exclusive) return [toPublic(exclusive)];
  const seen = new Set<string>();
  return eligible
    .filter((a) => a.mode === "shared")
    .sort((x, y) => prio(x) - prio(y) || x.partner.name.localeCompare(y.partner.name))
    .filter((a) => (seen.has(a.partner.id) ? false : (seen.add(a.partner.id), true)))
    .map(toPublic);
}

/** Active partners for a canton, cached for an hour (a paused partner disappears within it). */
export async function fetchActivePartnersForCanton(
  cantonCode: string,
  fetcher: typeof directusFetch = directusFetch,
): Promise<PublicPartner[]> {
  if (!/^[A-Z]{2}$/.test(cantonCode)) return [];
  const query = (fields: string) => {
    const params = new URLSearchParams();
    params.set("fields", fields);
    params.set("filter[canton][code][_eq]", cantonCode);
    params.set("filter[canton][is_active][_eq]", "true");
    params.set("filter[partner][status][_eq]", "active");
    params.set("filter[partner][environment][_eq]", getEnvironment());
    params.set("filter[status][_eq]", "published");
    params.set("limit", "50");
    return fetcher<{ data: AreaRow[] }>(`/items/partner_areas?${params}`, {
      next: { revalidate: 3600, tags: ["partners-public"] },
    });
  };
  try {
    let res;
    try {
      res = await query(`${FIELDS},${PRODUCT_FIELDS}`);
    } catch (err) {
      // Same fallback as dispatch: without readable product rows, partners are charger-only.
      if (!(err instanceof Error) || !err.message.startsWith("Directus 403")) throw err;
      res = await query(FIELDS);
    }
    return selectRegionPartners(res?.data ?? []);
  } catch (err) {
    // A page must still render when Directus hiccups; the card simply does not show.
    console.warn(`[partners-public] ${cantonCode}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
