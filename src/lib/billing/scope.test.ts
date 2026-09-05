import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string) => {
    if (!path.startsWith("/items/partner_dispatches")) return { data: [] };
    return {
      data: [
        {
          id: "d1", billable: true, gift: false, disqualified: false, invoice: null,
          dispatched_at: "2026-07-04T09:00:00.000Z", canton: "VD",
          price_chf: "40.00000", lead_category: "owner_solar", product: "ecp",
          submission: {
            user: { last_name: "Papeil" },
            data: { postalCode: "1052", locality: "Le Mont-sur-Lausanne" },
          },
        },
        {
          id: "d2", billable: false, gift: false, disqualified: false, invoice: null,
          dispatched_at: "2026-07-30T09:00:00.000Z", canton: "GE",
          price_chf: "40.00000", lead_category: "tenant_no_solar", product: "ecp",
          submission: { user: { last_name: "Matias" }, data: { postalCode: "1228", locality: "Plan-les-Ouates" } },
        },
        {
          id: "d3", billable: true, gift: false, disqualified: false, invoice: "inv-old",
          dispatched_at: "2026-07-10T09:00:00.000Z", canton: "VD",
          price_chf: "40.00000", lead_category: "owner_solar", product: "ecp",
          submission: { user: { last_name: "Deja" }, data: { postalCode: "1000", locality: "Lausanne" } },
        },
      ],
    };
  }),
}));

describe("buildLeadLabel", () => {
  it("matches the June annex convention", async () => {
    const { buildLeadLabel } = await import("./scope");
    expect(buildLeadLabel("Papeil", "1052", "Le Mont-sur-Lausanne", "2026-07-04T09:00:00.000Z"))
      .toBe("P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04");
  });

  it("degrades gracefully on missing pieces", async () => {
    const { buildLeadLabel } = await import("./scope");
    expect(buildLeadLabel(null, null, null, "2026-07-04T09:00:00.000Z"))
      .toBe("P / — / — / 2026-07-04");
  });
});

describe("collectBillableDispatches", () => {
  it("keeps billable rows, flags unsettled ones, excludes already-invoiced", async () => {
    const { collectBillableDispatches } = await import("./scope");
    const r = await collectBillableDispatches("partner-1", "2026-07");

    expect(r.lines.map((l) => l.dispatchId)).toEqual(["d1"]);
    expect(r.unsettled).toEqual(["d2"]);
    expect(r.excluded).toEqual([{ id: "d3", reason: "already_invoiced" }]);
    expect(r.subtotalChf).toBe(40);
    expect(r.lines[0].label).toBe("P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04");
  });
});
