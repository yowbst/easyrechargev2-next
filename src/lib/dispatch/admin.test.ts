import { describe, expect, it } from "vitest";
import { getMonthlyBilling } from "./admin";

describe("getMonthlyBilling", () => {
  it("rejects malformed months before touching Directus", async () => {
    for (const bad of ["2026", "26-05", "2026-5", "2026-13x", ""]) {
      await expect(getMonthlyBilling(bad)).rejects.toThrow("invalid_month");
    }
  });
});
