import { describe, expect, it } from "vitest";
import { computePeriod, isPeriodIssuable } from "./period";

describe("computePeriod", () => {
  it("rejects malformed months", () => {
    for (const bad of ["2026", "26-07", "2026-7", "2026-13", "2026-00", ""]) {
      expect(() => computePeriod(bad, 15)).toThrow("invalid_month");
    }
  });

  it("computes bounds for a 31-day month", () => {
    expect(computePeriod("2026-07", 15)).toEqual({
      month: "2026-07",
      start: "2026-07-01",
      end: "2026-07-31",
      issuableFrom: "2026-08-16",
    });
  });

  it("handles February and leap years", () => {
    expect(computePeriod("2026-02", 15).end).toBe("2026-02-28");
    expect(computePeriod("2028-02", 15).end).toBe("2028-02-29");
  });

  it("rolls the issuable date across a year boundary", () => {
    expect(computePeriod("2026-12", 15).issuableFrom).toBe("2027-01-16");
  });

  it("makes a zero window issuable the day after period end", () => {
    expect(computePeriod("2026-07", 0).issuableFrom).toBe("2026-08-01");
  });
});

describe("isPeriodIssuable", () => {
  const period = computePeriod("2026-07", 15);

  it("is false before the issuable date", () => {
    expect(isPeriodIssuable(period, new Date("2026-08-15T23:59:59Z"))).toBe(false);
  });

  it("is true from the issuable date onward", () => {
    expect(isPeriodIssuable(period, new Date("2026-08-16T00:00:00Z"))).toBe(true);
    expect(isPeriodIssuable(period, new Date("2026-09-05T00:00:00Z"))).toBe(true);
  });
});
