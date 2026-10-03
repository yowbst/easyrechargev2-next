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
  const legacy = area("p-legacy", null);
  const both = { ...area("p-both", null), partner: { id: "p-both", slug: "p-both", products: [
    { product: "ecp", status: "active", monthly_quota: 30 },
    { product: "battery", status: "active", monthly_quota: 10 },
  ] } } as unknown as PartnerArea;
  const batteryOnly = { ...area("p-bat", null), partner: { id: "p-bat", slug: "p-bat", products: [
    { product: "battery", status: "active", monthly_quota: 10 },
  ] } } as unknown as PartnerArea;
  const batteryPaused = { ...area("p-paused", null), partner: { id: "p-paused", slug: "p-paused", products: [
    { product: "ecp", status: "active", monthly_quota: 30 },
    { product: "battery", status: "paused", monthly_quota: 10 },
  ] } } as unknown as PartnerArea;

  it("keeps legacy partners (no product rows) for the charger only", async () => {
    const { filterAreasForProduct } = await import("./queries");
    expect(filterAreasForProduct([legacy, withBattery, chargerOnly, noPolicy, unexpanded], "ecp")).toHaveLength(5);
    expect(filterAreasForProduct([legacy, withBattery, chargerOnly, noPolicy, unexpanded], "battery")).toEqual([]);
  });

  it("follows the active product rows", async () => {
    const { filterAreasForProduct } = await import("./queries");
    const areas = [both, batteryOnly, batteryPaused];
    expect(filterAreasForProduct(areas, "battery").map((a) => a.partner.id)).toEqual(["p-both", "p-bat"]);
    expect(filterAreasForProduct(areas, "ecp").map((a) => a.partner.id)).toEqual(["p-both", "p-paused"]);
  });

  it("does not use the pricing policy to decide eligibility", async () => {
    const { filterAreasForProduct } = await import("./queries");
    // withBattery prices the battery but has no battery product row.
    expect(filterAreasForProduct([withBattery, nullBattery], "battery")).toEqual([]);
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

describe("fetchPartnerAreasForCanton — partner_products not readable yet", () => {
  it("falls back to the legacy fields when Directus refuses the product rows", async () => {
    const { directusFetch } = await import("@/lib/directus");
    const { fetchPartnerAreasForCanton } = await import("./queries");
    vi.mocked(directusFetch)
      .mockRejectedValueOnce(new Error("Directus 403: You don't have permission to access this."))
      .mockResolvedValueOnce({ data: [withBattery] });

    const out = await fetchPartnerAreasForCanton("VD", "production");

    expect(out).toEqual([withBattery]);
    const urls = vi.mocked(directusFetch).mock.calls.map((c) => decodeURIComponent(String(c[0])));
    expect(urls[0]).toContain("partner.products.product");
    expect(urls[1]).not.toContain("partner.products");
  });

  it("does not hide other errors", async () => {
    const { directusFetch } = await import("@/lib/directus");
    const { fetchPartnerAreasForCanton } = await import("./queries");
    vi.mocked(directusFetch).mockRejectedValueOnce(new Error("Directus 500: boom"));

    await expect(fetchPartnerAreasForCanton("VD", "production")).rejects.toThrow("Directus 500");
  });
});
