import { describe, it, expect } from "vitest";
import { unwrapDetails, classifyAvailability, mergeListAndDetails } from "./merge";

const detailObj = {
  car_url: "https://ev-database.org/car/1903",
  battery_details: { nominal_capacity: { value: 42.2, unit: "kWh" } },
  metadata: { parsed_at: "2026-08-23T10:00:00.000Z" },
};

describe("unwrapDetails", () => {
  it("parses the {vehicle: '<json>'} wrapper the PROD parser emits", () => {
    const out = unwrapDetails([{ vehicle: JSON.stringify(detailObj) }]);
    expect(out[0].car_url).toBe(detailObj.car_url);
    expect(out[0].battery_details).toEqual(detailObj.battery_details);
  });

  it("passes through records that are already objects (dev-mode parser)", () => {
    expect(unwrapDetails([detailObj])[0].car_url).toBe(detailObj.car_url);
  });

  it("skips malformed JSON instead of throwing the whole run away", () => {
    const out = unwrapDetails([{ vehicle: "{not json" }, { vehicle: JSON.stringify(detailObj) }]);
    expect(out).toHaveLength(1);
  });
});

describe("classifyAvailability", () => {
  it("treats 'Available to order' as available", () => {
    expect(classifyAvailability("Available to order since May 2023")).toBe(true);
  });

  it("treats 'Discontinued' as unavailable", () => {
    expect(classifyAvailability("Discontinued since Jan 2025")).toBe(false);
  });

  it("returns unknown for anything else, including null", () => {
    expect(classifyAvailability("Expected Q3 2026")).toBe("unknown");
    expect(classifyAvailability(null)).toBe("unknown");
  });
});

describe("mergeListAndDetails", () => {
  const listRow = {
    evdb_id: 1903,
    make: "Abarth",
    model: "500e Hatchback",
    year: { from: 2023, to: null },
    range: { value: 225, unit: "km" },
    availability: "Available to order since May 2023",
    car_url: "https://ev-database.org/car/1903",
  };

  it("joins on car_url, keeping LIST identity and adding DETAILS blocks", () => {
    const { merged } = mergeListAndDetails([listRow], [detailObj]);
    expect(merged).toHaveLength(1);
    expect(merged[0].evdb_id).toBe(1903);
    expect(merged[0].make).toBe("Abarth");
    expect(merged[0].battery_details).toEqual(detailObj.battery_details);
  });

  it("computes `available` from the LIST availability string", () => {
    expect(mergeListAndDetails([listRow], [detailObj]).merged[0].available).toBe(true);
  });

  it("derives make_slug", () => {
    expect(mergeListAndDetails([listRow], [detailObj]).merged[0].make_slug).toBe("abarth");
  });

  it("excludes LIST rows with no DETAILS match and reports them", () => {
    const orphan = { ...listRow, evdb_id: 999, car_url: "https://ev-database.org/car/999" };
    const { merged, unmatched } = mergeListAndDetails([listRow, orphan], [detailObj]);
    // Without battery_details the slug would lose its kWh component and drift.
    expect(merged).toHaveLength(1);
    expect(unmatched).toEqual(["https://ev-database.org/car/999"]);
  });

  it("never lets DETAILS overwrite LIST identity fields", () => {
    const hostile = { ...detailObj, make: "WRONG", model: "WRONG", evdb_id: 1 };
    const { merged } = mergeListAndDetails([listRow], [hostile]);
    expect(merged[0].make).toBe("Abarth");
    expect(merged[0].evdb_id).toBe(1903);
  });
});
