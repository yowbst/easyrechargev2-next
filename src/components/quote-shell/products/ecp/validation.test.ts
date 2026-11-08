import { describe, expect, it } from "vitest";
import { ECP_INITIAL, LEAN_REMOVED_FIELDS } from "./fields";
import { ecpFieldChange, ecpFirstUnanswered } from "./validation";

const complete = {
  ...ECP_INITIAL,
  housingStatus: "owner",
  housingType: "house",
  solarEquipment: "none",
  parkingSpotLocation: "garage-adjacent",
  parkingSpotCount: "1",
  deadline: "asap",
  vehicleStatus: "own",
} as Record<string, unknown>;

describe("ecpFirstUnanswered", () => {
  it("returns null for every complete step", () => {
    for (const step of ["housing", "parking", "charger", "vehicle"]) {
      expect(ecpFirstUnanswered(step, complete)).toBeNull();
    }
  });

  it("never asks the six questions removed by the lean test", () => {
    for (const field of LEAN_REMOVED_FIELDS) expect(complete[field]).toBeNull();
    for (const step of ["housing", "parking", "charger", "vehicle"]) {
      expect(ecpFirstUnanswered(step, complete)).toBeNull();
    }
  });

  it("housing: visual order and conditional questions", () => {
    expect(ecpFirstUnanswered("housing", { ...complete, housingStatus: "" })).toBe("housingStatus");
    expect(ecpFirstUnanswered("housing", { ...complete, solarEquipment: "" })).toBe("solarEquipment");
    expect(ecpFirstUnanswered("housing", { ...complete, solarEquipment: "exists", homeBattery: "" })).toBe("homeBattery");
    expect(
      ecpFirstUnanswered("housing", { ...complete, housingStatus: "tenant", housingType: "apartment", neighborhoodEquipment: "" }),
    ).toBe("neighborhoodEquipment");
  });

  it("housing: the approval question is optional", () => {
    expect(ecpFirstUnanswered("housing", { ...complete, housingStatus: "co-owner", housingType: "house", neighborhoodEquipment: "none", approval: "" })).toBeNull();
  });

  it("parking: the first level alone is not an answer", () => {
    expect(ecpFirstUnanswered("parking", { ...complete, parkingSpotLocation: "exterior" })).toBe("parkingSpotLocation");
    expect(ecpFirstUnanswered("parking", { ...complete, parkingSpotLocation: "underground" })).toBeNull();
  });

  it("charger and vehicle", () => {
    expect(ecpFirstUnanswered("charger", { ...complete, deadline: "" })).toBe("deadline");
    expect(ecpFirstUnanswered("vehicle", { ...complete, vehicleStatus: "" })).toBe("vehicleStatus");
  });

  it("skips questions hidden in the page config", () => {
    const hidden = new Set(["deadline", "solarEquipment"]);
    expect(ecpFirstUnanswered("charger", { ...complete, deadline: "" }, hidden)).toBeNull();
    expect(ecpFirstUnanswered("housing", { ...complete, solarEquipment: "" }, hidden)).toBeNull();
  });
});

describe("ecpFieldChange", () => {
  it("clears answers the change makes irrelevant", () => {
    expect(ecpFieldChange("housingStatus", "owner", { ...complete, housingType: "apartment" }).housingType).toBe("");
    expect(ecpFieldChange("solarEquipment", "none", { ...complete, homeBattery: "exists" }).homeBattery).toBe("");
    expect(
      ecpFieldChange("housingStatus", "owner", { ...complete, housingStatus: "tenant", housingType: "house", neighborhoodEquipment: "exists" })
        .neighborhoodEquipment,
    ).toBe("");
    expect(ecpFieldChange("housingStatus", "owner", { ...complete, housingStatus: "tenant", approval: "yes" }).approval).toBe("");
    expect(ecpFieldChange("housingStatus", "co-owner", { ...complete, housingStatus: "tenant", approval: "yes" }).approval).toBe("yes");
  });

  const optedIn = { ...complete, solarEquipment: "exists", homeBattery: "none", batteryAddon: true, batteryAddonPvPower: 8 };

  it("battery add-on: cleared when eligibility is lost", () => {
    for (const [field, value] of [
      ["housingStatus", "tenant"],
      ["solarEquipment", "none"],
      ["homeBattery", "in-progress"],
    ] as const) {
      const next = ecpFieldChange(field, value, optedIn);
      expect(next.batteryAddon).toBe(false);
      expect(next.batteryAddonPvPower).toBe("");
    }
  });

  it("battery add-on: kept while still eligible", () => {
    const next = ecpFieldChange("solarEquipment", "in-progress", optedIn);
    expect(next.batteryAddon).toBe(true);
    expect(next.batteryAddonPvPower).toBe(8);
  });

  it("battery add-on: unticking clears the PV size", () => {
    expect(ecpFieldChange("batteryAddon", false, optedIn).batteryAddonPvPower).toBe("");
  });
});

describe("ecpFirstUnanswered — battery add-on", () => {
  const base = { ...complete, solarEquipment: "exists", homeBattery: "none" };

  it("asks the PV size once ticked, after the battery question", () => {
    expect(ecpFirstUnanswered("housing", { ...base, batteryAddon: true, batteryAddonPvPower: "" })).toBe("batteryAddonPvPower");
    expect(ecpFirstUnanswered("housing", { ...base, batteryAddon: true, batteryAddonPvPower: "na" })).toBeNull();
    expect(ecpFirstUnanswered("housing", { ...base, batteryAddon: true, batteryAddonPvPower: 15 })).toBeNull();
  });

  it("does not ask it when not ticked or not eligible", () => {
    expect(ecpFirstUnanswered("housing", { ...base, batteryAddon: false, batteryAddonPvPower: "" })).toBeNull();
    expect(ecpFirstUnanswered("housing", { ...base, housingStatus: "tenant", housingType: "house", batteryAddon: true, batteryAddonPvPower: "" })).toBeNull();
  });
});
