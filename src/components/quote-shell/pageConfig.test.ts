import { describe, expect, it } from "vitest";
import { fieldConfig, hiddenFields, stepConfig, tooltipImageUrl } from "./pageConfig";

const cfg = {
  steps: [
    { id: "welcome", offer: { active: true, amount: 50 } },
    { id: "pv", fields: [{ key: "pvPower", tooltipImage: "uuid-1", buckets: [{ value: 4, label: "x" }] }] },
    { id: "contact", fields: [{ key: "phone", tooltipImages: ["uuid-2"] }] },
  ],
};

describe("page config helpers", () => {
  it("finds a field's config, or an empty object", () => {
    expect(fieldConfig(cfg, "pv", "pvPower").buckets).toEqual([{ value: 4, label: "x" }]);
    expect(fieldConfig(cfg, "pv", "nope")).toEqual({});
    expect(fieldConfig({}, "pv", "pvPower")).toEqual({});
    expect(fieldConfig({ steps: "garbage" }, "pv", "pvPower")).toEqual({});
  });

  it("finds a step's config", () => {
    expect(stepConfig(cfg, "welcome").offer).toEqual({ active: true, amount: 50 });
    expect(stepConfig(cfg, "nope")).toEqual({});
  });

  it("builds the asset proxy URL from either tooltip field", () => {
    expect(tooltipImageUrl(cfg, "pv", "pvPower")).toBe("/api/cms/assets/uuid-1");
    expect(tooltipImageUrl(cfg, "contact", "phone")).toBe("/api/cms/assets/uuid-2");
    expect(tooltipImageUrl(cfg, "pv", "nope")).toBeUndefined();
  });

  it("reads the hidden questions, ignoring anything that is not a key", () => {
    expect([...hiddenFields({ hiddenFields: ["deadline", 3, null] })]).toEqual(["deadline"]);
    expect(hiddenFields({}).size).toBe(0);
    expect(hiddenFields({ hiddenFields: "deadline" }).size).toBe(0);
  });
});
