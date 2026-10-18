import { Home, Sun, Users } from "lucide-react";
import type { ProductFunnel } from "../../types";
import { withUi } from "../../steps";
import { formatBatteryAnswer } from "./buckets";
import { BATTERY_INITIAL } from "./fields";
import { ConsumptionStep, HousingStep, PvStep } from "./steps";
import { BATTERY_STEPS, batteryFieldChange, batteryFirstUnanswered } from "./validation";

export const batteryFunnel: ProductFunnel = {
  product: "battery",
  dictPageIds: ["quote-battery", "quote"],
  steps: withUi(BATTERY_STEPS, {
    housing: { icon: Home, Component: HousingStep, summary: ["housingStatus", "housingType", "solarEquipment"] },
    pv: { icon: Sun, Component: PvStep, summary: ["pvPower", "inverterBrand", "existingBattery"] },
    consumption: { icon: Users, Component: ConsumptionStep, summary: ["householdCount", "annualConsumption", "heatPump", "evCount", "deadline"] },
  }),
  initialData: { ...BATTERY_INITIAL },
  firstUnansweredField: batteryFirstUnanswered,
  formatAnswer: formatBatteryAnswer,
  applyChange: batteryFieldChange,
};
