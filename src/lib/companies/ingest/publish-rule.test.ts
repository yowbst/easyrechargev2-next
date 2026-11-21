import { describe, expect, it } from "vitest";
import { computeStatus, effectiveClassification, MIN_PUBLISH_CONFIDENCE } from "./publish-rule";

const base = {
  classification: "installer" as const,
  confidence: 0.9,
  override: null,
  inLiquidation: false,
  doNotDisplay: false,
  gone: false,
};

describe("computeStatus", () => {
  it("publishes a confident installer", () => {
    expect(computeStatus(base)).toBe("published");
  });

  it("needs the confidence threshold", () => {
    expect(computeStatus({ ...base, confidence: MIN_PUBLISH_CONFIDENCE })).toBe("published");
    expect(computeStatus({ ...base, confidence: 0.79 })).toBe("draft");
    expect(computeStatus({ ...base, confidence: null })).toBe("draft");
  });

  it.each(["inspector", "planner", "solar", "other", "unclassified"] as const)("keeps %s as draft", (c) => {
    expect(computeStatus({ ...base, classification: c })).toBe("draft");
  });

  it("never shows a company in liquidation or flagged do_not_display", () => {
    expect(computeStatus({ ...base, inLiquidation: true })).toBe("draft");
    expect(computeStatus({ ...base, doNotDisplay: true })).toBe("draft");
  });

  it("archives gone rows whatever else is true", () => {
    expect(computeStatus({ ...base, gone: true })).toBe("archived");
  });

  it("lets a human override beat the model in both directions", () => {
    expect(computeStatus({ ...base, classification: "other", confidence: 0.2, override: "installer" })).toBe("published");
    expect(computeStatus({ ...base, override: "inspector" })).toBe("draft");
  });

  it("does not let an override defeat do_not_display or liquidation", () => {
    expect(computeStatus({ ...base, override: "installer", doNotDisplay: true })).toBe("draft");
    expect(computeStatus({ ...base, override: "installer", inLiquidation: true })).toBe("draft");
  });
});

describe("effectiveClassification", () => {
  it("prefers the override", () => {
    expect(effectiveClassification({ classification: "other", classification_override: "installer" })).toBe("installer");
    expect(effectiveClassification({ classification: "other", classification_override: null })).toBe("other");
  });
});
