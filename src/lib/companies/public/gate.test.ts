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

describe("installerIntentTitles", () => {
  it("puts installation first and keeps a short fallback for long names", async () => {
    const { installerIntentTitles } = await import("./gate");
    const { pickFittingTitle } = await import("@/lib/seo/resolver");
    expect(pickFittingTitle(installerIntentTitles("Nyon").title)).toBe("Installation et subventions borne de recharge à Nyon");
    expect(pickFittingTitle(installerIntentTitles("Cheseaux-sur-Lausanne").title)).toBe("Installation borne Cheseaux-sur-Lausanne et aides");
    expect(pickFittingTitle(installerIntentTitles("Saint-Légier-La Chiésaz (Saint-Légier)").title)).toBe("Installation borne Saint-Légier-La Chiésaz (Saint-Légier) et aides");
    for (const name of ["Cheseaux-sur-Lausanne", "Romanel-sur-Lausanne", "Yverdon-les-Bains"]) {
      expect(pickFittingTitle(installerIntentTitles(name).title)!.length).toBeLessThanOrEqual(60);
    }
    expect(installerIntentTitles("Nyon").h1).toBe("Borne de recharge à Nyon : installateurs et subventions");
  });
});
