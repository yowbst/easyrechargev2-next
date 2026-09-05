import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CmsVehicle } from "./types";

const directusFetch = vi.fn();
vi.mock("@/lib/directus", () => ({
  directusFetch: (...args: unknown[]) => directusFetch(...args),
}));

// vitest hoists vi.mock() above this import, same pattern as directus-storage.test.ts.
import { indexByEvdbId, fetchBrandRowBySlug, fetchBrandIdBySlug } from "./queries";

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

  it("keeps last-wins on a duplicate evdb_id (unchanged behaviour)", () => {
    const dup = [
      ...rows,
      { id: "c", evdb_id: "3303", slug: "togg-t10x-dup", status: "published" } as CmsVehicle,
    ];
    const idx = indexByEvdbId(dup);
    expect(idx.size).toBe(2);
    expect(idx.get("3303")?.id).toBe("c");
  });

  it("warns on a duplicate evdb_id, naming the id and both item ids — otherwise a shadowed row vanishes with no trace at all", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dup = [
      ...rows,
      { id: "c", evdb_id: "3303", slug: "togg-t10x-dup", status: "published" } as CmsVehicle,
    ];
    indexByEvdbId(dup);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/3303/));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("a"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("c"));
    warn.mockRestore();
  });

  it("does not warn when there are no duplicates", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    indexByEvdbId(rows);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("fetchBrandRowBySlug / fetchBrandIdBySlug", () => {
  beforeEach(() => {
    directusFetch.mockReset();
  });
  afterEach(() => {
    directusFetch.mockReset();
  });

  it("fetchBrandRowBySlug returns the row's id, name, and active_models", async () => {
    directusFetch.mockResolvedValue({
      data: [{ id: "brand-1", name: "Abarth", active_models: 3 }],
    });
    const row = await fetchBrandRowBySlug("abarth");
    expect(row).toEqual({ id: "brand-1", name: "Abarth", active_models: 3 });
    expect(directusFetch.mock.calls[0][0]).toContain("filter[slug][_eq]=abarth");
    expect(directusFetch.mock.calls[0][0]).toContain("fields=id,name,active_models");
  });

  it("fetchBrandRowBySlug returns null when no row matches", async () => {
    directusFetch.mockResolvedValue({ data: [] });
    expect(await fetchBrandRowBySlug("nonexistent")).toBeNull();
  });

  it("fetchBrandRowBySlug defaults a null active_models to 0", async () => {
    directusFetch.mockResolvedValue({
      data: [{ id: "brand-1", name: "Abarth", active_models: null }],
    });
    expect((await fetchBrandRowBySlug("abarth"))?.active_models).toBe(0);
  });

  it("fetchBrandIdBySlug is a thin wrapper: same query, just the id", async () => {
    directusFetch.mockResolvedValue({
      data: [{ id: "brand-1", name: "Abarth", active_models: 3 }],
    });
    expect(await fetchBrandIdBySlug("abarth")).toBe("brand-1");
    expect(directusFetch).toHaveBeenCalledTimes(1);
  });

  it("fetchBrandIdBySlug returns null when no row matches", async () => {
    directusFetch.mockResolvedValue({ data: [] });
    expect(await fetchBrandIdBySlug("nonexistent")).toBeNull();
  });
});
