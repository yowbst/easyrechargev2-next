import { describe, it, expect } from "vitest";
import { isNumericField } from "./types";

describe("isNumericField", () => {
  it("accepts a well-formed numeric field", () => {
    expect(isNumericField({ value: 42.2, unit: "kWh" })).toBe(true);
  });

  it("rejects a bare number — the shape that silently becomes 0 on the site", () => {
    expect(isNumericField(42.2)).toBe(false);
  });

  it("rejects null, undefined and missing unit", () => {
    expect(isNumericField(null)).toBe(false);
    expect(isNumericField(undefined)).toBe(false);
    expect(isNumericField({ value: 42 })).toBe(false);
  });
});
