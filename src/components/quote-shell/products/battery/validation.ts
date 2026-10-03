type Data = Record<string, unknown>;

const answered = (v: unknown) => v !== null && v !== undefined && v !== "";
const positive = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;

export const isTenant = (d: Data) => d.housingStatus === "tenant";
export const hasNoPv = (d: Data) => d.solarEquipment === "none";

/** "12,5" / "12.5" / "12'000" → number; empty, zero, negative or garbage → null. */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/['\u2019\s]/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** First unanswered field of a battery step, in visual order; null when complete. */
export function batteryFirstUnanswered(stepId: string, d: Data): string | null {
  switch (stepId) {
    case "housing":
      if (!answered(d.housingStatus)) return "housingStatus";
      if (isTenant(d)) return null;
      if (!answered(d.housingType)) return "housingType";
      if (!answered(d.solarEquipment)) return "solarEquipment";
      return null;
    case "pv":
      if (d.pvPowerExact ? !positive(d.pvPower) : !answered(d.pvPower)) return "pvPower";
      if (!answered(d.inverterBrand)) return "inverterBrand";
      if (!answered(d.existingBattery)) return "existingBattery";
      return null;
    case "consumption":
      if (!answered(d.householdCount)) return "householdCount";
      if (d.householdCount === 1 && !answered(d.householdSize)) return "householdSize";
      if (d.annualConsumptionExact && !positive(d.annualConsumption)) return "annualConsumption";
      if (!answered(d.heatPump)) return "heatPump";
      if (!answered(d.evCount)) return "evCount";
      if (d.evCount === 0 && !answered(d.evPlanned)) return "evPlanned";
      if (typeof d.evCount === "number" && d.evCount >= 1 && !answered(d.hasCharger)) return "hasCharger";
      if (!answered(d.deadline)) return "deadline";
      return null;
    default:
      return null;
  }
}

/** Apply one answer and clear the answers it makes irrelevant. */
export function batteryFieldChange(field: string, value: unknown, d: Data): Data {
  const next: Data = { ...d, [field]: value };
  if (field === "housingStatus" && value === "owner" && d.housingType === "apartment") next.housingType = "";
  if (field === "pvPowerExact") next.pvPower = null;
  if (field === "annualConsumptionExact") next.annualConsumption = null;
  if (field === "householdCount" && value !== 1) next.householdSize = null;
  if (field === "evCount") {
    if (value === 0) next.hasCharger = "";
    else next.evPlanned = "";
  }
  return next;
}
