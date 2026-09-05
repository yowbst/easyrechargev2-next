import { describe, it, expect } from "vitest";
import { deriveBrands, buildBrandPayload } from "./brands";
import type { ScrapedVehicle } from "./types";

const row = (make: string, model: string) =>
  ({ evdb_id: Math.random(), make, make_slug: make.toLowerCase(), model }) as unknown as ScrapedVehicle;

describe("deriveBrands", () => {
  it("groups by make and counts distinct models", () => {
    const brands = deriveBrands([
      row("Abarth", "500e"),
      row("Abarth", "600e"),
      row("Abarth", "500e"),
      row("BMW", "i4"),
    ]);
    expect(brands).toEqual([
      { name: "Abarth", slug: "abarth", active_models: 2 },
      { name: "BMW", slug: "bmw", active_models: 1 },
    ]);
  });

  it("slugifies makes that need normalizing", () => {
    expect(deriveBrands([row("Citroën", "e-C4")])[0].slug).toBe("citroen");
  });
});

describe("buildBrandPayload", () => {
  const brand = { name: "Abarth", slug: "abarth", active_models: 2 };

  it("sets status draft on create", () => {
    expect(buildBrandPayload(brand, true).status).toBe("draft");
  });

  it("NEVER sets status on update", () => {
    expect("status" in buildBrandPayload(brand, false)).toBe(false);
  });

  it("never rewrites the slug on update", () => {
    expect("slug" in buildBrandPayload(brand, false)).toBe(false);
  });

  it("always refreshes the active model count", () => {
    expect(buildBrandPayload(brand, false).active_models).toBe(2);
  });
});
