import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus-storage", () => ({ getEnvironment: () => "production" }));

import { fetchActivePartnersForCanton, selectRegionPartners, type AreaRow } from "./partners";

const area = (over: Partial<AreaRow> & { id: string; name?: string; priority?: number; products?: AreaRow["partner"]["products"]; status?: string }): AreaRow => ({
  mode: over.mode ?? "exclusive",
  priority_override: over.priority_override ?? null,
  partner: {
    id: over.id,
    status: (over.status ?? "active") as AreaRow["partner"]["status"],
    name: over.name ?? over.id,
    slug: over.id,
    priority: over.priority ?? 100,
    monthly_quota: 0,
    products: over.products,
    locality: "Gland",
  },
});

describe("selectRegionPartners", () => {
  it("returns only the exclusive partner when there is one, like the resolver", () => {
    const r = selectRegionPartners([area({ id: "s1", mode: "shared" }), area({ id: "e1", mode: "exclusive" })]);
    expect(r.map((p) => p.id)).toEqual(["e1"]);
    expect(r[0]).toEqual({ id: "e1", name: "e1", slug: "e1", locality: "Gland", mode: "exclusive" });
  });

  it("picks the lowest-priority exclusive", () => {
    const r = selectRegionPartners([area({ id: "e2", priority: 50 }), area({ id: "e1", priority: 10 })]);
    expect(r.map((p) => p.id)).toEqual(["e1"]);
  });

  it("lists shared partners by priority then name, once each", () => {
    const r = selectRegionPartners([
      area({ id: "b", name: "Beta", mode: "shared", priority: 20 }),
      area({ id: "a", name: "Alpha", mode: "shared", priority: 20 }),
      area({ id: "c", name: "Gamma", mode: "shared", priority: 5 }),
      area({ id: "a", name: "Alpha", mode: "shared", priority: 20 }),
    ]);
    expect(r.map((p) => p.name)).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  it("drops a partner that does not receive charger leads", () => {
    const batteryOnly = [{ product: "battery", status: "active", monthly_quota: 0 }] as AreaRow["partner"]["products"];
    expect(selectRegionPartners([area({ id: "e1", products: batteryOnly })])).toEqual([]);
    const legacy = selectRegionPartners([area({ id: "e2" })]);
    expect(legacy).toHaveLength(1);
  });

  it("ignores paused partners and empty input", () => {
    expect(selectRegionPartners([area({ id: "e1", status: "paused" })])).toEqual([]);
    expect(selectRegionPartners([])).toEqual([]);
  });
});

describe("fetchActivePartnersForCanton", () => {
  it("asks for an explicit field list, never partner.*, and caches for an hour", async () => {
    const fetcher = vi.fn(async () => ({ data: [area({ id: "e1" })] }));
    const r = await fetchActivePartnersForCanton("VD", fetcher as never);
    expect(r.map((p) => p.id)).toEqual(["e1"]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, { next: { revalidate: number; tags: string[] } }];
    const fields = new URLSearchParams(url.split("?")[1]).get("fields")!;
    expect(fields).not.toContain("partner.*");
    expect(fields).not.toMatch(/token|email|pricing|billable/);
    expect(decodeURIComponent(url)).toContain("filter[partner][environment][_eq]=production");
    expect(init.next).toEqual({ revalidate: 3600, tags: ["partners-public"] });
  });

  it("returns nothing for a bad canton code and survives a Directus error", async () => {
    expect(await fetchActivePartnersForCanton("vaud", vi.fn() as never)).toEqual([]);
    const failing = vi.fn(async () => { throw new Error("Directus 500"); });
    expect(await fetchActivePartnersForCanton("VD", failing as never)).toEqual([]);
  });

  it("falls back to charger-only partners when product rows are not readable", async () => {
    let n = 0;
    const fetcher = vi.fn(async () => {
      if (++n === 1) throw new Error("Directus 403: forbidden");
      return { data: [area({ id: "e1" })] };
    });
    expect((await fetchActivePartnersForCanton("VD", fetcher as never)).map((p) => p.id)).toEqual(["e1"]);
  });
});
