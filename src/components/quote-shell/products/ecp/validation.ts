import { VALID_PARKING_LOCATIONS } from "./fields";

type Data = Record<string, unknown>;

const answered = (v: unknown) => v !== null && v !== undefined && v !== "";

const NONE: ReadonlySet<string> = new Set();

/** PPE, or a tenant in an apartment: the building may already be equipped. */
export function showsNeighborhoodEquipment(d: Data): boolean {
  return (
    (d.housingStatus === "co-owner" && ["apartment", "house"].includes(String(d.housingType))) ||
    (d.housingStatus === "tenant" && d.housingType === "apartment")
  );
}

/** Tenants and co-owners need the landlord's / the co-ownership's approval. */
export const asksApproval = (d: Data) => d.housingStatus === "tenant" || d.housingStatus === "co-owner";

export const hasSolar = (d: Data) => ["exists", "in-progress"].includes(String(d.solarEquipment));

/**
 * First unanswered field of a charger step, in visual order; null when the
 * step is complete. `hidden` holds questions an editor hid in the Directus
 * page config (`config.hiddenFields`): they are neither shown nor required.
 * The approval question is optional, as it always was.
 */
export function ecpFirstUnanswered(stepId: string, d: Data, hidden: ReadonlySet<string> = NONE): string | null {
  const need = (key: string, ok: boolean) => !hidden.has(key) && !ok;
  switch (stepId) {
    case "housing":
      if (need("housingStatus", answered(d.housingStatus))) return "housingStatus";
      if (need("housingType", answered(d.housingType))) return "housingType";
      if (need("solarEquipment", answered(d.solarEquipment))) return "solarEquipment";
      if (hasSolar(d) && need("homeBattery", answered(d.homeBattery))) return "homeBattery";
      if (showsNeighborhoodEquipment(d) && need("neighborhoodEquipment", answered(d.neighborhoodEquipment))) {
        return "neighborhoodEquipment";
      }
      return null;
    case "parking":
      if (need("parkingSpotLocation", VALID_PARKING_LOCATIONS.includes(String(d.parkingSpotLocation)))) {
        return "parkingSpotLocation";
      }
      return null;
    case "charger":
      if (need("parkingSpotCount", answered(d.parkingSpotCount))) return "parkingSpotCount";
      if (need("deadline", answered(d.deadline))) return "deadline";
      return null;
    case "vehicle":
      if (need("vehicleStatus", answered(d.vehicleStatus))) return "vehicleStatus";
      return null;
    default:
      return null;
  }
}

/** Apply one answer and clear the answers it makes irrelevant. */
export function ecpFieldChange(field: string, value: unknown, d: Data): Data {
  const next: Data = { ...d, [field]: value };
  if (field === "housingStatus" && value === "owner" && d.housingType === "apartment") next.housingType = "";
  if (field === "solarEquipment" && value === "none") next.homeBattery = "";
  if ((field === "housingStatus" || field === "housingType") && !showsNeighborhoodEquipment(next)) {
    next.neighborhoodEquipment = "";
  }
  if (field === "housingStatus" && !asksApproval(next)) next.approval = "";
  if (field === "ecpStatus" && value === "get-advice") {
    next.ecpBrand = "";
    next.ecpModel = "";
  }
  if (field === "ecpBrand") next.ecpModel = "";
  return next;
}
