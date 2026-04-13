/**
 * Pure content generators for vehicle page SEO sections.
 * No JSX, no framework deps — returns structured data objects.
 */

import type { Vehicle } from "@/lib/vehicleTransformer";
import { formatMinutes } from "@/lib/vehicleTransformer";
import { t } from "@/lib/i18n/dictionaries";

// ── Types ──────────────────────────────────────────────────────────────

export interface ChargingAdviceItem {
  id: string;
  chargingPoint: string;
  power: string;
  time: string;
  description: string;
  recommended: boolean;
}

export interface CostEstimate {
  title: string;
  tariff: number;
  /** Wh/km — needed for client-side recalculation */
  efficiency: number;
  /** kWh — needed for client-side recalculation */
  batteryCapacity: number;
  /** Scenario label templates (may contain {dailyKm}, {monthlyKm}) */
  labels: { fullCharge: string; daily: string; monthly: string };
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

/** Prefix for all vehicle page dictionary keys */
const P = "pages.vehicle.";

/** Shorthand dictionary lookup */
function d(dict: Record<string, string>, key: string, vars?: Record<string, string | number | undefined>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return t(dict, P + key, vars as any);
}

function getLang(locale: string): "fr" | "de" {
  return locale.startsWith("de") ? "de" : "fr";
}

/**
 * Find the charge time for a given power level from homeChargingDetails.
 */
function findChargeTime(
  homeChargingDetails: AnyRecord[],
  chargingPointPrefix: string,
): number | undefined {
  const row = homeChargingDetails.find((r) => {
    const cp = String(r.charging_point || "");
    return cp.includes(chargingPointPrefix);
  });
  return row?.charge_time?.value;
}

/**
 * Determine the highest power level the vehicle can fully exploit.
 * Returns the kW value of the AC onboard charger.
 */
function getAcMaxKw(
  directusVehicle: AnyRecord,
): number | undefined {
  const acPower = directusVehicle.charging?.home_destination?.charge_power;
  if (acPower?.value) return acPower.value;
  return undefined;
}

/**
 * Map Directus charging point type identifiers to approximate kW values.
 */
const CHARGING_POINT_KW: Record<string, number> = {
  "wall-plug": 2.3,
  "1-phase-10a": 2.3,
  "1-phase-16a": 3.7,
  "1-phase-32a": 7.4,
  "3-phase-16a": 11,
  "3-phase-32a": 22,
};

/**
 * Human-readable display labels for charging point types, per locale.
 */
const CHARGING_POINT_LABEL: Record<string, Record<string, string>> = {
  fr: {
    "wall-plug": "Prise domestique (2.3 kW)",
    "1-phase-10a": "1-phase 10A (2.3 kW)",
    "1-phase-16a": "1-phase 16A (3.7 kW)",
    "1-phase-32a": "1-phase 32A (7.4 kW)",
    "3-phase-16a": "3-phase 16A (11 kW)",
    "3-phase-32a": "3-phase 32A (22 kW)",
  },
  de: {
    "wall-plug": "Haushaltssteckdose (2.3 kW)",
    "1-phase-10a": "1-Phase 10A (2.3 kW)",
    "1-phase-16a": "1-Phase 16A (3.7 kW)",
    "1-phase-32a": "1-Phase 32A (7.4 kW)",
    "3-phase-16a": "3-Phase 16A (11 kW)",
    "3-phase-32a": "3-Phase 32A (22 kW)",
  },
};

// ── Generators ──────────────────────────────────────────────────────────

/**
 * Generate the intro paragraph for a vehicle page.
 */
export function generateVehicleIntro(
  vehicle: Vehicle,
  homeChargingDetails: AnyRecord[],
  dictionary: Record<string, string>,
  directusVehicle?: AnyRecord,
): { title: string; text: string; text2?: string } | null {
  // Find charge time at 11 kW
  const chargeTime11kw = findChargeTime(homeChargingDetails, "3-phase-16a");
  if (!chargeTime11kw && !vehicle.batteryCapacity) return null;

  const name = `${vehicle.brand} ${vehicle.model}`;
  const vars: Record<string, string | number> = {
    brand: vehicle.brand,
    model: vehicle.model,
    name,
    battery: vehicle.batteryDisplay,
    range: vehicle.rangeDisplay,
    chargeTime11kw: chargeTime11kw ? formatMinutes(chargeTime11kw) : "-",
  };

  // Second paragraph — key metrics in context
  let text2: string | undefined;
  const acMaxKw = directusVehicle ? getAcMaxKw(directusVehicle) : undefined;
  const dcMaxPowerField = directusVehicle?.charging?.fast_charging?.charge_power_max;
  const dcPowerKw = dcMaxPowerField?.value ?? vehicle.chargingPower;
  if (acMaxKw || dcPowerKw || vehicle.efficiency) {
    const costPer100km = vehicle.efficiency
      ? (vehicle.efficiency * 0.32 / 10).toFixed(2)
      : undefined;
    text2 = d(dictionary, "intro.text2", {
      model: vehicle.model,
      acPower: acMaxKw ? `${acMaxKw} kW` : "-",
      dcPower: dcPowerKw ? `${dcPowerKw} kW` : "-",
      efficiency: vehicle.efficiencyDisplay,
      costPer100km: costPer100km ?? "-",
    });
  }

  return {
    title: d(dictionary, "intro.title", vars),
    text: d(dictionary, "intro.text", vars),
    text2,
  };
}

/**
 * Generate charging advice items based on available power levels.
 */
export function generateChargingAdvice(
  directusVehicle: AnyRecord,
  vehicle: Vehicle,
  homeChargingDetails: AnyRecord[],
  dictionary: Record<string, string>,
  locale: string,
): { title: string; intro: string; items: ChargingAdviceItem[] } | null {
  if (!homeChargingDetails.length) return null;

  const lang = getLang(locale);
  const labels = CHARGING_POINT_LABEL[lang];
  const acMaxKw = getAcMaxKw(directusVehicle);
  const items: ChargingAdviceItem[] = [];

  // Determine which power level to recommend
  // The recommended level is the highest that the vehicle can fully use
  let recommendedCp: string | null = null;
  if (acMaxKw) {
    const sorted = Object.entries(CHARGING_POINT_KW)
      .filter(([, kw]) => kw <= acMaxKw)
      .sort(([, a], [, b]) => b - a);
    if (sorted.length) {
      recommendedCp = sorted[0][0];
    }
  }

  // Deduplicate: some vehicles have standard + optional charger sections
  // with the same charging point types. Keep the fastest (shortest time) per type.
  const bestByType = new Map<string, AnyRecord>();
  for (const row of homeChargingDetails) {
    const cp = String(row.charging_point || "");
    if (cp.startsWith("standard-") || cp.startsWith("optional-")) continue;
    const descKey = P + `advice.${cp}.description`;
    if (!dictionary[descKey]) continue;

    const existing = bestByType.get(cp);
    if (!existing) {
      bestByType.set(cp, row);
    } else {
      // Keep the row with shorter charge time (faster)
      const existingTime = existing.charge_time?.value ?? Infinity;
      const newTime = row.charge_time?.value ?? Infinity;
      if (newTime < existingTime) {
        bestByType.set(cp, row);
      }
    }
  }

  for (const [cp, row] of bestByType) {
    const descKey = `advice.${cp}.description`;
    const descNotExploitedKey = `advice.${cp}.descriptionNotExploited`;
    if (!dictionary[P + descKey]) continue;

    const cpKw = CHARGING_POINT_KW[cp];
    const isNotExploited = acMaxKw != null && cpKw != null && cpKw > acMaxKw;
    const isRecommended = recommendedCp === cp;

    const chargeTime = row.charge_time?.value
      ? formatMinutes(row.charge_time.value)
      : "-";
    const chargePower = row.charge_power
      ? `${row.charge_power.value} ${row.charge_power.unit || "kW"}`
      : "-";

    const useNotExploited = isNotExploited && dictionary[P + descNotExploitedKey];
    const description = d(dictionary, useNotExploited ? descNotExploitedKey : descKey, {
      time: chargeTime,
      model: vehicle.model,
      acMax: acMaxKw,
    });

    items.push({
      id: cp,
      chargingPoint: labels[cp] || cp,
      power: chargePower,
      time: chargeTime,
      description,
      recommended: isRecommended,
    });
  }

  if (!items.length) return null;

  const title = d(dictionary, "advice.title", {
    brand: vehicle.brand,
    model: vehicle.model,
  });

  const intro = d(dictionary, "advice.intro", {
    model: vehicle.model,
    acMax: acMaxKw ?? "-",
  });

  return { title, intro, items };
}

/**
 * Generate a descriptive intro paragraph for the charging features section.
 */
export function generateChargingFeaturesIntro(
  vehicle: Vehicle,
  directusVehicle: AnyRecord,
  locale: string,
): string | null {
  const lang = getLang(locale);
  const name = `${vehicle.brand} ${vehicle.model}`;

  const fastCharging = directusVehicle.charging?.fast_charging;
  const plugCharge = directusVehicle.charging?.plug_charge;
  const preconditioning = directusVehicle.charging?.battery_preconditioning;
  const autocharge = fastCharging?.autocharge_supported;
  const v2x = directusVehicle.v2x_charging;

  if (!fastCharging && !plugCharge && !v2x) return null;

  const fmtVal = (field: AnyRecord | number | string | null | undefined): string | null => {
    if (field == null) return null;
    if (typeof field !== "object") return String(field);
    if (field.value != null) return `${field.value}${field.unit ? "\u00a0" + field.unit : ""}`;
    if (field.name != null) return String(field.name);
    if (field.type != null) return String(field.type);
    return null;
  };

  const sentences: string[] = [];

  // Fast charging sentence
  if (fastCharging) {
    const maxPower = fmtVal(fastCharging.charge_power_max);
    const port = fastCharging.charge_port ? (typeof fastCharging.charge_port === "object" ? fastCharging.charge_port.name ?? fastCharging.charge_port.type : String(fastCharging.charge_port)) : null;
    const dcTime = fastCharging.charge_time;
    const timeStr = dcTime?.value ? `${dcTime.value}\u00a0${dcTime.unit || "min"}` : null;

    const parts: string[] = [];
    if (lang === "de") {
      if (maxPower) parts.push(`bis zu ${maxPower} DC-Ladeleistung`);
      if (port) parts.push(`${port}-Anschluss`);
      if (timeStr) parts.push(`Ladezeit 10\u2013100\u00a0% in ${timeStr}`);
      if (parts.length) sentences.push(`Der ${name} unterstützt ${parts.join(", ")}.`);
    } else {
      if (maxPower) parts.push(`jusqu'à ${maxPower} en courant continu`);
      if (port) parts.push(`connecteur ${port}`);
      if (timeStr) parts.push(`recharge 10\u2013100\u00a0% en ${timeStr}`);
      if (parts.length) sentences.push(`La ${name} supporte ${parts.join(", ")}.`);
    }
  }

  // Smart charging features sentence
  const smartFeatures: string[] = [];
  if (plugCharge?.plug_charge_supported) {
    smartFeatures.push(lang === "de" ? "Plug & Charge" : "Plug & Charge");
  }
  if (autocharge) {
    smartFeatures.push(lang === "de" ? "Autocharge" : "Autocharge");
  }
  if (preconditioning?.precond_possible) {
    smartFeatures.push(lang === "de" ? "Batterievorkonditionierung" : "préconditionnement de la batterie");
  }
  if (smartFeatures.length) {
    if (lang === "de") {
      sentences.push(`Intelligente Ladefunktionen\u00a0: ${smartFeatures.join(", ")}.`);
    } else {
      sentences.push(`Fonctions intelligentes disponibles\u00a0: ${smartFeatures.join(", ")}.`);
    }
  }

  // V2X sentence
  const v2xFeatures: string[] = [];
  if (v2x?.vehicle_to_load?.supported) v2xFeatures.push("V2L");
  if (v2x?.vehicle_to_home?.ac_supported || v2x?.vehicle_to_home?.dc_supported) v2xFeatures.push("V2H");
  if (v2x?.vehicle_to_grid?.ac_supported || v2x?.vehicle_to_grid?.dc_supported) v2xFeatures.push("V2G");
  if (v2xFeatures.length) {
    if (lang === "de") {
      sentences.push(`Bidirektionales Laden unterstützt\u00a0: ${v2xFeatures.join(", ")}.`);
    } else {
      sentences.push(`Charge bidirectionnelle compatible\u00a0: ${v2xFeatures.join(", ")}.`);
    }
  }

  return sentences.length > 0 ? sentences.join(" ") : null;
}

/**
 * Generate a descriptive intro paragraph for the real-world range section.
 */
export function generateRealRangeIntro(
  vehicle: Vehicle,
  directusVehicle: AnyRecord,
  locale: string,
): string | null {
  const lang = getLang(locale);
  const name = `${vehicle.brand} ${vehicle.model}`;
  const realRange = directusVehicle.real_range;
  if (!realRange) return null;

  const fmtKm = (obj: AnyRecord | number | null | undefined): string | null => {
    if (obj == null) return null;
    const v = typeof obj === "number" ? obj : obj.value;
    return v != null ? `${v}\u00a0km` : null;
  };

  const mildCombined = fmtKm(realRange.mild_weather?.combined);
  const coldCombined = fmtKm(realRange.cold_weather?.combined);
  const worstRange = realRange.worst?.value != null ? `${realRange.worst.value}\u00a0km` : null;
  const bestRange = realRange.best?.value != null ? `${realRange.best.value}\u00a0km` : null;

  const sentences: string[] = [];

  if (worstRange && bestRange) {
    if (lang === "de") {
      sentences.push(`Der ${name} erreicht je nach Wetter- und Fahrbedingungen eine reale Reichweite von ${worstRange} bis ${bestRange}.`);
    } else {
      sentences.push(`La ${name} affiche une autonomie réelle comprise entre ${worstRange} et ${bestRange} selon les conditions météorologiques et d'usage.`);
    }
  }

  if (mildCombined) {
    if (lang === "de") {
      sentences.push(`Bei mildem Wetter (23\u00a0°C) erzielt er eine kombinierte Reichweite von ${mildCombined}.`);
    } else {
      sentences.push(`Par temps doux (23\u00a0°C), elle atteint ${mildCombined} en usage combiné.`);
    }
  }

  if (coldCombined) {
    if (lang === "de") {
      sentences.push(`Bei Kälte sinkt die kombinierte Reichweite auf ${coldCombined}.`);
    } else {
      sentences.push(`Par temps froid, l'autonomie combinée est de ${coldCombined}.`);
    }
  }

  return sentences.length > 0 ? sentences.join(" ") : null;
}

/**
 * Generate a descriptive intro paragraph for the tech specs section.
 */
export function generateTechSpecsIntro(
  vehicle: Vehicle,
  directusVehicle: AnyRecord,
  locale: string,
): string | null {
  const lang = getLang(locale);
  const name = `${vehicle.brand} ${vehicle.model}`;

  const batteryDetails = directusVehicle.battery_details;
  const perf = directusVehicle.performance;
  const dims = directusVehicle.dimensions_weight;

  if (!batteryDetails && !perf && !dims) return null;

  const fmtVal = (field: AnyRecord | number | string | null | undefined): string | null => {
    if (field == null) return null;
    if (typeof field !== "object") return String(field);
    if (field.value != null) return `${field.value}${field.unit ? "\u00a0" + field.unit : ""}`;
    if (field.name != null) return String(field.name);
    if (field.type != null) return String(field.type);
    return null;
  };

  const sentences: string[] = [];

  // Battery sentence
  const battery = fmtVal(batteryDetails?.useable_capacity ?? batteryDetails?.nominal_capacity);
  const batteryType: string | null = batteryDetails?.type?.name ?? batteryDetails?.battery_type?.name ?? null;
  if (battery) {
    if (lang === "de") {
      sentences.push(`Der ${name} ist mit einer${batteryType ? " " + batteryType : ""}-Batterie mit einer nutzbaren Kapazität von ${battery} ausgestattet.`);
    } else {
      sentences.push(`La ${name} embarque une batterie${batteryType ? " " + batteryType : ""} d'une capacité utilisable de ${battery}.`);
    }
  }

  // Performance sentence
  const power = fmtVal(perf?.power?.ps);
  const torque = fmtVal(perf?.torque);
  const acceleration = fmtVal(perf?.acceleration_0_100);
  const topSpeed = fmtVal(perf?.top_speed);
  if (power || acceleration || topSpeed) {
    const parts: string[] = [];
    if (lang === "de") {
      if (power) parts.push(`${power}\u00a0PS`);
      if (torque) parts.push(`${torque} Drehmoment`);
      if (acceleration) parts.push(`0\u2013100\u00a0km/h in ${acceleration}`);
      if (topSpeed) parts.push(`Höchstgeschwindigkeit ${topSpeed}`);
    } else {
      if (power) parts.push(`${power}\u00a0ch`);
      if (torque) parts.push(`${torque} de couple`);
      if (acceleration) parts.push(`0\u2013100\u00a0km/h en ${acceleration}`);
      if (topSpeed) parts.push(`vitesse max.\u00a0${topSpeed}`);
    }
    if (parts.length) sentences.push(parts.join(", ") + ".");
  }

  // Dimensions/weight sentence
  const cargo = fmtVal(dims?.cargo_volume);
  const seats = fmtVal(dims?.seats);
  const weight = fmtVal(dims?.weight_unladen_eu ?? dims?.weight);
  if (cargo || seats || weight) {
    const parts: string[] = [];
    if (lang === "de") {
      if (cargo) parts.push(`${cargo} Kofferraumvolumen`);
      if (seats) parts.push(`${seats} Sitze`);
      if (weight) parts.push(`${weight} Leergewicht`);
    } else {
      if (cargo) parts.push(`${cargo} de coffre`);
      if (seats) parts.push(`${seats} places`);
      if (weight) parts.push(`${weight} à vide`);
    }
    if (parts.length) sentences.push(parts.join(", ") + ".");
  }

  return sentences.length > 0 ? sentences.join(" ") : null;
}

/**
 * Generate cost estimate table. Returns null if data is insufficient.
 */
export function generateCostEstimate(
  vehicle: Vehicle,
  tariffCHF: number,
  dictionary: Record<string, string>,
): CostEstimate | null {
  if (!vehicle.batteryCapacity || !vehicle.efficiency || vehicle.efficiency <= 0)
    return null;

  return {
    title: d(dictionary, "cost.title", { brand: vehicle.brand, model: vehicle.model }),
    tariff: tariffCHF,
    efficiency: vehicle.efficiency,
    batteryCapacity: vehicle.batteryCapacity,
    labels: {
      fullCharge: d(dictionary, "cost.fullCharge"),
      daily: d(dictionary, "cost.daily"),
      monthly: d(dictionary, "cost.monthly"),
    },
  };
}

/**
 * Generate FAQ items for a vehicle page.
 */
export function generateVehicleFAQ(
  vehicle: Vehicle,
  directusVehicle: AnyRecord,
  homeChargingDetails: AnyRecord[],
  costData: CostEstimate | null,
  dictionary: Record<string, string>,
  locale: string,
): { title: string; intro: string; items: FAQItem[] } | null {
  const lang = getLang(locale);
  const acMaxKw = getAcMaxKw(directusVehicle);

  const fastChargingData = directusVehicle.charging?.fast_charging;
  const dcPort = fastChargingData?.charge_port;
  const dcMaxPower = fastChargingData?.charge_power_max;
  const dcTime = fastChargingData?.charge_time;
  const realRange = directusVehicle.real_range;

  const vehicleName = `${vehicle.brand} ${vehicle.model}`.trim();

  // Common interpolation vars
  const commonVars: Record<string, string | number | undefined> = {
    name: vehicleName,
    brand: vehicle.brand,
    model: vehicle.model,
    battery: vehicle.batteryDisplay,
    range: vehicle.rangeDisplay,
    acMax: acMaxKw ?? undefined,
  };

  // Charge times for FAQ
  const chargeTime11kw = findChargeTime(homeChargingDetails, "3-phase-16a");
  const chargeTime2_3kw =
    findChargeTime(homeChargingDetails, "wall-plug") ??
    findChargeTime(homeChargingDetails, "1-phase-10a");

  const items: FAQItem[] = [];

  // 1. Charge time at home
  if (chargeTime11kw || chargeTime2_3kw) {
    items.push({
      id: "chargeTime",
      question: d(dictionary, "faq.chargeTime.question", commonVars),
      answer: d(dictionary, "faq.chargeTime.answer", {
        ...commonVars,
        chargeTime11kw: chargeTime11kw ? formatMinutes(chargeTime11kw) : "-",
        chargeTime2_3kw: chargeTime2_3kw
          ? formatMinutes(chargeTime2_3kw)
          : "-",
      }),
    });
  }

  // 2. Which charger
  {
    const notExploitedNote =
      acMaxKw != null && acMaxKw < 22
        ? lang === "de"
          ? `Eine 22-kW-Wallbox bringt keinen Vorteil, da das On-Board-Ladegerät auf ${acMaxKw} kW begrenzt ist.`
          : `Une borne 22 kW n'apporte aucun gain, le chargeur embarqué étant limité à ${acMaxKw} kW.`
        : "";
    items.push({
      id: "whichCharger",
      question: d(dictionary, "faq.whichCharger.question", commonVars),
      answer: d(dictionary, "faq.whichCharger.answer", {
        ...commonVars,
        notExploitedNote,
      }),
    });
  }

  // 3. Cost per charge
  if (costData) {
    const fullChargeCost = (costData.batteryCapacity * 0.7 * costData.tariff).toFixed(2);
    const dailyCost = (50 * (costData.efficiency / 1000) * costData.tariff).toFixed(2);
    items.push({
      id: "costPerCharge",
      question: d(dictionary, "faq.costPerCharge.question", commonVars),
      answer: d(dictionary, "faq.costPerCharge.answer", {
        ...commonVars,
        fullChargeCost,
        dailyCost,
        tariff: costData.tariff.toFixed(2),
      }),
    });
  }

  // 4. Installation requirements
  items.push({
    id: "installation",
    question: d(dictionary, "faq.installation.question", commonVars),
    answer: d(dictionary, "faq.installation.answer", commonVars),
  });

  // 5. Fast charging compatibility
  if (fastChargingData && dcPort && dcMaxPower?.value) {
    items.push({
      id: "fastCharging",
      question: d(dictionary, "faq.fastCharging.question", commonVars),
      answer: d(dictionary, "faq.fastCharging.answer", {
        ...commonVars,
        dcPort: typeof dcPort === "string" ? dcPort : String(dcPort),
        dcMaxPower: `${dcMaxPower.value} ${dcMaxPower.unit || "kW"}`,
        dcTime: dcTime?.value ? `${dcTime.value} ${dcTime.unit || "min"}` : "-",
      }),
    });
  } else {
    items.push({
      id: "fastCharging",
      question: d(dictionary, "faq.fastCharging.question", commonVars),
      answer: d(dictionary, "faq.fastCharging.answerAlt"),
    });
  }

  // 6. Real-world range
  const coldCombined = realRange?.cold_weather?.combined;
  const mildHighway = realRange?.mild_weather?.highway;
  const rangeMax = realRange?.best?.value;

  if (coldCombined?.value || mildHighway?.value || rangeMax) {
    items.push({
      id: "realRange",
      question: d(dictionary, "faq.realRange.question", commonVars),
      answer: d(dictionary, "faq.realRange.answer", {
        ...commonVars,
        rangeMax: rangeMax || vehicle.range,
        coldCombined: coldCombined?.value || "-",
        mildHighway: mildHighway?.value || "-",
      }),
    });
  } else {
    items.push({
      id: "realRange",
      question: d(dictionary, "faq.realRange.question", commonVars),
      answer: d(dictionary, "faq.realRange.answerAlt", commonVars),
    });
  }

  if (!items.length) return null;

  const title = d(dictionary, "faq.title", commonVars);
  const intro = d(dictionary, "faq.intro", commonVars);

  return { title, intro, items };
}
