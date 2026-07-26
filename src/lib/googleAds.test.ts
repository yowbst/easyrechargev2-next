import { describe, it, expect } from "vitest";
import { adsSendTo, type GoogleAdsConfig } from "./googleAds";

const nested: GoogleAdsConfig = {
  tag_id: "AW-1",
  conversions: {
    ecp: {
      quote_submit: { label: "LBL_SUBMIT" },
      quote_start: { label: "LBL_START" },
    },
  },
};

describe("adsSendTo", () => {
  it("resolves nested per-product labels (default product)", () => {
    expect(adsSendTo(nested, "quote_submit")).toBe("AW-1/LBL_SUBMIT");
    expect(adsSendTo(nested, "quote_start", "ecp")).toBe("AW-1/LBL_START");
  });

  it("returns null for an event with no label", () => {
    expect(adsSendTo(nested, "contact_submit")).toBeNull();
  });

  it("returns null for a product with no config block", () => {
    expect(adsSendTo(nested, "quote_submit", "solar" as never)).toBeNull();
  });

  it("returns null without a tag_id", () => {
    expect(adsSendTo({ conversions: { ecp: { quote_submit: { label: "X" } } } }, "quote_submit")).toBeNull();
    expect(adsSendTo(undefined, "quote_submit")).toBeNull();
  });
});
