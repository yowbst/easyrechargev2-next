import { describe, expect, it } from "vitest";
import { convertPathToLanguage } from "./slug-mapping";

const registry = {
  localities: { id: "localities", slugs: { fr: "localites", de: "ortschaften" } },
  vehicles: { id: "vehicles", slugs: { fr: "vehicules", de: "fahrzeuge" } },
  installation: { id: "installation", slugs: { fr: "installation-borne-de-recharge", de: "installation-ladestation" } },
};

describe("convertPathToLanguage", () => {
  it("translates the subsidy segment of locality pages both ways", () => {
    expect(convertPathToLanguage("/fr/localites/1033-cheseaux-sur-lausanne/subventions", "de", registry)).toBe("/de/ortschaften/1033-cheseaux-sur-lausanne/subventionen");
    expect(convertPathToLanguage("/de/ortschaften/3900-brig/subventionen", "fr", registry)).toBe("/fr/localites/3900-brig/subventions");
  });

  it("keeps the brand segment translation", () => {
    expect(convertPathToLanguage("/fr/vehicules/marques/tesla", "de", registry)).toBe("/de/fahrzeuge/marken/tesla");
  });

  it("sends French-only canton pages to the installation page in German", () => {
    expect(convertPathToLanguage("/fr/installation-borne-de-recharge/vaud", "de", registry)).toBe("/de/installation-ladestation");
    expect(convertPathToLanguage("/fr/installation-borne-de-recharge", "de", registry)).toBe("/de/installation-ladestation");
  });

  it("falls back to the language root for unknown paths", () => {
    expect(convertPathToLanguage("/fr/nope/x", "de", registry)).toBe("/de");
  });
});
