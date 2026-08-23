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
    const key = String(row.evdb_id);
    const existing = idx.get(key);
    if (existing) {
      // Last-wins is preserved (unchanged behaviour), but a shadowed row
      // would otherwise vanish with zero trace — it's not even reported as
      // GONE, since `seen` already has its evdb_id from the surviving row.
      // This can't happen today (562 distinct ids, confirmed at the
      // acceptance gate), but it's exactly the residue a botched write
      // would leave, and it hides itself without this warning.
      console.warn(
        `[vehicles-ingest] duplicate evdb_id "${key}" in CMS: item ${existing.id} is shadowed by item ${row.id} (keeping the latter).`,
      );
    }
    idx.set(key, row);
  }
  return idx;
}

/** Fetches the fields of a vehicle_brands row that `brands` actually compares/updates. */
export async function fetchBrandRowBySlug(
  slug: string,
): Promise<{ id: string; name: string; active_models: number } | null> {
  const res = await directusFetch<{
    data: Array<{ id: string; name: string; active_models: number | null }>;
  }>(
    `/items/vehicle_brands?filter[slug][_eq]=${encodeURIComponent(slug)}&fields=id,name,active_models&limit=1`,
    { next: { revalidate: 0 } },
  );
  const row = res.data?.[0];
  return row ? { id: row.id, name: row.name, active_models: row.active_models ?? 0 } : null;
}

export async function fetchBrandIdBySlug(slug: string): Promise<string | null> {
  const row = await fetchBrandRowBySlug(slug);
  return row?.id ?? null;
}
