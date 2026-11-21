import { POSTCODE_COORDS } from "@/shared/swiss-postcode-coordinates";

/** [lat, lng] of a postcode: exact PLZ + additional digit first, then the PLZ mean, else null. */
export function lookupPostcode(
  postalCode: string,
  additionalDigit?: string | number | null,
  table: Readonly<Record<string, readonly [number, number]>> = POSTCODE_COORDS,
): readonly [number, number] | null {
  const plz = postalCode.trim();
  if (additionalDigit !== undefined && additionalDigit !== null && additionalDigit !== "") {
    const exact = table[`${plz}${String(additionalDigit).padStart(2, "0")}`];
    if (exact) return exact;
  }
  return table[plz] ?? null;
}
