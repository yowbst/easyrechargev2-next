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

export interface ActivePartner {
  id: string;
  name: string;
  uid: string | null;
}

/** Active production partners, with only the fields the pipeline needs. */
export async function fetchActivePartners(
  fetcher: typeof directusFetch = directusFetch,
): Promise<ActivePartner[]> {
  const res = await fetcher<{ data: { id: string; name: string; uid: string | null }[] }>(
    `/items/partners?fields=id,name,uid&filter[environment][_eq]=production&filter[status][_eq]=active&limit=-1`,
    { next: { revalidate: 0 } },
  );
  return res.data.map((p) => ({ id: p.id, name: p.name, uid: normalizeUid(p.uid) }));
}

/** Active partners the plan could not link to a company row: missing UID, or UID not found. */
export function unmatchedPartners(partners: ActivePartner[], companyUids: Set<string>): { partner: ActivePartner; reason: "no_uid" | "not_found" }[] {
  return partners
    .filter((p) => !p.uid || !companyUids.has(p.uid))
    .map((p) => ({ partner: p, reason: p.uid ? ("not_found" as const) : ("no_uid" as const) }));
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
