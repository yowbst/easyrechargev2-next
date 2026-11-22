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

describe("computeStatus with evidence and partners", () => {
  it("needs explicit installation wording to publish a model-labelled installer", () => {
    expect(computeStatus({ ...base, evidence: "weak" })).toBe("draft");
    expect(computeStatus({ ...base, evidence: "explicit" })).toBe("published");
  });

  it("publishes a linked partner whatever the model says", () => {
    expect(computeStatus({ ...base, classification: "other", confidence: 0.1, evidence: "weak", isPartner: true })).toBe("published");
  });

  it("still hides a partner in liquidation or flagged do_not_display", () => {
    expect(computeStatus({ ...base, isPartner: true, inLiquidation: true })).toBe("draft");
    expect(computeStatus({ ...base, isPartner: true, doNotDisplay: true })).toBe("draft");
  });

  it("lets a human override publish weak evidence", () => {
    expect(computeStatus({ ...base, evidence: "weak", override: "installer" })).toBe("published");
  });
});
