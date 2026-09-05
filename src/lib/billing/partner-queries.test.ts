import { describe, expect, it, vi } from "vitest";

const directusFetch = vi.fn();

vi.mock("@/lib/directus", () => ({
  directusFetch: (...args: unknown[]) => directusFetch(...args),
}));

describe("fetchPartnerInvoices", () => {
  it("scopes the query to the partner and filters cancelled invoices out", async () => {
    directusFetch.mockResolvedValueOnce({
      data: [
        {
          id: "inv-1", number: "ER-2607-001", version: 1, status: "sent",
          period_month: "2026-07", total_chf: "160.00",
          issued_at: "2026-08-16T00:00:00.000Z", due_at: "2026-09-06T00:00:00.000Z",
          paid_at: null,
          lines: [
            {
              label: "P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04",
              dispatched_at: "2026-07-04T09:00:00.000Z",
              lead_category: "owner_solar", amount_chf: "40.00", kind: "lead",
            },
          ],
        },
      ],
    });

    const { fetchPartnerInvoices } = await import("./partner-queries");
    const result = await fetchPartnerInvoices("partner-1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("inv-1");

    // Privacy boundary: the Directus query itself must scope to the partner
    // and exclude cancelled invoices — this is not a cosmetic filter, so we
    // assert on the actual request the function issued rather than trusting
    // the mocked response shape.
    expect(directusFetch).toHaveBeenCalledTimes(1);
    const [path, init] = directusFetch.mock.calls[0];
    expect(path).toMatch(/^\/items\/partner_invoices\?/);

    const query = new URLSearchParams(path.split("?")[1]);
    expect(query.get("filter[partner][_eq]")).toBe("partner-1");
    expect(query.get("filter[status][_neq]")).toBe("cancelled");
    expect(init).toMatchObject({ next: { revalidate: 0 } });
  });

  it("returns an empty array when Directus responds with no data", async () => {
    directusFetch.mockResolvedValueOnce({});

    const { fetchPartnerInvoices } = await import("./partner-queries");
    const result = await fetchPartnerInvoices("partner-2");

    expect(result).toEqual([]);
  });
});
