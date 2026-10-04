import { describe, expect, it } from "vitest";
import { enrichToken, mergeEnrichAnswers, sanitizeEnrichAnswers, verifyEnrichToken } from "./quote-enrich";

describe("sanitizeEnrichAnswers", () => {
  it("keeps the six fields with accepted values only", () => {
    expect(
      sanitizeEnrichAnswers({
        electricalBoardType: "recent",
        electricalLineDistance: 10,
        electricalLineHoleCount: "na",
        ecpProvided: "maybe",
        vehicleChargingHours: 99,
        firstName: "Mallory",
        email: "x@y.z",
      }),
    ).toEqual({ electricalBoardType: "recent", electricalLineDistance: 10, electricalLineHoleCount: "na" });
  });

  it("returns nothing for garbage", () => {
    expect(sanitizeEnrichAnswers(null)).toEqual({});
    expect(sanitizeEnrichAnswers(["recent"])).toEqual({});
    expect(sanitizeEnrichAnswers({ electricalLineDistance: Number.NaN })).toEqual({});
  });
});

describe("mergeEnrichAnswers", () => {
  it("fills empty answers and never overwrites one already there", () => {
    const { merged, added } = mergeEnrichAnswers(
      { housingStatus: "owner", electricalBoardType: "old", electricalLineDistance: null, ecpProvided: "" },
      { electricalBoardType: "recent", electricalLineDistance: 20, ecpProvided: "include" },
    );
    expect(merged).toEqual({ housingStatus: "owner", electricalBoardType: "old", electricalLineDistance: 20, ecpProvided: "include" });
    expect(added).toEqual(["electricalLineDistance", "ecpProvided"]);
  });
});

describe("enrich token", () => {
  it("verifies for the same submission and key only", () => {
    const t = enrichToken("sub-1", "k1");
    expect(verifyEnrichToken("sub-1", t, "k1")).toBe(true);
    expect(verifyEnrichToken("sub-2", t, "k1")).toBe(false);
    expect(verifyEnrichToken("sub-1", t, "k2")).toBe(false);
    expect(verifyEnrichToken("sub-1", undefined, "k1")).toBe(false);
  });

  it("is disabled without a secret", () => {
    expect(enrichToken("sub-1", null)).toBeNull();
    expect(verifyEnrichToken("sub-1", "anything", null)).toBe(false);
  });
});
