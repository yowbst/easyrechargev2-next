import { describe, it, expect } from "vitest";
import { resolveBuckets, DEFAULT_BUCKETS } from "./quoteBuckets";

describe("quoteBuckets", () => {
  it("has defaults for all four former slider fields", () => {
    for (const key of ["electricalLineDistance", "electricalLineHoleCount", "vehicleTripDistance", "vehicleChargingHours"]) {
      expect(DEFAULT_BUCKETS[key]?.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("interpolates the unit with a non-breaking space", () => {
    const buckets = resolveBuckets("electricalLineDistance", undefined, "m");
    expect(buckets[0]).toEqual({ value: 5, label: "≤ 5 m" });
    expect(buckets[3]).toEqual({ value: 40, label: "> 30 m" });
  });

  it("leaves label untouched when there is no {u} placeholder", () => {
    const buckets = resolveBuckets("electricalLineHoleCount", undefined, "murs");
    expect(buckets.map((b) => b.label)).toEqual(["0", "1", "2", "3+"]);
  });

  it("uses valid page-config buckets when provided", () => {
    const cfg = [{ value: 1, label: "petit" }, { value: 99, label: "grand" }];
    expect(resolveBuckets("electricalLineDistance", cfg, "m")).toEqual(cfg);
  });

  it("falls back to defaults on malformed config", () => {
    expect(resolveBuckets("vehicleTripDistance", [{ value: "x" }], "km").length).toBe(4);
    expect(resolveBuckets("vehicleTripDistance", "nope", "km").length).toBe(4);
    expect(resolveBuckets("unknownField", undefined, "")).toEqual([]);
  });
});
