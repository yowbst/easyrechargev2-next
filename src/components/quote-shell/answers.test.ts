import { describe, expect, it } from "vitest";
import { firstMissingAnswer } from "./answers";
import { ECP_INITIAL } from "./products/ecp/fields";
import { BATTERY_INITIAL } from "./products/battery/fields";

const ecpComplete = {
  ...ECP_INITIAL,
  housingStatus: "owner",
  housingType: "house",
  solarEquipment: "none",
  parkingSpotLocation: "garage-adjacent",
  parkingSpotCount: "1",
  deadline: "asap",
  vehicleStatus: "own",
};

const batteryComplete = {
  ...BATTERY_INITIAL,
  housingStatus: "owner",
  housingType: "house",
  solarEquipment: "exists",
  pvPower: 8,
  inverterBrand: "solaredge",
  existingBattery: "none",
  householdCount: 3,
  heatPump: "no",
  evCount: 1,
  hasCharger: "yes",
  deadline: "asap",
};

describe("firstMissingAnswer", () => {
  it("finds nothing missing in a complete charger request", () => {
    expect(firstMissingAnswer("ecp", ecpComplete)).toBeNull();
  });

  it("names the step and field of the first gap, in funnel order", () => {
    expect(firstMissingAnswer("ecp", { ...ecpComplete, deadline: "" })).toEqual({ step: "charger", field: "deadline" });
    expect(firstMissingAnswer("ecp", { ...ecpComplete, housingStatus: "", deadline: "" })).toEqual({
      step: "housing",
      field: "housingStatus",
    });
  });

  it("finds nothing missing in a complete battery request", () => {
    expect(firstMissingAnswer("battery", batteryComplete)).toBeNull();
  });

  it("skips the battery steps a visitor without PV never sees", () => {
    const noPv = { ...BATTERY_INITIAL, housingStatus: "owner", housingType: "house", solarEquipment: "none" };
    expect(firstMissingAnswer("battery", noPv)).toBeNull();
  });

  it("reports a battery tenant, who cannot reach the contact step, as having exited", () => {
    expect(firstMissingAnswer("battery", { ...BATTERY_INITIAL, housingStatus: "tenant" })).toEqual({
      step: "housing",
      field: null,
    });
  });
});
