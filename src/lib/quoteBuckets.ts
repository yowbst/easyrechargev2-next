// Tap-button "bucket" choices that replaced the quote-form sliders
// (2026-07). Stored values stay numeric so the Make webhook payload,
// partner emails, and dispatch categorization are unchanged; the number
// is the bucket's representative value (e.g. "> 30 m" stores 40 — same
// false precision the slider produced, but one tap instead of a drag).
// Labels are numeric + unit → language-neutral, no Directus keys needed.
// A page-config field may override with `buckets: [{ value, label }]`.

export interface BucketOption {
  value: number;
  label: string;
}

export const DEFAULT_BUCKETS: Record<string, { value: number; label: string }[]> = {
  electricalLineDistance: [
    { value: 5, label: "≤ 5{u}" },
    { value: 10, label: "5–15{u}" },
    { value: 20, label: "15–30{u}" },
    { value: 40, label: "> 30{u}" },
  ],
  electricalLineHoleCount: [
    { value: 0, label: "0" },
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3+" },
  ],
  vehicleTripDistance: [
    { value: 15, label: "< 25{u}" },
    { value: 40, label: "25–50{u}" },
    { value: 75, label: "50–100{u}" },
    { value: 130, label: "> 100{u}" },
  ],
  vehicleChargingHours: [
    { value: 5, label: "< 6{u}" },
    { value: 7, label: "6–8{u}" },
    { value: 9, label: "> 8{u}" },
  ],
};

function isValidConfigBuckets(raw: unknown): raw is { value: number; label: string }[] {
  return (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((b) => b && typeof b === "object" && typeof (b as { value?: unknown }).value === "number" && typeof (b as { label?: unknown }).label === "string")
  );
}

/** `{u}` in a label renders as NBSP + unit; absent placeholder = label used as-is. */
export function resolveBuckets(fieldKey: string, configBuckets: unknown, unit: string): BucketOption[] {
  const source = isValidConfigBuckets(configBuckets) ? configBuckets : (DEFAULT_BUCKETS[fieldKey] ?? []);
  return source.map((b) => ({
    value: b.value,
    label: b.label.replace("{u}", unit ? ` ${unit}` : ""),
  }));
}
