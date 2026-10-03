import { Home, Sun, Users } from "lucide-react";
import type { ProductFunnel } from "../../types";
import { BATTERY_INITIAL } from "./fields";
import { ConsumptionStep, HousingStep, PvStep } from "./steps";
import { batteryFieldChange, batteryFirstUnanswered, hasNoPv, isTenant } from "./validation";

export const batteryFunnel: ProductFunnel = {
  product: "battery",
  dictPageIds: ["quote-battery", "quote"],
  steps: [
    { id: "housing", icon: Home, Component: HousingStep, exit: isTenant },
    // Skipped only on an explicit "none", so the progress bar does not grow
    // by two steps after the first answer.
    { id: "pv", icon: Sun, Component: PvStep, skip: hasNoPv },
    { id: "consumption", icon: Users, Component: ConsumptionStep, skip: hasNoPv },
  ],
  initialData: { ...BATTERY_INITIAL },
  firstUnansweredField: batteryFirstUnanswered,
  applyChange: batteryFieldChange,
};
