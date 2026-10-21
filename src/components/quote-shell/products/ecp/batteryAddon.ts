/**
 * Battery add-on of the charger funnel: a visitor with solar and no home
 * battery can also ask for a battery quote. One submit then creates a second,
 * linked battery submission (origin `ecp-addon`). Shared by the funnel and
 * `/api/quote`, which re-checks eligibility.
 */
type Data = Record<string, unknown>;

export const ADDON_ORIGIN = "ecp-addon";

export const ADDON_FIELDS = ["batteryAddon", "batteryAddonPvPower"] as const;

/** Charger answers the battery submission inherits, under the same keys. */
export const ADDON_COPIED_FIELDS = [
  "housingStatus",
  "housingType",
  "solarEquipment",
  "approval",
  "deadline",
  "addressMode",
  "address",
  "streetName",
  "streetNb",
  "postalCode",
  "locality",
  "canton",
  "country",
  "acceptTerms",
] as const;

/** Owners and co-owners with solar (in place or being installed) and no battery. */
export function isBatteryAddonEligible(d: Data): boolean {
  return (
    (d.housingStatus === "owner" || d.housingStatus === "co-owner") &&
    (d.solarEquipment === "exists" || d.solarEquipment === "in-progress") &&
    d.homeBattery === "none"
  );
}

export function wantsBatteryAddon(d: Data): boolean {
  return d.batteryAddon === true && isBatteryAddonEligible(d);
}

export function stripAddon(d: Data): Data {
  const out = { ...d };
  for (const key of ADDON_FIELDS) delete out[key];
  return out;
}

export function buildAddonBatteryData(d: Data): Data {
  const out: Data = { product: "battery" };
  for (const key of ADDON_COPIED_FIELDS) if (key in d) out[key] = d[key];
  const pv = d.batteryAddonPvPower;
  out.pvPower = typeof pv === "number" || pv === "na" ? pv : "";
  return out;
}
