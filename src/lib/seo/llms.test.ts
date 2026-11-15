import { describe, expect, it } from "vitest";
import { buildLlmsTxt, cleanText } from "./llms";

describe("cleanText", () => {
  it("strips tags, collapses whitespace and drops the brand suffix", () => {
    expect(cleanText("<p>Demande de devis   pour borne</p> | easyRecharge")).toBe("Demande de devis pour borne");
  });

  it("discards text with an unresolved placeholder", () => {
    expect(cleanText("Comparez {f:count} véhicules")).toBeUndefined();
  });

  it("truncates on a word boundary and ignores non-strings", () => {
    expect(cleanText("un deux trois quatre", 10)).toBe("un deux…");
    expect(cleanText(null)).toBeUndefined();
    expect(cleanText("   ")).toBeUndefined();
  });
});

describe("buildLlmsTxt", () => {
  const base = { name: "easyRecharge", summary: "Installation de bornes.", details: ["Adresse : X"] };

  it("renders title, summary, details, sections and groups", () => {
    const txt = buildLlmsTxt({
      ...base,
      sections: [
        { heading: "Pages principales", links: [{ title: "Accueil", url: "https://x.ch/fr", description: "Devis" }] },
        { heading: "Guides", links: [], groups: [{ heading: "Guide recharge", links: [{ title: "Coût", url: "https://x.ch/fr/b" }] }] },
      ],
    });
    expect(txt).toBe(
      [
        "# easyRecharge",
        "",
        "> Installation de bornes.",
        "",
        "Adresse : X",
        "",
        "## Pages principales",
        "",
        "- [Accueil](https://x.ch/fr): Devis",
        "",
        "## Guides",
        "",
        "### Guide recharge",
        "",
        "- [Coût](https://x.ch/fr/b)",
        "",
      ].join("\n"),
    );
  });

  it("omits empty sections and empty groups", () => {
    const txt = buildLlmsTxt({
      ...base,
      sections: [
        { heading: "Vide", links: [] },
        { heading: "Groupes vides", links: [], groups: [{ heading: "G", links: [] }] },
      ],
    });
    expect(txt).not.toContain("## Vide");
    expect(txt).not.toContain("Groupes vides");
  });
});
