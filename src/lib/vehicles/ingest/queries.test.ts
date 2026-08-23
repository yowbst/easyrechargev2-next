import { describe, it, expect } from "vitest";
import { indexByEvdbId } from "./queries";
import type { CmsVehicle } from "./types";

const rows = [
  { id: "a", evdb_id: "3303", slug: "togg-t10x", status: "published" },
  { id: "b", evdb_id: "3206", slug: "bmw-i4", status: "published" },
] as CmsVehicle[];

describe("indexByEvdbId", () => {
  it("indexes by evdb_id", () => {
    expect(indexByEvdbId(rows).get("3303")?.id).toBe("a");
  });

  it("matches a numeric scrape id against the string stored in Directus", () => {
    // The whole pipeline turns on this: 3303 !== "3303" would create 562 duplicates
    expect(indexByEvdbId(rows).get(String(3303))?.id).toBe("a");
  });

  it("skips rows with no evdb_id rather than keying on null", () => {
    const withNull = [...rows, { id: "c", evdb_id: null, slug: "x", status: "draft" } as CmsVehicle];
    const idx = indexByEvdbId(withNull);
    expect(idx.size).toBe(2);
    expect(idx.has("null")).toBe(false);
  });
});
