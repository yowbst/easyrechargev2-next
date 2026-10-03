import { describe, expect, it } from "vitest";
import { BATTERY_INITIAL } from "./fields";
import { batteryFieldChange, batteryFirstUnanswered, hasNoPv, isTenant, parseDecimal } from "./validation";

const base = { ...BATTERY_INITIAL } as Record<string, unknown>;
const housed = { ...base, housingStatus: "owner", housingType: "house", solarEquipment: "exists" };
const pvDone = { ...housed, pvPower: 8, inverterBrand: "solaredge", existingBattery: "none" };

describe("parseDecimal (Review Focus 2)", () => {
  it("reads Swiss-style numbers", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal("12.5")).toBe(12.5);
    expect(parseDecimal(" 8 ")).toBe(8);
    expect(parseDecimal("12'000")).toBe(12000);
    expect(parseDecimal("12\u2019000")).toBe(12000);
  });

  it("rejects zero, negatives and garbage", () => {
    expect(parseDecimal("0")).toBeNull();
    expect(parseDecimal("-3")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("")).toBeNull();
  });
});

describe("housing step", () => {
  it("asks status, then type, then solar", () => {
    expect(batteryFirstUnanswered("housing", base)).toBe("housingStatus");
    expect(batteryFirstUnanswered("housing", { ...base, housingStatus: "owner" })).toBe("housingType");
    expect(batteryFirstUnanswered("housing", { ...base, housingStatus: "owner", housingType: "house" })).toBe("solarEquipment");
    expect(batteryFirstUnanswered("housing", housed)).toBeNull();
  });

  it("asks nothing more of a tenant (the step shows an exit instead)", () => {
    const tenant = { ...base, housingStatus: "tenant" };
    expect(isTenant(tenant)).toBe(true);
    expect(batteryFirstUnanswered("housing", tenant)).toBeNull();
  });

  it("flags a visitor without PV", () => {
    expect(hasNoPv({ ...housed, solarEquipment: "none" })).toBe(true);
    expect(hasNoPv(housed)).toBe(false);
    expect(hasNoPv(base)).toBe(false);
  });
});

describe("pv step", () => {
  it("accepts a bucket or 'don't know' for the size", () => {
    expect(batteryFirstUnanswered("pv", housed)).toBe("pvPower");
    expect(batteryFirstUnanswered("pv", { ...housed, pvPower: "na", inverterBrand: "unknown", existingBattery: "none" })).toBeNull();
  });

  it("requires a positive number in exact mode (Review Focus 2)", () => {
    expect(batteryFirstUnanswered("pv", { ...pvDone, pvPowerExact: true, pvPower: null })).toBe("pvPower");
    expect(batteryFirstUnanswered("pv", { ...pvDone, pvPowerExact: true, pvPower: "na" })).toBe("pvPower");
    expect(batteryFirstUnanswered("pv", { ...pvDone, pvPowerExact: true, pvPower: 12.5 })).toBeNull();
  });

  it("then asks the inverter and the existing battery", () => {
    expect(batteryFirstUnanswered("pv", { ...housed, pvPower: 8 })).toBe("inverterBrand");
    expect(batteryFirstUnanswered("pv", { ...housed, pvPower: 8, inverterBrand: "sma" })).toBe("existingBattery");
    expect(batteryFirstUnanswered("pv", pvDone)).toBeNull();
  });
});

describe("consumption step", () => {
  const full = { ...pvDone, householdCount: 3, heatPump: "no", evCount: 2, hasCharger: "no", deadline: "asap" };

  it("is complete with every required answer", () => {
    expect(batteryFirstUnanswered("consumption", full)).toBeNull();
  });

  it("asks the household size only for a single household", () => {
    expect(batteryFirstUnanswered("consumption", { ...full, householdCount: 1 })).toBe("householdSize");
    expect(batteryFirstUnanswered("consumption", { ...full, householdCount: 1, householdSize: 3.5 })).toBeNull();
  });

  it("leaves the exact consumption optional, but checks it once opened", () => {
    expect(batteryFirstUnanswered("consumption", { ...full, annualConsumptionExact: true })).toBe("annualConsumption");
    expect(batteryFirstUnanswered("consumption", { ...full, annualConsumptionExact: true, annualConsumption: 9000 })).toBeNull();
  });

  it("asks 'EV planned' with no EV and 'charger' with at least one", () => {
    expect(batteryFirstUnanswered("consumption", { ...full, evCount: 0, hasCharger: "" })).toBe("evPlanned");
    expect(batteryFirstUnanswered("consumption", { ...full, evCount: 0, hasCharger: "", evPlanned: "yes" })).toBeNull();
    expect(batteryFirstUnanswered("consumption", { ...full, hasCharger: "" })).toBe("hasCharger");
  });

  it("ends with the deadline", () => {
    expect(batteryFirstUnanswered("consumption", { ...full, deadline: "" })).toBe("deadline");
  });
});

describe("batteryFieldChange", () => {
  it("clears the charger answer when the EV count drops to 0, and 'planned' when it rises (Review Focus 3)", () => {
    const two = { ...base, evCount: 2, hasCharger: "no" };
    const zero = batteryFieldChange("evCount", 0, two);
    expect(zero.hasCharger).toBe("");
    expect(batteryFirstUnanswered("consumption", { ...pvDone, ...zero, householdCount: 2, heatPump: "no", deadline: "asap" })).toBe("evPlanned");

    const one = batteryFieldChange("evCount", 1, { ...zero, evPlanned: "yes" });
    expect(one.evPlanned).toBe("");
  });

  it("clears the household size when there are several households", () => {
    expect(batteryFieldChange("householdCount", 2, { ...base, householdSize: 2 }).householdSize).toBeNull();
    expect(batteryFieldChange("householdCount", 1, { ...base, householdSize: 2 }).householdSize).toBe(2);
  });

  it("resets the value when switching between bucket and exact entry", () => {
    expect(batteryFieldChange("pvPowerExact", true, { ...base, pvPower: 8 }).pvPower).toBeNull();
    expect(batteryFieldChange("annualConsumptionExact", false, { ...base, annualConsumption: 9000 }).annualConsumption).toBeNull();
  });

  it("drops 'apartment' when the visitor becomes a sole owner", () => {
    expect(batteryFieldChange("housingStatus", "owner", { ...base, housingType: "apartment" }).housingType).toBe("");
  });

  it("keeps the PV answers when solar is switched off and back on (Review Focus 1)", () => {
    const off = batteryFieldChange("solarEquipment", "none", pvDone);
    const on = batteryFieldChange("solarEquipment", "exists", off);
    expect(on.pvPower).toBe(8);
    expect(on.inverterBrand).toBe("solaredge");
  });
});
