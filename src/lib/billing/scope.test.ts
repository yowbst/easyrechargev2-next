import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string) => {
    if (!path.startsWith("/items/partner_dispatches")) return { data: [] };
    // Fixtures for collectBillableDispatches tests
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
        // Covering test for gift: true exclusion
        {
          id: "d4", billable: true, gift: true, disqualified: false, invoice: null,
          dispatched_at: "2026-07-05T09:00:00.000Z", canton: "VD",
          price_chf: "50.00000", lead_category: "owner_solar", product: "ecp",
          submission: { user: { last_name: "Gift" }, data: { postalCode: "1200", locality: "Geneva" } },
        },
        // Covering test for disqualified: true exclusion
        {
          id: "d5", billable: true, gift: false, disqualified: true, invoice: null,
          dispatched_at: "2026-07-06T09:00:00.000Z", canton: "VD",
          price_chf: "60.00000", lead_category: "owner_solar", product: "ecp",
          submission: { user: { last_name: "Disq" }, data: { postalCode: "1201", locality: "Carouge" } },
        },
        // Covering test for null gift/disqualified with billable: true in lines
        {
          id: "d6", billable: true, gift: null, disqualified: null, invoice: null,
          dispatched_at: "2026-07-07T09:00:00.000Z", canton: "VD",
          price_chf: "35.00000", lead_category: "owner_solar", product: "ecp",
          submission: { user: { last_name: "Null" }, data: { postalCode: "1202", locality: "Meinier" } },
        },
        // Covering test for billable: null in unsettled
        {
          id: "d7", billable: null, gift: null, disqualified: null, invoice: null,
          dispatched_at: "2026-07-08T09:00:00.000Z", canton: "VD",
          price_chf: "30.00000", lead_category: "owner_solar", product: "ecp",
          submission: { user: { last_name: "Pending" }, data: { postalCode: "1203", locality: "Onex" } },
        },
        // Covering test for malformed price_chf (empty string)
        {
          id: "d8", billable: true, gift: false, disqualified: false, invoice: null,
          dispatched_at: "2026-07-09T09:00:00.000Z", canton: "VD",
          price_chf: "", lead_category: "owner_solar", product: "ecp",
          submission: { user: { last_name: "BadPrice1" }, data: { postalCode: "1204", locality: "Plan-les-Ouates" } },
        },
        // Covering test for malformed price_chf (non-numeric string)
        {
          id: "d9", billable: true, gift: false, disqualified: false, invoice: null,
          dispatched_at: "2026-07-10T09:00:00.000Z", canton: "VD",
          price_chf: "abc", lead_category: "owner_solar", product: "ecp",
          submission: { user: { last_name: "BadPrice2" }, data: { postalCode: "1205", locality: "Thonex" } },
        },
        // Covering test for malformed price_chf (undefined)
        {
          id: "d10", billable: true, gift: false, disqualified: false, invoice: null,
          dispatched_at: "2026-07-11T09:00:00.000Z", canton: "VD",
          price_chf: undefined, lead_category: "owner_solar", product: "ecp",
          submission: { user: { last_name: "BadPrice3" }, data: { postalCode: "1206", locality: "Vernier" } },
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

    // d1 should be in lines (billable: true, no invoice, not gift/disqualified)
    const d1 = r.lines.find((l) => l.dispatchId === "d1");
    expect(d1).toBeDefined();
    expect(d1?.label).toBe("P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04");
    expect(d1?.unitPriceChf).toBe(40);

    // d2 should be in unsettled (billable: false)
    expect(r.unsettled).toContain("d2");
    expect(r.lines.map((l) => l.dispatchId)).not.toContain("d2");

    // d3 should be excluded (invoice: "inv-old")
    const d3 = r.excluded.find((e) => e.id === "d3");
    expect(d3).toEqual({ id: "d3", reason: "already_invoiced" });
    expect(r.lines.map((l) => l.dispatchId)).not.toContain("d3");
  });

  it("excludes gift: true rows", async () => {
    const { collectBillableDispatches } = await import("./scope");
    const r = await collectBillableDispatches("partner-1", "2026-07");

    const d4 = r.excluded.find((e) => e.id === "d4");
    expect(d4).toEqual({ id: "d4", reason: "gift" });
    expect(r.lines.map((l) => l.dispatchId)).not.toContain("d4");
    expect(r.unsettled).not.toContain("d4");
  });

  it("excludes disqualified: true rows", async () => {
    const { collectBillableDispatches } = await import("./scope");
    const r = await collectBillableDispatches("partner-1", "2026-07");

    const d5 = r.excluded.find((e) => e.id === "d5");
    expect(d5).toEqual({ id: "d5", reason: "disqualified" });
    expect(r.lines.map((l) => l.dispatchId)).not.toContain("d5");
    expect(r.unsettled).not.toContain("d5");
  });

  it("includes null gift/disqualified with billable: true in lines", async () => {
    const { collectBillableDispatches } = await import("./scope");
    const r = await collectBillableDispatches("partner-1", "2026-07");

    const d6 = r.lines.find((l) => l.dispatchId === "d6");
    expect(d6).toBeDefined();
    expect(d6?.unitPriceChf).toBe(35);
    expect(r.excluded.map((e) => e.id)).not.toContain("d6");
    expect(r.unsettled).not.toContain("d6");
  });

  it("puts billable: null rows in unsettled", async () => {
    const { collectBillableDispatches } = await import("./scope");
    const r = await collectBillableDispatches("partner-1", "2026-07");

    expect(r.unsettled).toContain("d7");
    expect(r.lines.map((l) => l.dispatchId)).not.toContain("d7");
    expect(r.excluded.map((e) => e.id)).not.toContain("d7");
  });

  it("guards against malformed price_chf (empty string, non-numeric, undefined)", async () => {
    const { collectBillableDispatches } = await import("./scope");
    const r = await collectBillableDispatches("partner-1", "2026-07");

    // All three bad price rows should be in lines (billable: true)
    const d8 = r.lines.find((l) => l.dispatchId === "d8");
    const d9 = r.lines.find((l) => l.dispatchId === "d9");
    const d10 = r.lines.find((l) => l.dispatchId === "d10");

    expect(d8).toBeDefined();
    expect(d8?.unitPriceChf).toBe(0);
    expect(d9).toBeDefined();
    expect(d9?.unitPriceChf).toBe(0);
    expect(d10).toBeDefined();
    expect(d10?.unitPriceChf).toBe(0);

    // Subtotal should be finite, not NaN
    expect(Number.isFinite(r.subtotalChf)).toBe(true);
    // Include all valid prices: d1(40) + d6(35) + d8(0) + d9(0) + d10(0) = 75
    expect(r.subtotalChf).toBe(75);
  });
});
