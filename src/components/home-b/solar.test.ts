import { describe, expect, it } from "vitest";
import type { PageRegistryEntry } from "@/lib/directus-queries";
import { buildSolarSection } from "./solar";

const P = "pages.home.blocks.solar";

const registry: PageRegistryEntry[] = [
  { id: "quote", sysId: "1", pageType: "app", slugs: { fr: "demande-devis", de: "offertenanfrage" } },
  {
    id: "quote-battery",
    sysId: "2",
    pageType: "app",
    slugs: { fr: "demande-devis-batterie-solaire", de: "offertenanfrage-solarbatterie" },
  },
];

function without(key: string): Record<string, string> {
  const copy = { ...full };
  delete copy[`${P}.${key}`];
  return copy;
}

const full: Record<string, string> = {
  [`${P}.eyebrow`]: "Batterie solaire",
  [`${P}.title`]: "Stockez votre production solaire",
  [`${P}.lede`]: "Un installateur partenaire vous fait une offre.",
  [`${P}.points.0`]: "Point A",
  [`${P}.points.1`]: "Point B",
  [`${P}.cta.label`]: "Demander un devis batterie",
  [`${P}.image`]: "abc-123",
  [`${P}.image_alt`]: "Batterie murale",
  [`${P}.stat.value`]: "60 %",
  [`${P}.stat.label`]: "autoconsommation",
};

describe("buildSolarSection", () => {
  it("is hidden without a title", () => {
    expect(buildSolarSection(without("title"), registry, "fr")).toBeNull();
    expect(buildSolarSection({}, registry, "fr")).toBeNull();
  });

  it("is hidden when the title is a placeholder", () => {
    expect(buildSolarSection({ ...full, [`${P}.title`]: `[${P}.title]` }, registry, "fr")).toBeNull();
  });

  it("builds every field from the dictionary", () => {
    expect(buildSolarSection(full, registry, "fr")).toEqual({
      eyebrow: "Batterie solaire",
      title: "Stockez votre production solaire",
      lede: "Un installateur partenaire vous fait une offre.",
      points: ["Point A", "Point B"],
      action: {
        label: "Demander un devis batterie",
        href: "/fr/demande-devis-batterie-solaire?src=home-solar",
      },
      image: "/api/cms/assets/abc-123",
      imageAlt: "Batterie murale",
      statValue: "60 %",
      statLabel: "autoconsommation",
    });
  });

  it("links to the localized battery funnel", () => {
    expect(buildSolarSection(full, registry, "de")?.action?.href).toBe(
      "/de/offertenanfrage-solarbatterie?src=home-solar",
    );
  });

  it("has no button without a label or a battery page", () => {
    expect(buildSolarSection(without("cta.label"), registry, "fr")?.action).toBeUndefined();
    expect(buildSolarSection(full, registry.slice(0, 1), "fr")?.action).toBeUndefined();
    expect(buildSolarSection(full, registry, "it")?.action).toBeUndefined();
  });

  it("stops the points at the first gap", () => {
    const gap = { ...full, [`${P}.points.1`]: "", [`${P}.points.2`]: "Point C" };
    expect(buildSolarSection(gap, registry, "fr")?.points).toEqual(["Point A"]);
  });

  it("has no image without an asset id", () => {
    const section = buildSolarSection(without("image"), registry, "fr");
    expect(section?.image).toBeUndefined();
    expect(section?.title).toBe("Stockez votre production solaire");
  });
});
