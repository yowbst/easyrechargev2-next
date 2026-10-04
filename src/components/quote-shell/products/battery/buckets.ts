// Same convention as src/lib/quoteBuckets.ts: each bucket stores a
// representative number; `{u}` renders as NBSP + unit. A page-config field may
// override with `buckets: [{ value, label }]`.
export const BATTERY_BUCKETS = {
  pvPower: [
    { value: 4, label: "< 6{u}" },
    { value: 8, label: "6–10{u}" },
    { value: 15, label: "10–20{u}" },
    { value: 25, label: "> 20{u}" },
  ],
  householdCount: [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4+" },
  ],
  householdSize: [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3.5, label: "3–4" },
    { value: 5, label: "5+" },
  ],
  evCount: [
    { value: 0, label: "0" },
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3+" },
  ],
} as const satisfies Record<string, readonly { value: number; label: string }[]>;

const UNITS: Record<string, string> = { pvPower: "kWc", annualConsumption: "kWh" };

/**
 * Side-panel value of a numeric battery answer: the bucket label when the
 * number is a bucket's, else the typed figure with its unit. Null for the
 * text answers, which the option labels already cover.
 */
export function formatBatteryAnswer(field: string, value: unknown): string | null {
  if (typeof value !== "number") return null;
  const unit = UNITS[field] ?? "";
  const bucket = (BATTERY_BUCKETS as Record<string, readonly { value: number; label: string }[]>)[field]?.find((b) => b.value === value);
  if (bucket) return bucket.label.replace("{u}", unit ? `\u00a0${unit}` : "");
  return unit ? `${value.toLocaleString("fr-CH")}\u00a0${unit}` : String(value);
}
