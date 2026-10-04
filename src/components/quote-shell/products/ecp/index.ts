import { Car, Home, ParkingSquare, Zap } from "lucide-react";
import type { ProductFunnel } from "../../types";
import { ECP_INITIAL } from "./fields";
import { ChargerStep, HousingStep, ParkingStep, VehicleStep } from "./steps";
import { ecpFieldChange, ecpFirstUnanswered } from "./validation";

/** Charger (borne) quote funnel — 4 product steps, then the shared contact step. */
export const ecpFunnel: ProductFunnel = {
  product: "ecp",
  dictPageIds: ["quote"],
  steps: [
    { id: "housing", icon: Home, Component: HousingStep },
    { id: "parking", icon: ParkingSquare, Component: ParkingStep },
    { id: "charger", icon: Zap, Component: ChargerStep },
    { id: "vehicle", icon: Car, Component: VehicleStep },
  ],
  initialData: { ...ECP_INITIAL },
  firstUnansweredField: ecpFirstUnanswered,
  applyChange: ecpFieldChange,
};
