import { describe, it, expect } from "vitest";
import { slugify, cleanModel, buildTitle, generateSlug } from "./clean";
import type { ScrapedVehicle } from "./types";

const abarth = {
  evdb_id: 1903,
  make: "Abarth",
  make_slug: "abarth",
  model: "500e Hatchback",
  title_v2: "",
  slug: "",
  year: { from: 2023, to: null },
  available: true,
  battery_details: { nominal_capacity: { value: 42.2, unit: "kWh" } },
  range: { value: 225, unit: "km" },
} as unknown as ScrapedVehicle;

describe("slugify", () => {
  it("strips accents and lowercases", () => {
    expect(slugify("Citroën Ë-C4")).toBe("citroen-e-c4");
  });

  it("expands & and +", () => {
    expect(slugify("R&S plus+")).toBe("r-and-s-plus-plus");
  });

  it("normalizes en/em dashes to hyphens and collapses runs", () => {
    expect(slugify("Model — X – Y")).toBe("model-x-y");
  });

  it("returns the fallback for empty input", () => {
    expect(slugify("", "vehicle")).toBe("vehicle");
  });

  it("truncates without leaving a trailing hyphen", () => {
    expect(slugify("a".repeat(50) + " " + "b".repeat(80), "vehicle", 51)).toBe("a".repeat(50));
  });
});

describe("cleanModel", () => {
  it("removes the make from the start, case-insensitively", () => {
    expect(cleanModel("Abarth 500e Hatchback", "abarth")).toBe("500e Hatchback");
  });

  it("collapses repeated whitespace", () => {
    expect(cleanModel("500e   Hatchback", "Abarth")).toBe("500e Hatchback");
  });

  it("keeps hyphens inside tokens", () => {
    expect(cleanModel("Ariya e-4ORCE", "Nissan")).toBe("Ariya e-4ORCE");
  });
});

describe("buildTitle", () => {
  it("assembles make, model, nominal battery, range and open year range", () => {
    expect(buildTitle(abarth)).toBe("Abarth 500e Hatchback 42kWh 225km [2023-]");
  });

  it("closes the year range once the vehicle is discontinued", () => {
    const done = { ...abarth, year: { from: 2023, to: 2026 } } as ScrapedVehicle;
    expect(buildTitle(done)).toBe("Abarth 500e Hatchback 42kWh 225km [2023-2026]");
  });

  it("uses nominal capacity, not useable", () => {
    // battery (useable) is 37.8 but the title must read 42kWh
    expect(buildTitle(abarth)).toContain("42kWh");
    expect(buildTitle(abarth)).not.toContain("37");
  });

  it("normalizes kW and hp spacing in the model", () => {
    const row = { ...abarth, model: "500e 210 kW 170 hp" } as ScrapedVehicle;
    expect(buildTitle(row)).toContain("210kW 170HP");
  });

  it("omits a battery mention already present in the model", () => {
    const row = { ...abarth, model: "500e 42 kWh Hatchback" } as ScrapedVehicle;
    expect(buildTitle(row)).toBe("Abarth 500e Hatchback 42kWh 225km [2023-]");
  });
});

describe("generateSlug", () => {
  it("produces the slug currently live in the CMS", () => {
    expect(generateSlug(abarth)).toBe("abarth-500e-hatchback-42kwh-225km-2023");
  });

  it("changes when the vehicle is discontinued — why slug must never be the identity key", () => {
    const done = { ...abarth, year: { from: 2023, to: 2026 } } as ScrapedVehicle;
    expect(generateSlug(done)).toBe("abarth-500e-hatchback-42kwh-225km-2023-2026");
    expect(generateSlug(done)).not.toBe(generateSlug(abarth));
  });
});
