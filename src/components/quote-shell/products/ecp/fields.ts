/**
 * Charger (ECP) quote answers.
 *
 * The six questions the "quote-lean-funnel" test removed (lean won, 2026-10)
 * are no longer asked, but their keys stay in the submitted data as `null`:
 * the Make payload, the webhook and the request page still read them, and the
 * post-submission enrichment (`EnrichStep`, flag `quote-enrich`) fills them in
 * later when the visitor agrees to.
 */
export const LEAN_REMOVED_FIELDS = [
  "electricalBoardType",
  "electricalLineDistance",
  "electricalLineHoleCount",
  "ecpProvided",
  "vehicleTripDistance",
  "vehicleChargingHours",
] as const;

export type LeanRemovedField = (typeof LEAN_REMOVED_FIELDS)[number];

export interface EcpFields {
  housingStatus?: string;
  housingType: string;
  solarEquipment: string;
  homeBattery: string;
  neighborhoodEquipment: string;
  /** Landlord / co-ownership approval — asked in the housing step for tenants and co-owners. */
  approval: string;
  parkingSpotLocation: string;
  parkingSpotCount: string;
  /** Hidden question with a single value. */
  ecpStatus: string;
  ecpBrand: string;
  ecpModel: string;
  deadline: string;
  vehicleStatus: string;
  vehicleBrand: string;
  vehicleModel: string;
  // Not asked any more — kept null in the payload.
  electricalBoardType: string | null;
  electricalLineDistance: number | "na" | null;
  electricalLineHoleCount: number | "na" | null;
  ecpProvided: string | null;
  vehicleTripDistance: number | "na" | null;
  vehicleChargingHours: number | "na" | null;
}

export const ECP_INITIAL: EcpFields = {
  housingType: "",
  solarEquipment: "",
  homeBattery: "",
  neighborhoodEquipment: "",
  approval: "",
  parkingSpotLocation: "",
  parkingSpotCount: "",
  ecpStatus: "get-advice",
  ecpBrand: "",
  ecpModel: "",
  deadline: "",
  vehicleStatus: "",
  vehicleBrand: "",
  vehicleModel: "",
  electricalBoardType: null,
  electricalLineDistance: null,
  electricalLineHoleCount: null,
  ecpProvided: null,
  vehicleTripDistance: null,
  vehicleChargingHours: null,
};

export const VALID_PARKING_LOCATIONS = [
  "exterior-adjacent", "exterior-standalone",
  "garage-adjacent", "garage-standalone",
  "covered-adjacent", "covered-standalone",
  "underground",
];

/** First level of the parking question; `underground` has no second level. */
export const PARKING_MAIN = ["exterior", "garage", "covered", "underground"] as const;

export function parkingMain(location: string): string {
  if (!location) return "";
  const main = location.split("-")[0];
  return (PARKING_MAIN as readonly string[]).includes(main) ? main : location;
}
