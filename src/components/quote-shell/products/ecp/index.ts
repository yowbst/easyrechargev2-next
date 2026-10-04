import { Car, Home, ParkingSquare, Zap } from "lucide-react";
import type { ProductFunnel } from "../../types";
import { ECP_INITIAL, LEAN_REMOVED_FIELDS } from "./fields";
import { ChargerStep, HousingStep, ParkingStep, VehicleStep } from "./steps";
import { ecpFieldChange, ecpFirstUnanswered } from "./validation";

/** Charger (borne) quote funnel — 4 product steps, then the shared contact step. */
export const ecpFunnel: ProductFunnel = {
  product: "ecp",
  dictPageIds: ["quote"],
  steps: [
    { id: "housing", icon: Home, Component: HousingStep, summary: ["housingStatus", "housingType", "solarEquipment"] },
    { id: "parking", icon: ParkingSquare, Component: ParkingStep, summary: ["parkingSpotLocation"] },
    { id: "charger", icon: Zap, Component: ChargerStep, summary: ["parkingSpotCount", "deadline"] },
    { id: "vehicle", icon: Car, Component: VehicleStep, summary: ["vehicleStatus"] },
  ],
  initialData: { ...ECP_INITIAL },
  // Drafts saved by the former QuoteForm may still hold the six removed answers.
  fixedData: Object.fromEntries(LEAN_REMOVED_FIELDS.map((k) => [k, null])),
  firstUnansweredField: ecpFirstUnanswered,
  // The count options translate the noun only ("véhicule(s)"), keyed "3plus".
  formatAnswer: (field, value, t) =>
    field === "parkingSpotCount" && typeof value === "string" && value
      ? `${value} ${t(`steps.charger.fields.parkingSpotCount.options.${value === "3+" ? "3plus" : value}`)}`
      : null,
  applyChange: ecpFieldChange,
};
