import { directusFetch } from "@/lib/directus";
import { normalizeUid } from "./normalize";
import type { CmsCompany } from "./types";

const PAGE = 500;

/** Every `companies` row, paged. The pipeline diffs against all of them. */
export async function fetchAllCmsCompanies(
  fetcher: typeof directusFetch = directusFetch,
): Promise<CmsCompany[]> {
  const rows: CmsCompany[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetcher<{ data: CmsCompany[] }>(
      `/items/companies?fields=*&limit=${PAGE}&offset=${offset}&sort=ehraid`,
      { next: { revalidate: 0 } },
    );
    rows.push(...res.data);
    if (res.data.length < PAGE) break;
  }
  return rows;
}

/**
 * normalised UID -> partners.id for production partners. Reads only the three
 * fields it needs: the partners collection also holds tokens and prices.
 */
export async function fetchPartnerUids(
  fetcher: typeof directusFetch = directusFetch,
): Promise<Map<string, string>> {
  const res = await fetcher<{ data: { id: string; uid: string | null }[] }>(
    `/items/partners?fields=id,uid&filter[environment][_eq]=production&limit=-1`,
    { next: { revalidate: 0 } },
  );
  const map = new Map<string, string>();
  for (const p of res.data) {
    const uid = normalizeUid(p.uid);
    if (uid) map.set(uid, p.id);
  }
  return map;
}
