import { isNumericField, type ScrapedVehicle } from "./types";

/** Port of notebook cell 9. */
export function slugify(s: string, fallback = "vehicle", maxLen = 120): string {
  if (!s) return fallback;

  let out = String(s).trim().toLowerCase();

  // Strip accents: é → e
  out = out.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  // Drop any remaining non-ASCII
  out = out.replace(/[^\x00-\x7F]/g, "");

  out = out.replace(/&/g, " and ").replace(/\+/g, " plus ");
  out = out.replace(/[–—−]/g, "-");
  out = out.replace(/[^a-z0-9\- ]+/g, "");
  out = out.replace(/\s+/g, "-");
  out = out.replace(/-{2,}/g, "-");
  out = out.replace(/^-+|-+$/g, "");

  if (out.length > maxLen) out = out.slice(0, maxLen).replace(/-+$/, "");

  return out || fallback;
}

/** Port of notebook cell 57 `clean_model_column`, applied per row. */
export function cleanModel(model: string, make: string): string {
  let out = String(model ?? "").trim();
  out = out.replace(/\s+/g, " ");
  // Keep word chars, whitespace, hyphen, parentheses
  out = out.replace(/[^\w\s\-()]/g, "");
  const escaped = String(make ?? "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (escaped) out = out.replace(new RegExp(`^${escaped}\\s+`, "i"), "");
  return out.trim();
}

function normalizeModel(text: string): string {
  if (typeof text !== "string") return "";
  let s = text.trim();
  s = s.replace(/\s+-\s+/g, " ");
  s = s.replace(/\b(\d+)\s*kW\b/gi, "$1kW");
  s = s.replace(/\b(\d+)\s*hp\b/gi, "$1HP");
  s = s.replace(/\s{2,}/g, " ");
  return s.replace(/^[\s-]+|[\s-]+$/g, "");
}

function removeBatteryMention(text: string): string {
  if (typeof text !== "string") return "";
  let s = text.trim();
  s = s.replace(/\b([12]?\d{1,2}(\.\d{1,2})?\s*kWh)\b|\bkWh\b/gi, "");
  s = s.replace(/\s{2,}/g, " ");
  return s.replace(/^[\s-]+|[\s-]+$/g, "");
}

function getBatteryStr(details: unknown): string | null {
  if (typeof details !== "object" || details === null) return null;
  const cap = (details as Record<string, unknown>).nominal_capacity;
  if (!isNumericField(cap) || !Number.isFinite(cap.value)) return null;
  return `${Math.round(cap.value)}${cap.unit}`;
}

function getRangeKm(r: unknown): number | null {
  if (isNumericField(r)) {
    if (!Number.isFinite(r.value)) return null;
    if (!r.unit || r.unit.toLowerCase().includes("km")) return Math.round(r.value);
    return null;
  }
  const n = Number(r);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function getYearsStr(year: unknown): string | null {
  if (typeof year !== "object" || year === null) {
    const n = Number(year);
    return Number.isFinite(n) && n ? `${Math.trunc(n)}-` : null;
  }
  const y = year as { from?: number | null; to?: number | null };
  if (y.from && y.to) return `${Math.trunc(y.from)}-${Math.trunc(y.to)}`;
  if (y.from) return `${Math.trunc(y.from)}-`;
  return null;
}

/** Port of notebook cell 60 `clean_title_v2`. */
export function buildTitle(row: ScrapedVehicle): string {
  const make = String(row.make ?? "").trim();
  const modelCleaned = cleanModel(String(row.model ?? ""), make);
  const model = removeBatteryMention(normalizeModel(modelCleaned));

  const parts = [make, model].filter(Boolean);

  const battery = getBatteryStr(row.battery_details);
  if (battery) parts.push(battery);

  const rangeKm = getRangeKm(row.range);
  if (rangeKm) parts.push(`${rangeKm}km`);

  let title = parts.join(" ").trim();
  const years = getYearsStr(row.year);
  if (years) title += ` [${years}]`;

  return title;
}

export function generateSlug(row: ScrapedVehicle): string {
  return slugify(buildTitle(row));
}
