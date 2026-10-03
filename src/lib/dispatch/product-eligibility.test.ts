import { afterEach, describe, expect, it, vi } from "vitest";
import type { PartnerArea } from "./types";

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async () => ({ data: [] })),
}));

afterEach(() => vi.clearAllMocks());

function area(id: string, pricing_policy: unknown): PartnerArea {
  return {
    id: `area-${id}`,
    mode: "shared",
    partner: { id, slug: id, pricing_policy },
  } as unknown as PartnerArea;
}

const withBattery = area("p-battery", {
  id: "pol-1",
  settings: { prices: { ecp: { owner_solar: 50 }, battery: { owner_pv_small: 80 } } },
});
const chargerOnly = area("p-charger", {
  id: "pol-2",
  settings: { prices: { ecp: { owner_solar: 50 } } },
});
const noPolicy = area("p-none", null);
const unexpanded = area("p-string", "pol-1");
const nullBattery = area("p-null", { id: "pol-3", settings: { prices: { battery: null } } });

describe("filterAreasForProduct", () => {
  it("returns every area unchanged for the charger, partners without a policy included", async () => {
    const { filterAreasForProduct } = await import("./queries");
    const areas = [withBattery, chargerOnly, noPolicy, unexpanded];
    expect(filterAreasForProduct(areas, "ecp")).toBe(areas);
  });

  it("keeps only partners whose policy prices the battery", async () => {
    const { filterAreasForProduct } = await import("./queries");
    const out = filterAreasForProduct([withBattery, chargerOnly, noPolicy, nullBattery], "battery");
    expect(out.map((a) => a.partner.id)).toEqual(["p-battery"]);
  });

  it("excludes a policy that was not expanded (string id)", async () => {
    const { filterAreasForProduct } = await import("./queries");
    expect(filterAreasForProduct([unexpanded], "battery")).toEqual([]);
  });
});

describe("countDispatchesThisMonth", () => {
  it("counts the quota per product", async () => {
    const { directusFetch } = await import("@/lib/directus");
    const { countDispatchesThisMonth } = await import("./queries");

    await countDispatchesThisMonth(["p1"], "production", "battery");

    const url = decodeURIComponent(String(vi.mocked(directusFetch).mock.calls[0][0]));
    expect(url).toContain("filter[product][_eq]=battery");
  });
});
