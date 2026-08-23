import { slugify } from "./clean";
import type { ScrapedVehicle } from "./types";

type Row = Record<string, unknown>;

/**
 * The DETAILS parser's PROD return is { vehicle: JSON.stringify(vehicle) }.
 * Dev mode returns the object directly, so tolerate both.
 */
export function unwrapDetails(records: unknown[]): Row[] {
  const out: Row[] = [];

  for (const rec of records) {
    if (typeof rec !== "object" || rec === null) continue;
    const wrapper = rec as Row;

    if (typeof wrapper.vehicle === "string") {
      try {
        out.push(JSON.parse(wrapper.vehicle) as Row);
      } catch {
        // One malformed record must not destroy an entire scrape.
        continue;
      }
    } else if (wrapper.vehicle && typeof wrapper.vehicle === "object") {
      out.push(wrapper.vehicle as Row);
    } else {
      out.push(wrapper);
    }
  }

  return out;
}

/** Port of notebook cell 19. */
export function classifyAvailability(s: unknown): boolean | "unknown" {
  const text = typeof s === "string" ? s : "";
  if (text.includes("Available to order")) return true;
  if (text.includes("Discontinued")) return false;
  return "unknown";
}

/** Identity fields that only LIST is authoritative for. */
const LIST_WINS = [
  "evdb_id",
  "id",
  "make",
  "model",
  "year",
  "date",
  "rank",
  "availability",
  "range",
  "battery",
  "efficiency",
  "weight",
  "acceleration_0100",
  "range_1stop",
  "fastcharge",
  "towing_weight",
  "cargo_cap",
  "price_perrange",
  "price",
  "thumb_url",
];

export function mergeListAndDetails(
  list: Row[],
  details: Row[],
): { merged: ScrapedVehicle[]; unmatched: string[] } {
  const byUrl = new Map<string, Row>();
  for (const d of details) {
    const url = typeof d.car_url === "string" ? d.car_url : null;
    if (url) byUrl.set(url, d);
  }

  const merged: ScrapedVehicle[] = [];
  const unmatched: string[] = [];

  for (const row of list) {
    const url = typeof row.car_url === "string" ? row.car_url : "";
    const detail = byUrl.get(url);

    if (!detail) {
      // battery_details lives only in DETAILS; without it the generated slug would
      // silently lose its kWh component and drift from the live URL.
      unmatched.push(url);
      continue;
    }

    const combined: Row = { ...detail };
    for (const key of LIST_WINS) {
      if (row[key] !== undefined) combined[key] = row[key];
    }

    combined.available = classifyAvailability(row.availability);
    combined.make_slug = slugify(String(row.make ?? ""), "brand");

    merged.push(combined as unknown as ScrapedVehicle);
  }

  return { merged, unmatched };
}
