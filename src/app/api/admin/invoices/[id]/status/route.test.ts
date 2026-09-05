import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/invoice", () => ({
  setInvoiceStatus: vi.fn(),
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
    new Request(`http://localhost/api/admin/invoices/${id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
};

describe("POST /api/admin/invoices/[id]/status", () => {
  it("returns 401 when x-admin-token header is missing", async () => {
    const { setInvoiceStatus } = await import("@/lib/billing/invoice");
    const res = await post("inv1", { status: "sent" });
    expect(res.status).toBe(401);
    expect(vi.mocked(setInvoiceStatus)).not.toHaveBeenCalled();
  });

  it("returns 401 when x-admin-token is wrong", async () => {
    const { setInvoiceStatus } = await import("@/lib/billing/invoice");
    const res = await post("inv1", { status: "sent" }, { "x-admin-token": "wrong" });
    expect(res.status).toBe(401);
    expect(vi.mocked(setInvoiceStatus)).not.toHaveBeenCalled();
  });

  it("returns 401 when DIRECTUS_STATIC_TOKEN is unset, even with a header", async () => {
    const { setInvoiceStatus } = await import("@/lib/billing/invoice");
    const original = process.env.DIRECTUS_STATIC_TOKEN;
    delete process.env.DIRECTUS_STATIC_TOKEN;
    try {
      const res = await post("inv1", { status: "sent" }, { "x-admin-token": "anything" });
      expect(res.status).toBe(401);
      expect(vi.mocked(setInvoiceStatus)).not.toHaveBeenCalled();
    } finally {
      process.env.DIRECTUS_STATIC_TOKEN = original;
    }
  });

  it("returns 400 for a status not in INVOICE_STATUSES", async () => {
    const res = await post("inv1", { status: "bogus" }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_status");
  });

  it("returns 400 when status is missing", async () => {
    const res = await post("inv1", {}, { "x-admin-token": TOKEN });
    expect(res.status).toBe(400);
  });

  it("calls setInvoiceStatus and returns ok with a correct token", async () => {
    const { setInvoiceStatus } = await import("@/lib/billing/invoice");
    vi.mocked(setInvoiceStatus).mockResolvedValueOnce(undefined);

    const res = await post("inv1", { status: "sent", note: "emailed" }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, status: "sent" });
    expect(vi.mocked(setInvoiceStatus)).toHaveBeenCalledWith("inv1", "sent", "emailed");
  });

  it("maps invalid_transition to 409", async () => {
    const { setInvoiceStatus } = await import("@/lib/billing/invoice");
    vi.mocked(setInvoiceStatus).mockRejectedValueOnce(new Error("invalid_transition"));

    const res = await post("inv1", { status: "paid" }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invalid_transition");
  });

  it("maps invoice_not_found to 404", async () => {
    const { setInvoiceStatus } = await import("@/lib/billing/invoice");
    vi.mocked(setInvoiceStatus).mockRejectedValueOnce(new Error("invoice_not_found"));

    const res = await post("missing", { status: "sent" }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(404);
  });

  it("maps an unrecognized library error to 500 internal_error, not the raw message", async () => {
    const { setInvoiceStatus } = await import("@/lib/billing/invoice");
    vi.mocked(setInvoiceStatus).mockRejectedValueOnce(
      new Error("Directus 500: internal error updating partner_invoices"),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post("inv1", { status: "sent" }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("internal_error");
    expect(json.error).not.toContain("partner_invoices");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
