import { slugify } from "./clean";
import type { ScrapedVehicle } from "./types";

export interface BrandRow {
  name: string;
  slug: string;
  active_models: number;
}

/** Port of notebook cell 69: group by make, count distinct models. */
export function deriveBrands(rows: ScrapedVehicle[]): BrandRow[] {
  const byMake = new Map<string, { name: string; models: Set<string> }>();

  for (const row of rows) {
    const name = String(row.make ?? "").trim();
    if (!name) continue;
    const slug = slugify(String(row.make_slug || name), "brand");
    const entry = byMake.get(slug) ?? { name, models: new Set<string>() };
    entry.models.add(String(row.model ?? ""));
    byMake.set(slug, entry);
  }

  return [...byMake.entries()]
    .map(([slug, v]) => ({ name: v.name, slug, active_models: v.models.size }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function buildBrandPayload(
  brand: BrandRow,
  isCreate: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: brand.name,
    active_models: brand.active_models,
  };
  if (isCreate) {
    payload.slug = brand.slug;
    payload.status = "draft";
  }
  return payload;
}
