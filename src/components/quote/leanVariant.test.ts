import { describe, it, expect } from "vitest";
import { hiddenFieldsFor, LEAN_HIDDEN_FIELDS } from "./leanVariant";

describe("hiddenFieldsFor", () => {
  it("control hides nothing", () => {
    expect(hiddenFieldsFor("control").size).toBe(0);
  });

  it("lean hides exactly the six target fields", () => {
    const lean = hiddenFieldsFor("lean");
    expect([...lean].sort()).toEqual(
      [
        "ecpProvided",
        "electricalBoardType",
        "electricalLineDistance",
        "electricalLineHoleCount",
        "vehicleChargingHours",
        "vehicleTripDistance",
      ].sort(),
    );
  });

  it("exposes the canonical set", () => {
    expect(LEAN_HIDDEN_FIELDS.has("electricalBoardType")).toBe(true);
    expect(LEAN_HIDDEN_FIELDS.has("housingStatus")).toBe(false);
  });
});
