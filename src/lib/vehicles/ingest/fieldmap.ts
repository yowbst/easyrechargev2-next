import type { ScrapedVehicle } from "./types";

type Caster = (v: unknown) => unknown;
const asString: Caster = (v) => String(v);
const asIs: Caster = (v) => v;
const asBool: Caster = (v) => Boolean(v);

export interface FieldMapping {
  /** Source key, dot-notation supported. */
  from: string;
  /** Directus column. */
  to: string;
  cast: Caster;
  /** Written on create only. */
  createOnly?: boolean;
}

/** Port of notebook cell 100 VEHICLE_MAP. */
export const VEHICLE_MAP: FieldMapping[] = [
  { from: "title_v2", to: "name", cast: asString },
  { from: "slug", to: "slug", cast: asString, createOnly: true },
  { from: "model", to: "model", cast: asString },
  { from: "id", to: "short_id", cast: asString },
  { from: "availability", to: "availability", cast: asString },
  { from: "available", to: "is_available", cast: asBool },

  { from: "car_url", to: "evdb_url", cast: asString },
  { from: "metadata.parsed_at", to: "evdb_time_fetched", cast: asString },
  { from: "evdb_id", to: "evdb_id", cast: asString },
  { from: "breadcrumb", to: "evdb_breadcrumb", cast: asString },
  { from: "images_urls", to: "evdb_images_urls", cast: asIs },
  { from: "meta", to: "evdb_meta", cast: asIs },

  { from: "price.de.value", to: "price_de", cast: asString },
  { from: "price.nl.value", to: "price_nl", cast: asString },
  { from: "price.uk.value", to: "price_uk", cast: asString },

  { from: "date", to: "date_range_active", cast: asIs },

  { from: "range", to: "range", cast: asIs },
  { from: "battery", to: "battery", cast: asIs },
  { from: "efficiency", to: "efficiency", cast: asIs },
  { from: "weight", to: "weight", cast: asIs },
  { from: "acceleration_0100", to: "acceleration", cast: asIs },
  { from: "range_1stop", to: "range_1stop", cast: asIs },
  { from: "fastcharge", to: "fastcharge", cast: asIs },
  { from: "towing_weight", to: "towing_weight", cast: asIs },
  { from: "cargo_cap", to: "cargo_capacity", cast: asIs },
  { from: "price_perrange", to: "price_per_range", cast: asIs },

  { from: "pricing_availability", to: "pricing_availability", cast: asIs },
  { from: "real_range", to: "real_range", cast: asIs },
  { from: "distance_suitability", to: "distance_suitability", cast: asIs },
  { from: "battery_details", to: "battery_details", cast: asIs },
  { from: "charging", to: "charging", cast: asIs },
  { from: "performance", to: "performance", cast: asIs },
  { from: "v2x_charging", to: "v2x_charging", cast: asIs },
  { from: "energy_consumption", to: "energy_consumption", cast: asIs },
  { from: "real_energy_consumption", to: "real_energy_consumption", cast: asIs },
  { from: "dimensions_weight", to: "dimensions_weight", cast: asIs },
  { from: "misc", to: "miscellaneous", cast: asIs },
  { from: "preceding_model", to: "preceding_model", cast: asIs },
  {
    from: "home_destination_charging_details",
    to: "home_destination_charging_details",
    cast: asIs,
  },
];

function getIn(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function buildPayload(
  row: ScrapedVehicle,
  opts: { isCreate: boolean; brandId?: string | null },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const m of VEHICLE_MAP) {
    if (m.createOnly && !opts.isCreate) continue;

    const raw = getIn(row, m.from);
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string" && !raw.trim()) continue;

    payload[m.to] = m.cast(raw);
  }

  if (opts.brandId) payload.brand = opts.brandId;

  // Only ever on create. Setting this on update would draft the live catalogue.
  if (opts.isCreate) payload.status = "draft";

  return payload;
}
