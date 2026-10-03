import { describe, expect, it } from "vitest";
import { makeShellT } from "./dictionary";

const dict = {
  "pages.quote-battery.welcome.title": "Votre batterie",
  "pages.quote.welcome.title": "Votre borne",
  "pages.quote.navigation.next": "Continuer",
  "pages.quote-battery.welcome.subtitle": "Réponse en {first_contact} h",
  "pages.quote-battery.broken": "[pages.quote-battery.broken]",
};

describe("makeShellT", () => {
  const { tq, tqOpt } = makeShellT(dict, ["quote-battery", "quote"]);

  it("prefers the product page, then falls back to the charger page", () => {
    expect(tq("welcome.title")).toBe("Votre batterie");
    expect(tq("navigation.next")).toBe("Continuer");
  });

  it("interpolates variables", () => {
    expect(tq("welcome.subtitle", { first_contact: 48 })).toBe("Réponse en 48 h");
  });

  it("returns the full key when nothing is translated, like t()", () => {
    expect(tq("missing.key")).toBe("pages.quote-battery.missing.key");
  });

  it("treats bracket placeholders as missing", () => {
    expect(tqOpt("broken")).toBeUndefined();
    expect(tqOpt("missing.key")).toBeUndefined();
  });
});
