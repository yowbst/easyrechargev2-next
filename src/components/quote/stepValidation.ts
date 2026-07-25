// Single source of truth for "is this step answerable / what's missing".
// Returns the FIRST unanswered field key in visual order — the form
// scrolls to `#q-<key>` when Continue is pressed on an incomplete step.
// Mirrors the per-step validity rules that used to live inline in
// QuoteForm (isStep1Valid…isStep6Valid).

import { validatePhone } from "@/lib/phone-utils";
import type { CountryCode } from "libphonenumber-js";

export interface StepFields {
  housingStatus?: string;
  housingType: string;
  solarEquipment: string;
  homeBattery: string;
  neighborhoodEquipment: string;
  electricalBoardType: string;
  parkingSpotLocation: string;
  electricalLineDistance: number | "na" | null;
  electricalLineHoleCount: number | "na" | null;
  parkingSpotCount: string;
  ecpProvided: string;
  deadline: string;
  vehicleStatus: string;
  vehicleTripDistance: number | "na" | null;
  vehicleChargingHours: number | "na" | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  addressMode: string;
  address: string;
  postalCode?: string;
  locality?: string;
  canton?: string;
  streetName?: string;
  streetNb?: string;
  acceptTerms: boolean;
}

export const VALID_PARKING_LOCATIONS = [
  "exterior-adjacent", "exterior-standalone",
  "garage-adjacent", "garage-standalone",
  "covered-adjacent", "covered-standalone",
  "underground",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function shouldShowNeighborhoodEquipment(f: StepFields): boolean {
  return (
    (f.housingStatus === "co-owner" && ["apartment", "house"].includes(f.housingType)) ||
    (f.housingStatus === "tenant" && f.housingType === "apartment")
  );
}

export function firstUnansweredField(step: number, f: StepFields): string | null {
  switch (step) {
    case 1: {
      if (!f.housingStatus) return "housingStatus";
      if (!f.housingType) return "housingType";
      if (!f.solarEquipment) return "solarEquipment";
      if (["exists", "in-progress"].includes(f.solarEquipment) && !f.homeBattery) return "homeBattery";
      if (shouldShowNeighborhoodEquipment(f) && !f.neighborhoodEquipment) return "neighborhoodEquipment";
      if (!f.electricalBoardType) return "electricalBoardType";
      return null;
    }
    case 2: {
      if (!f.parkingSpotLocation || !VALID_PARKING_LOCATIONS.includes(f.parkingSpotLocation)) return "parkingSpotLocation";
      if (f.electricalLineDistance === null) return "electricalLineDistance";
      if (f.electricalLineHoleCount === null) return "electricalLineHoleCount";
      return null;
    }
    case 3: {
      if (!f.parkingSpotCount) return "parkingSpotCount";
      if (!f.ecpProvided) return "ecpProvided";
      if (!f.deadline) return "deadline";
      return null;
    }
    case 4: {
      if (!f.vehicleStatus) return "vehicleStatus";
      if (f.vehicleTripDistance === null) return "vehicleTripDistance";
      if (f.vehicleChargingHours === null) return "vehicleChargingHours";
      return null;
    }
    case 5: {
      if (!f.firstName.trim()) return "firstName";
      if (!f.lastName.trim()) return "lastName";
      if (!EMAIL_RE.test(f.email)) return "email";
      if (!f.phone || !validatePhone(f.phone, f.phoneCountry as CountryCode)) return "phone";
      const addressOk =
        f.addressMode === "google"
          ? f.address && f.postalCode && f.locality && f.canton
          : f.postalCode && f.locality && f.streetName && f.streetNb && f.canton;
      if (!addressOk) return "address";
      return null;
    }
    case 6:
      return f.acceptTerms ? null : "acceptTerms";
    default:
      return null;
  }
}
