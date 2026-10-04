import { describe, expect, it } from "vitest";
import { deriveExcerpt } from "./blog-excerpt";

describe("deriveExcerpt", () => {
  it("prefers the SEO meta description", () => {
    expect(deriveExcerpt({ body: "<p>Corps</p>", seo: { meta_description: " Résumé écrit. " } }, "Titre")).toBe("Résumé écrit.");
  });

  it("falls back to the body, without the repeated title or HTML", () => {
    const body = "<h1>Combien coûte une borne ?</h1><p>Installer une borne coûte CHF&nbsp;1'500 à 4'000.</p>";
    expect(deriveExcerpt({ body }, "Combien coûte une borne ?")).toBe("Installer une borne coûte CHF 1'500 à 4'000.");
  });

  it("cuts long text on a word and marks the cut", () => {
    const out = deriveExcerpt({ body: "mot ".repeat(80) }, "Autre", 30);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(31);
  });

  it("returns nothing without a translation", () => {
    expect(deriveExcerpt(undefined, "Titre")).toBe("");
  });
});
