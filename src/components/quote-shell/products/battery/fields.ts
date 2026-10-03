/** A bucket answer: its representative number, "na" for "don't know", null if unanswered. */
export type Bucketed = number | "na" | null;

export interface BatteryFields {
  housingStatus: string;      // "owner" | "co-owner" | "tenant"
  housingType: string;        // "house" | "apartment"
  solarEquipment: string;     // "exists" | "in-progress" | "none"
  pvPower: Bucketed;          // kWc
  pvPowerExact: boolean;      // true when pvPower was typed, not picked
  inverterBrand: string;      // "solaredge" | "fronius" | "huawei" | "sma" | "other" | "unknown"
  existingBattery: string;    // "none" | "extend"
  householdCount: number | null;   // 1, 2, 3, 4 (= 4+)
  householdSize: number | null;    // 1, 2, 3.5 (= 3–4), 5 (= 5+); single household only
  annualConsumption: number | null; // kWh, optional
  annualConsumptionExact: boolean;
  heatPump: string;           // "yes" | "no"
  evCount: number | null;     // 0, 1, 2, 3 (= 3+)
  evPlanned: string;          // "yes" | "no"; asked when evCount = 0
  hasCharger: string;         // "yes" | "no"; asked when evCount >= 1
  deadline: string;           // "asap" | "2-3mo" | "3-6mo" | "6+mo"
}

export const BATTERY_INITIAL: BatteryFields = {
  housingStatus: "",
  housingType: "",
  solarEquipment: "",
  pvPower: null,
  pvPowerExact: false,
  inverterBrand: "",
  existingBattery: "",
  householdCount: null,
  householdSize: null,
  annualConsumption: null,
  annualConsumptionExact: false,
  heatPump: "",
  evCount: null,
  evPlanned: "",
  hasCharger: "",
  deadline: "",
};
