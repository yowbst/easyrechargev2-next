import { describe, expect, it } from "vitest";
import { buildAddonBatteryData, isBatteryAddonEligible, stripAddon, wantsBatteryAddon } from "./batteryAddon";

const eligible = { housingStatus: "owner", solarEquipment: "exists", homeBattery: "none" };

describe("isBatteryAddonEligible", () => {
  it.each([
    [{ ...eligible }, true],
    [{ ...eligible, housingStatus: "co-owner" }, true],
    [{ ...eligible, solarEquipment: "in-progress" }, true],
    [{ ...eligible, housingStatus: "tenant" }, false],
    [{ ...eligible, housingStatus: "" }, false],
    [{ ...eligible, solarEquipment: "none" }, false],
    [{ ...eligible, homeBattery: "in-progress" }, false],
    [{ ...eligible, homeBattery: "exists" }, false],
    [{ ...eligible, homeBattery: "" }, false],
  ])("%o → %s", (d, expected) => {
    expect(isBatteryAddonEligible(d)).toBe(expected);
  });
});

describe("wantsBatteryAddon", () => {
  it("needs the explicit tick and eligibility", () => {
    expect(wantsBatteryAddon({ ...eligible, batteryAddon: true })).toBe(true);
    expect(wantsBatteryAddon({ ...eligible, batteryAddon: "true" })).toBe(false);
    expect(wantsBatteryAddon({ ...eligible, batteryAddon: false })).toBe(false);
    expect(wantsBatteryAddon({ ...eligible, housingStatus: "tenant", batteryAddon: true })).toBe(false);
  });
});

describe("stripAddon", () => {
  it("removes only the add-on keys", () => {
    expect(stripAddon({ ...eligible, batteryAddon: true, batteryAddonPvPower: 8 })).toEqual(eligible);
  });
});

describe("buildAddonBatteryData", () => {
  const charger = {
    ...eligible,
    housingType: "house",
    approval: "yes",
    deadline: "asap",
    streetName: "Rue du Test",
    streetNb: "1",
    postalCode: "1003",
    locality: "Lausanne",
    canton: "VD",
    country: "CH",
    acceptTerms: true,
    parkingSpotLocation: "garage-adjacent",
    comment: "pour la borne",
    batteryAddon: true,
    batteryAddonPvPower: 8,
  };

  it("copies the shared answers, maps PV size and leaves charger answers out", () => {
    expect(buildAddonBatteryData(charger)).toEqual({
      product: "battery",
      housingStatus: "owner",
      housingType: "house",
      solarEquipment: "exists",
      approval: "yes",
      deadline: "asap",
      streetName: "Rue du Test",
      streetNb: "1",
      postalCode: "1003",
      locality: "Lausanne",
      canton: "VD",
      country: "CH",
      acceptTerms: true,
      pvPower: 8,
    });
  });

  it("keeps \"na\" and blanks anything else", () => {
    expect(buildAddonBatteryData({ ...charger, batteryAddonPvPower: "na" }).pvPower).toBe("na");
    expect(buildAddonBatteryData({ ...charger, batteryAddonPvPower: "" }).pvPower).toBe("");
    expect(buildAddonBatteryData({ ...charger, batteryAddonPvPower: "8" }).pvPower).toBe("");
  });
});
