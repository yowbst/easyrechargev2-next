import { describe, it, expect } from "vitest";
import { firstUnansweredField, type StepFields } from "./stepValidation";
import { hiddenFieldsFor } from "./leanVariant";

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

  it("step 5: address comes first (visual order), then name/email/phone validation", () => {
    // Address moved to the top of the contact step in the 2026-07 UX pass
    expect(firstUnansweredField(5, { ...complete, canton: "", firstName: "" })).toBe("address");
    expect(firstUnansweredField(5, { ...complete, canton: "" })).toBe("address");
    expect(
      firstUnansweredField(5, { ...complete, addressMode: "manual", streetName: "", address: "" }),
    ).toBe("address");
    expect(firstUnansweredField(5, { ...complete, firstName: " " })).toBe("firstName");
    expect(firstUnansweredField(5, { ...complete, email: "not-an-email" })).toBe("email");
    expect(firstUnansweredField(5, { ...complete, phone: "1" })).toBe("phone");
  });

  it("step 6: terms", () => {
    expect(firstUnansweredField(6, { ...complete, acceptTerms: false })).toBe("acceptTerms");
  });
});

describe("firstUnansweredField — lean variant hides gated fields", () => {
  const lean = hiddenFieldsFor("lean");

  it("step 1: electricalBoardType not required when hidden", () => {
    expect(firstUnansweredField(1, { ...complete, electricalBoardType: "" }, lean)).toBeNull();
    // still enforces earlier, non-hidden fields
    expect(firstUnansweredField(1, { ...complete, electricalBoardType: "", solarEquipment: "" }, lean)).toBe("solarEquipment");
  });

  it("step 2: line distance & hole count not required when hidden; location still is", () => {
    expect(
      firstUnansweredField(2, { ...complete, electricalLineDistance: null, electricalLineHoleCount: null }, lean),
    ).toBeNull();
    expect(
      firstUnansweredField(2, { ...complete, parkingSpotLocation: "exterior", electricalLineDistance: null }, lean),
    ).toBe("parkingSpotLocation");
  });

  it("step 3: ecpProvided not required when hidden; deadline still is", () => {
    expect(firstUnansweredField(3, { ...complete, ecpProvided: "" }, lean)).toBeNull();
    expect(firstUnansweredField(3, { ...complete, ecpProvided: "", deadline: "" }, lean)).toBe("deadline");
  });

  it("step 4: trip distance & charging hours not required when hidden; status still is", () => {
    expect(
      firstUnansweredField(4, { ...complete, vehicleTripDistance: null, vehicleChargingHours: null }, lean),
    ).toBeNull();
    expect(
      firstUnansweredField(4, { ...complete, vehicleStatus: "", vehicleTripDistance: null }, lean),
    ).toBe("vehicleStatus");
  });

  it("control (no hidden set) is unchanged: gated fields still required", () => {
    expect(firstUnansweredField(1, { ...complete, electricalBoardType: "" })).toBe("electricalBoardType");
    expect(firstUnansweredField(3, { ...complete, ecpProvided: "" })).toBe("ecpProvided");
  });
});
