import { describe, it, expect } from "vitest";
import { firstUnansweredField, type StepFields } from "./stepValidation";

const complete: StepFields = {
  housingStatus: "owner",
  housingType: "house",
  solarEquipment: "none",
  homeBattery: "",
  neighborhoodEquipment: "",
  electricalBoardType: "recent",
  parkingSpotLocation: "garage-adjacent",
  electricalLineDistance: 10,
  electricalLineHoleCount: 1,
  parkingSpotCount: "1",
  ecpProvided: "no",
  deadline: "1-3-months",
  vehicleStatus: "owned",
  vehicleTripDistance: 40,
  vehicleChargingHours: 9,
  firstName: "A",
  lastName: "B",
  email: "a@b.ch",
  phone: "0791234567",
  phoneCountry: "CH",
  addressMode: "google",
  address: "Rue 1, 1000 Lausanne",
  postalCode: "1000",
  locality: "Lausanne",
  canton: "VD",
  streetName: "",
  streetNb: "",
  acceptTerms: true,
};

describe("firstUnansweredField", () => {
  it("returns null for complete steps", () => {
    for (const step of [1, 2, 3, 4, 5, 6]) {
      expect(firstUnansweredField(step, complete)).toBeNull();
    }
  });

  it("step 1: returns fields in visual order and respects conditional visibility", () => {
    expect(firstUnansweredField(1, { ...complete, housingStatus: "" })).toBe("housingStatus");
    expect(firstUnansweredField(1, { ...complete, solarEquipment: "" })).toBe("solarEquipment");
    // homeBattery only required when solar exists / in progress
    expect(firstUnansweredField(1, { ...complete, solarEquipment: "exists", homeBattery: "" })).toBe("homeBattery");
    // neighborhoodEquipment required for tenant+apartment
    expect(
      firstUnansweredField(1, { ...complete, housingStatus: "tenant", housingType: "apartment", neighborhoodEquipment: "" }),
    ).toBe("neighborhoodEquipment");
  });

  it("step 2: slider-successor fields distinguish null from na/0", () => {
    expect(firstUnansweredField(2, { ...complete, parkingSpotLocation: "exterior" })).toBe("parkingSpotLocation");
    expect(firstUnansweredField(2, { ...complete, electricalLineDistance: null })).toBe("electricalLineDistance");
    expect(firstUnansweredField(2, { ...complete, electricalLineDistance: "na" })).toBeNull();
    expect(firstUnansweredField(2, { ...complete, electricalLineHoleCount: 0 })).toBeNull();
  });

  it("step 5: validates email/phone content and address per mode", () => {
    expect(firstUnansweredField(5, { ...complete, email: "not-an-email" })).toBe("email");
    expect(firstUnansweredField(5, { ...complete, phone: "1" })).toBe("phone");
    expect(firstUnansweredField(5, { ...complete, canton: "" })).toBe("address");
    expect(
      firstUnansweredField(5, { ...complete, addressMode: "manual", streetName: "", address: "" }),
    ).toBe("address");
  });

  it("step 6: terms", () => {
    expect(firstUnansweredField(6, { ...complete, acceptTerms: false })).toBe("acceptTerms");
  });
});
