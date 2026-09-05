// src/lib/vehicles/ingest/clean.golden.test.ts
import { describe, it, expect } from "vitest";
import { generateSlug } from "./clean";
import type { ScrapedVehicle } from "./types";
import fixture from "./__fixtures__/live-slugs.json";

describe("slug generation golden file", () => {
  it("covers the full live catalogue", () => {
    expect(fixture.length).toBe(562);
  });

  it("reproduces every live slug exactly", () => {
    const mismatches = fixture
      .map((row) => ({
        evdbId: row.evdb_id,
        expected: row.liveSlug,
        actual: generateSlug(row as unknown as ScrapedVehicle),
      }))
      .filter((r) => r.expected !== r.actual);

    expect(mismatches).toEqual([]);
  });
});
