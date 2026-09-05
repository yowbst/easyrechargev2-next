import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/invoice", () => ({
  addInvoiceNote: vi.fn(),
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
    new Request(`http://localhost/api/admin/invoices/${id}/note`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
};

describe("POST /api/admin/invoices/[id]/note", () => {
  it("returns 401 when x-admin-token header is missing", async () => {
    const { addInvoiceNote } = await import("@/lib/billing/invoice");
    const res = await post("inv1", { note: "hi" });
    expect(res.status).toBe(401);
    expect(vi.mocked(addInvoiceNote)).not.toHaveBeenCalled();
  });

  it("returns 401 when x-admin-token is wrong", async () => {
    const { addInvoiceNote } = await import("@/lib/billing/invoice");
    const res = await post("inv1", { note: "hi" }, { "x-admin-token": "wrong" });
    expect(res.status).toBe(401);
    expect(vi.mocked(addInvoiceNote)).not.toHaveBeenCalled();
  });

  it("returns 401 when DIRECTUS_STATIC_TOKEN is unset, even with a header", async () => {
    const { addInvoiceNote } = await import("@/lib/billing/invoice");
    const original = process.env.DIRECTUS_STATIC_TOKEN;
    delete process.env.DIRECTUS_STATIC_TOKEN;
    try {
      const res = await post("inv1", { note: "hi" }, { "x-admin-token": "anything" });
      expect(res.status).toBe(401);
      expect(vi.mocked(addInvoiceNote)).not.toHaveBeenCalled();
    } finally {
      process.env.DIRECTUS_STATIC_TOKEN = original;
    }
  });

  it("returns 400 when note is missing", async () => {
    const res = await post("inv1", {}, { "x-admin-token": TOKEN });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("note_required");
  });

  it("defaults actor to 'yoan' when actor is not partner/system", async () => {
    const { addInvoiceNote } = await import("@/lib/billing/invoice");
    vi.mocked(addInvoiceNote).mockResolvedValueOnce(undefined);

    const res = await post("inv1", { note: "hi", actor: "bogus" }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(200);
    expect(vi.mocked(addInvoiceNote)).toHaveBeenCalledWith("inv1", "yoan", "hi");
  });

  it("passes through actor 'partner' with a correct token", async () => {
    const { addInvoiceNote } = await import("@/lib/billing/invoice");
    vi.mocked(addInvoiceNote).mockResolvedValueOnce(undefined);

    const res = await post("inv1", { note: "hi", actor: "partner" }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(200);
    expect(vi.mocked(addInvoiceNote)).toHaveBeenCalledWith("inv1", "partner", "hi");
  });

  it("maps invoice_not_found to 404", async () => {
    const { addInvoiceNote } = await import("@/lib/billing/invoice");
    vi.mocked(addInvoiceNote).mockRejectedValueOnce(new Error("invoice_not_found"));

    const res = await post("missing", { note: "hi" }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(404);
  });

  it("maps an unrecognized library error to 500 internal_error, not the raw message", async () => {
    const { addInvoiceNote } = await import("@/lib/billing/invoice");
    vi.mocked(addInvoiceNote).mockRejectedValueOnce(
      new Error("Directus 403: forbidden on collection partner_invoices"),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post("inv1", { note: "hi" }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("internal_error");
    expect(json.error).not.toContain("partner_invoices");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
