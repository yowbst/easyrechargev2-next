import { describe, expect, it } from "vitest";
import { checkRouteTokens, resolveRouteLinks } from "./pageConfig";
import type { PageRegistryEntry } from "./directus-queries";

const registry: PageRegistryEntry[] = [
  { id: "quote", sysId: "1", pageType: "quote", slugs: { fr: "demande-devis", de: "offerte-anfordern" } },
  { id: "contact", sysId: "2", pageType: "contact", slugs: { fr: "contact", de: "kontakt" } },
];

describe("resolveRouteLinks", () => {
  it("resolves known ids per language and leaves unknown ones visible", () => {
    const html = '<a href="{r:quote}">a</a> <a href="{r:qoute}">b</a>';
    expect(resolveRouteLinks(html, "de", registry)).toBe(
      '<a href="/de/offerte-anfordern">a</a> <a href="{r:qoute}">b</a>',
    );
  });
});

describe("checkRouteTokens", () => {
  it("accepts known ids and home", () => {
    const report = checkRouteTokens({ body: '<a href="{r:quote}">x</a> <a href="{r:home}">y</a>' }, registry);
    expect(report).toEqual({ unknownIds: [], hardcoded: [] });
  });

  it("reports unknown ids inside nested translations, once each", () => {
    const data = {
      translations: [
        { languages_code: "fr-FR", body: '<a href="{r:qoute}">x</a>' },
        { languages_code: "de-DE", body: '<a href="{r:qoute}">x</a> {r:kontact}' },
      ],
    };
    expect(checkRouteTokens(data, registry).unknownIds).toEqual(["qoute", "kontact"]);
  });

  it("suggests a token for hardcoded links to registry pages", () => {
    const html =
      '<a href="/fr/demande-devis">a</a> <a href="https://www.easyrecharge.ch/de/kontakt/">b</a> <a href="/fr">c</a>';
    expect(checkRouteTokens(html, registry).hardcoded).toEqual([
      { url: "/fr/demande-devis", suggestion: "{r:quote}" },
      { url: "/de/kontakt", suggestion: "{r:contact}" },
      { url: "/fr", suggestion: "{r:home}" },
    ]);
  });

  it("ignores item links and URLs outside an href", () => {
    const html = '<a href="/fr/vehicules/tesla/model-3">a</a> Voir /fr/demande-devis pour un devis.';
    expect(checkRouteTokens(html, registry).hardcoded).toEqual([]);
  });
});
