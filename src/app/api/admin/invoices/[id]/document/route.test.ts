import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/google-docs", () => ({
  generateInvoiceDocument: vi.fn(),
}));

const TOKEN = "test-static-token-0123456789abcdef";

beforeAll(() => {
  process.env.DIRECTUS_STATIC_TOKEN = TOKEN;
});

afterEach(() => {
  vi.clearAllMocks();
});

const post = async (id: string, headers?: Record<string, string>) => {
  const { POST } = await import("./route");
  return POST(
    new Request(`http://localhost/api/admin/invoices/${id}/document`, {
      method: "POST",
      headers: headers || {},
    }),
    { params: Promise.resolve({ id }) },
  );
};

describe("POST /api/admin/invoices/[id]/document", () => {
  it("returns 401 when x-admin-token header is missing", async () => {
    const res = await post("inv1");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });

  it("returns 401 when x-admin-token is wrong", async () => {
    const res = await post("inv1", { "x-admin-token": "wrong" });
    expect(res.status).toBe(401);
  });

  it("returns 401 when DIRECTUS_STATIC_TOKEN is unset, even with a header", async () => {
    const original = process.env.DIRECTUS_STATIC_TOKEN;
    delete process.env.DIRECTUS_STATIC_TOKEN;
    try {
      const res = await post("inv1", { "x-admin-token": "anything" });
      expect(res.status).toBe(401);
    } finally {
      process.env.DIRECTUS_STATIC_TOKEN = original;
    }
  });

  it("calls generateInvoiceDocument and returns its result with a correct token", async () => {
    const { generateInvoiceDocument } = await import("@/lib/billing/google-docs");
    vi.mocked(generateInvoiceDocument).mockResolvedValueOnce({
      doc_url: "https://docs.google.com/document/d/abc/edit",
      doc_file_id: "abc",
      version: 1,
    });

    const res = await post("inv1", { "x-admin-token": TOKEN });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.doc_file_id).toBe("abc");
    expect(vi.mocked(generateInvoiceDocument)).toHaveBeenCalledWith("inv1");
  });

  it("maps invoice_not_found to 404", async () => {
    const { generateInvoiceDocument } = await import("@/lib/billing/google-docs");
    vi.mocked(generateInvoiceDocument).mockRejectedValueOnce(new Error("invoice_not_found"));

    const res = await post("missing", { "x-admin-token": TOKEN });
    expect(res.status).toBe(404);
  });

  it("maps an unrecognized library error to 500", async () => {
    const { generateInvoiceDocument } = await import("@/lib/billing/google-docs");
    vi.mocked(generateInvoiceDocument).mockRejectedValueOnce(new Error("google_api_down"));

    const res = await post("inv1", { "x-admin-token": TOKEN });
    expect(res.status).toBe(500);
  });
});
