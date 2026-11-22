import { describe, expect, it } from "vitest";
import { installersBlockEnabled } from "./gate";

describe("installersBlockEnabled", () => {
  const vd = { installers_block: { enabled: true, cantons: ["VD"] } };
  it("opens the listed cantons on French pages", () => {
    expect(installersBlockEnabled(vd, "VD", "fr")).toBe(true);
    expect(installersBlockEnabled(vd, "vd", "fr")).toBe(true);
    expect(installersBlockEnabled(vd, "VS", "fr")).toBe(false);
  });
  it("never shows on German pages", () => {
    expect(installersBlockEnabled(vd, "VD", "de")).toBe(false);
    expect(installersBlockEnabled({ installers_block: { enabled: true, cantons: "*" } }, "BE", "de")).toBe(false);
  });
  it("opens every canton with '*'", () => {
    expect(installersBlockEnabled({ installers_block: { enabled: true, cantons: "*" } }, "ZH", "fr")).toBe(true);
  });
  it("is off when missing, disabled or malformed", () => {
    expect(installersBlockEnabled(undefined, "VD", "fr")).toBe(false);
    expect(installersBlockEnabled({}, "VD", "fr")).toBe(false);
    expect(installersBlockEnabled({ installers_block: { enabled: false, cantons: "*" } }, "VD", "fr")).toBe(false);
    expect(installersBlockEnabled({ installers_block: { enabled: "true", cantons: ["VD"] } }, "VD", "fr")).toBe(false);
    expect(installersBlockEnabled({ installers_block: { enabled: true, cantons: "VD" } }, "VD", "fr")).toBe(false);
  });
});
