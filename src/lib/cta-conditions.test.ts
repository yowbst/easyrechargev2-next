import { describe, expect, it } from "vitest";
import { matchesShowWhen } from "./cta-conditions";

const chargerToBattery = [
  { field: "solarEquipment", in: ["exists", "in-progress"] },
  { field: "homeBattery", in: ["none"] },
];
const batteryToCharger = {
  any: [
    [{ field: "evCount", gte: 1 }, { field: "hasCharger", in: ["no"] }],
    [{ field: "evPlanned", in: ["yes"] }],
  ],
};

describe("matchesShowWhen", () => {
  it("always shows a CTA without a condition", () => {
    expect(matchesShowWhen(undefined, null)).toBe(true);
    expect(matchesShowWhen(null, { a: 1 })).toBe(true);
  });

  it("requires every condition of a list", () => {
    expect(matchesShowWhen(chargerToBattery, { solarEquipment: "exists", homeBattery: "none" })).toBe(true);
    expect(matchesShowWhen(chargerToBattery, { solarEquipment: "exists", homeBattery: "exists" })).toBe(false);
    expect(matchesShowWhen(chargerToBattery, { solarEquipment: "none", homeBattery: "none" })).toBe(false);
  });

  it("accepts any group of an `any` condition", () => {
    expect(matchesShowWhen(batteryToCharger, { evCount: 2, hasCharger: "no" })).toBe(true);
    expect(matchesShowWhen(batteryToCharger, { evCount: 2, hasCharger: "yes" })).toBe(false);
    expect(matchesShowWhen(batteryToCharger, { evCount: 0, evPlanned: "yes" })).toBe(true);
    expect(matchesShowWhen(batteryToCharger, { evCount: 0, evPlanned: "no" })).toBe(false);
  });

  it("compares `gte` on numbers only", () => {
    expect(matchesShowWhen([{ field: "evCount", gte: 1 }], { evCount: "2" })).toBe(false);
  });

  it("hides a conditional CTA while the lead data is unknown (fetch pending or failed)", () => {
    expect(matchesShowWhen(chargerToBattery, null)).toBe(false);
  });

  it("hides a CTA whose condition is malformed (Review Focus 5)", () => {
    expect(matchesShowWhen({ field: "x", in: ["y"] }, { x: "y" })).toBe(false);
    expect(matchesShowWhen([], { x: "y" })).toBe(false);
    expect(matchesShowWhen([{ field: "x" }], { x: "y" })).toBe(false);
    expect(matchesShowWhen([{ in: ["y"] }], { x: "y" })).toBe(false);
    expect(matchesShowWhen({ any: [] }, { x: "y" })).toBe(false);
    expect(matchesShowWhen({ any: [[{ field: "x", in: ["y"] }], "garbage"] }, { x: "y" })).toBe(false);
    expect(matchesShowWhen("x == y", { x: "y" })).toBe(false);
  });
});
