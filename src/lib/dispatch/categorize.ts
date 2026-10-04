import type { LeadCategory } from "./types";
import type { Product } from "@/lib/products";

/** PV size from which a battery lead is "large" (inclusive), in kWc. */
export const PV_LARGE_THRESHOLD_KWC = 10;

const NON_DISPATCHABLE: ReadonlySet<LeadCategory> = new Set(["no_pv"]);

/** Derive the lead pricing category from quote form data, per product. */
export function deriveLeadCategory(product: Product, data: Record<string, unknown>): LeadCategory {
  return product === "battery" ? deriveBatteryCategory(data) : deriveEcpCategory(data);
}

/** False for categories that are stored but never sent to a partner. */
export function isDispatchable(category: LeadCategory): boolean {
  return !NON_DISPATCHABLE.has(category);
}

/**
 * Charger funnel. Field names match src/components/quote-shell/products/ecp/fields.ts:
 *   - housingStatus: "owner" | "co-owner" | "tenant"
 *   - solarEquipment: "exists" | "in-progress" | "none" | ""
 *
 * Co-owners are a distinct category: same housing pattern as owners but
 * different install logistics (syndicate approval, shared decisions) so
 * the price typically differs. "in-progress" solar counts as having solar
 * (system will exist by the time the EV charger is installed).
 */
function deriveEcpCategory(data: Record<string, unknown>): LeadCategory {
  const housingStatus = String(data.housingStatus ?? "").toLowerCase();
  const solarEquipment = String(data.solarEquipment ?? "").toLowerCase();

  const hasSolar = solarEquipment === "exists" || solarEquipment === "in-progress";

  if (housingStatus === "co-owner") {
    return hasSolar ? "co_owner_solar" : "co_owner_no_solar";
  }
  if (housingStatus === "owner") {
    return hasSolar ? "owner_solar" : "owner_no_solar";
  }
  return hasSolar ? "tenant_solar" : "tenant_no_solar";
}

/**
 * Battery funnel. Housing status × PV size. A PV size we do not know
 * ("na", missing, unparseable) counts as small: the partner is never charged
 * the large-lead price on a guess.
 */
function deriveBatteryCategory(data: Record<string, unknown>): LeadCategory {
  const solar = String(data.solarEquipment ?? "").toLowerCase();
  if (solar !== "exists" && solar !== "in-progress") return "no_pv";

  const housing = String(data.housingStatus ?? "").toLowerCase();
  if (housing !== "owner" && housing !== "co-owner") return "no_pv";

  const size = pvSizeKwc(data.pvPower) >= PV_LARGE_THRESHOLD_KWC ? "large" : "small";
  return housing === "owner" ? `owner_pv_${size}` : `co_owner_pv_${size}`;
}

/** kWc as a finite number, or NaN when unknown (Infinity included). */
export function pvSizeKwc(raw: unknown): number {
  let n = Number.NaN;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string" && raw !== "na" && raw.trim() !== "") n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}
