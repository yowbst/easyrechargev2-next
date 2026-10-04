import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: () => null }));

import { formatChargeTime } from "./VehicleCard";

describe("formatChargeTime", () => {
  it("reads minutes as hours from one hour up", () => {
    expect(formatChargeTime({ value: 510, unit: "min" })).toBe("8 h 30");
    expect(formatChargeTime({ value: 480, unit: "min" })).toBe("8 h");
    expect(formatChargeTime({ value: 65, unit: "min" })).toBe("1 h 05");
  });

  it("keeps short durations and other units as they are", () => {
    expect(formatChargeTime({ value: 45, unit: "min" })).toBe("45 min");
    expect(formatChargeTime({ value: 7, unit: "h" })).toBe("7 h");
    expect(formatChargeTime(undefined)).toBeNull();
  });
});
