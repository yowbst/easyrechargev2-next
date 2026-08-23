import { directusFetch } from "@/lib/directus";
import type { CmsVehicle } from "./types";

const PAGE = 200;

/** Every vehicle, all fields, no ISR cache — this is a write-path read. */
export async function fetchAllCmsVehicles(): Promise<CmsVehicle[]> {
  const out: CmsVehicle[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await directusFetch<{ data: CmsVehicle[] }>(
      `/items/vehicles?fields=*&limit=${PAGE}&offset=${offset}&sort=id`,
      { next: { revalidate: 0 } },
    );
    const batch = res.data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) return out;
  }
}

export function indexByEvdbId(rows: CmsVehicle[]): Map<string, CmsVehicle> {
  const idx = new Map<string, CmsVehicle>();
  for (const row of rows) {
    if (row.evdb_id === null || row.evdb_id === undefined || row.evdb_id === "") continue;
    idx.set(String(row.evdb_id), row);
  }
  return idx;
}

export async function fetchBrandIdBySlug(slug: string): Promise<string | null> {
  const res = await directusFetch<{ data: Array<{ id: string }> }>(
    `/items/vehicle_brands?filter[slug][_eq]=${encodeURIComponent(slug)}&fields=id&limit=1`,
    { next: { revalidate: 0 } },
  );
  return res.data?.[0]?.id ?? null;
}
