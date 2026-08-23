import { describe, it, expect } from "vitest";
import { buildPayload } from "./fieldmap";
import type { ScrapedVehicle } from "./types";

const row = {
  evdb_id: 1903,
  make: "Abarth",
  make_slug: "abarth",
  model: "500e Hatchback",
  title_v2: "Abarth 500e Hatchback 42kWh 225km [2023-]",
  slug: "abarth-500e-hatchback-42kwh-225km-2023",
  year: { from: 2023, to: null },
  available: true,
  availability: "Available to order since May 2023",
  battery: { value: 37.8, unit: "kWh" },
  range: { value: 225, unit: "km" },
  car_url: "https://ev-database.org/car/1903",
} as unknown as ScrapedVehicle;

describe("buildPayload", () => {
  it("sets status draft on create", () => {
    expect(buildPayload(row, { isCreate: true }).status).toBe("draft");
  });

  it("NEVER sets status on update — this would unpublish the live catalogue", () => {
    expect("status" in buildPayload(row, { isCreate: false })).toBe(false);
  });

  it("never sets slug on update — slugs are frozen after creation", () => {
    expect("slug" in buildPayload(row, { isCreate: false })).toBe(false);
    expect(buildPayload(row, { isCreate: true }).slug).toBe(row.slug);
  });

  it("stringifies evdb_id to match the Directus column type", () => {
    expect(buildPayload(row, { isCreate: true }).evdb_id).toBe("1903");
  });

  it("preserves {value, unit} spec objects rather than flattening them", () => {
    expect(buildPayload(row, { isCreate: false }).battery).toEqual({ value: 37.8, unit: "kWh" });
  });

  it("maps title_v2 to name and car_url to evdb_url", () => {
    const p = buildPayload(row, { isCreate: false });
    expect(p.name).toBe(row.title_v2);
    expect(p.evdb_url).toBe(row.car_url);
  });

  it("attaches the brand relation when a brand id is supplied", () => {
    expect(buildPayload(row, { isCreate: true, brandId: "uuid-1" }).brand).toBe("uuid-1");
  });

  it("omits the brand key entirely when the brand is unknown", () => {
    expect("brand" in buildPayload(row, { isCreate: true, brandId: null })).toBe(false);
  });

  it("skips null and empty-string source values", () => {
    const sparse = { ...row, car_url: "", battery: null } as unknown as ScrapedVehicle;
    const p = buildPayload(sparse, { isCreate: false });
    expect("evdb_url" in p).toBe(false);
    expect("battery" in p).toBe(false);
  });

  it("never emits an 'availability' key — no such column exists on vehicles", () => {
    expect("availability" in buildPayload(row, { isCreate: true })).toBe(false);
    expect("availability" in buildPayload(row, { isCreate: false })).toBe(false);
  });

  describe("is_available tri-state handling", () => {
    it("writes true when available is exactly true", () => {
      const r = { ...row, available: true } as unknown as ScrapedVehicle;
      expect(buildPayload(r, { isCreate: true }).is_available).toBe(true);
      expect(buildPayload(r, { isCreate: false }).is_available).toBe(true);
    });

    it("writes false when available is exactly false", () => {
      const r = { ...row, available: false } as unknown as ScrapedVehicle;
      expect(buildPayload(r, { isCreate: true }).is_available).toBe(false);
      expect(buildPayload(r, { isCreate: false }).is_available).toBe(false);
    });

    it("omits is_available entirely when available is \"unknown\" — refuses to guess", () => {
      const r = { ...row, available: "unknown" } as unknown as ScrapedVehicle;
      expect("is_available" in buildPayload(r, { isCreate: true })).toBe(false);
      expect("is_available" in buildPayload(r, { isCreate: false })).toBe(false);
    });
  });
});
