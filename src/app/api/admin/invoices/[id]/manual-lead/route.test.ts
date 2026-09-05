import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/invoice", () => ({
  addManualLeadLine: vi.fn(),
}));

const TOKEN = "test-static-token-0123456789abcdef";

beforeAll(() => {
  process.env.DIRECTUS_STATIC_TOKEN = TOKEN;
});

afterEach(() => {
  vi.clearAllMocks();
});

const post = async (id: string, body: unknown, headers?: Record<string, string>) => {
  const { POST } = await import("./route");
  return POST(
    new Request(`http://localhost/api/admin/invoices/${id}/manual-lead`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
};

const VALID = {
  label: "P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04",
  unit_price_chf: 40,
  dispatched_at: "2026-07-04",
  canton: "VD",
  postal_code: "1052",
  locality: "Le Mont-sur-Lausanne",
  last_name: "Papeil",
  lead_category: "owner_solar",
  product: "ecp",
};

describe("POST /api/admin/invoices/[id]/manual-lead", () => {
  it("returns 401 when x-admin-token header is missing", async () => {
    const { addManualLeadLine } = await import("@/lib/billing/invoice");
    const res = await post("inv1", VALID);
    expect(res.status).toBe(401);
    expect(vi.mocked(addManualLeadLine)).not.toHaveBeenCalled();
  });

  it("returns 401 when x-admin-token is wrong", async () => {
    const { addManualLeadLine } = await import("@/lib/billing/invoice");
    const res = await post("inv1", VALID, { "x-admin-token": "wrong" });
    expect(res.status).toBe(401);
    expect(vi.mocked(addManualLeadLine)).not.toHaveBeenCalled();
  });

  it("returns 401 when DIRECTUS_STATIC_TOKEN is unset, even with a header", async () => {
    const { addManualLeadLine } = await import("@/lib/billing/invoice");
    const original = process.env.DIRECTUS_STATIC_TOKEN;
    delete process.env.DIRECTUS_STATIC_TOKEN;
    try {
      const res = await post("inv1", VALID, { "x-admin-token": "anything" });
      expect(res.status).toBe(401);
      expect(vi.mocked(addManualLeadLine)).not.toHaveBeenCalled();
    } finally {
      process.env.DIRECTUS_STATIC_TOKEN = original;
    }
  });

  it("returns 400 when the label is missing", async () => {
    const res = await post("inv1", { unit_price_chf: 40 }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("label_and_unit_price_required");
  });

  it("returns 400 when unit_price_chf is not a finite number", async () => {
    const res = await post(
      "inv1", { label: "P / X / 1000 Lausanne / 2026-07-04", unit_price_chf: "40" },
      { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(400);
  });

  it("calls addManualLeadLine with the mapped meta and returns the recomputed totals", async () => {
    const { addManualLeadLine } = await import("@/lib/billing/invoice");
    vi.mocked(addManualLeadLine).mockResolvedValueOnce({
      subtotal_chf: 680, adjustment_chf: 0, total_chf: 680,
    });

    const res = await post("inv1", VALID, { "x-admin-token": TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true, subtotal_chf: 680, adjustment_chf: 0, total_chf: 680,
    });
    expect(vi.mocked(addManualLeadLine)).toHaveBeenCalledWith(
      "inv1", VALID.label, 40,
      {
        description: null, dispatchedAt: "2026-07-04", canton: "VD",
        postalCode: "1052", locality: "Le Mont-sur-Lausanne", lastName: "Papeil",
        leadCategory: "owner_solar", product: "ecp",
      },
    );
  });

  it("maps invoice_closed to 409", async () => {
    const { addManualLeadLine } = await import("@/lib/billing/invoice");
    vi.mocked(addManualLeadLine).mockRejectedValueOnce(new Error("invoice_closed"));

    const res = await post("inv1", VALID, { "x-admin-token": TOKEN });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invoice_closed");
  });

  it("maps invoice_not_found to 404", async () => {
    const { addManualLeadLine } = await import("@/lib/billing/invoice");
    vi.mocked(addManualLeadLine).mockRejectedValueOnce(new Error("invoice_not_found"));

    const res = await post("inv1", VALID, { "x-admin-token": TOKEN });
    expect(res.status).toBe(404);
  });

  it("maps an unrecognized library error to 500 internal_error, not the raw message", async () => {
    const { addManualLeadLine } = await import("@/lib/billing/invoice");
    vi.mocked(addManualLeadLine).mockRejectedValueOnce(
      new Error("Directus 403: forbidden on collection partner_invoice_lines"),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post("inv1", VALID, { "x-admin-token": TOKEN });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("internal_error");
    expect(json.error).not.toContain("partner_invoice_lines");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
