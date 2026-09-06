import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/invoice", () => ({
  previewInvoice: vi.fn(),
}));

const TOKEN = "test-static-token-0123456789abcdef";

beforeAll(() => {
  process.env.DIRECTUS_STATIC_TOKEN = TOKEN;
});

afterEach(() => {
  vi.clearAllMocks();
});

const post = async (body: unknown, headers?: Record<string, string>) => {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost/api/admin/invoices/preview", {
      method: "POST",
      headers: { "content-type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
    }),
  );
};

describe("POST /api/admin/invoices/preview", () => {
  it("returns 401 when x-admin-token header is missing", async () => {
    const { previewInvoice } = await import("@/lib/billing/invoice");
    const res = await post({ partner: "eme-energies", month: "2026-07" });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
    expect(vi.mocked(previewInvoice)).not.toHaveBeenCalled();
  });

  it("returns 401 when x-admin-token is wrong", async () => {
    const { previewInvoice } = await import("@/lib/billing/invoice");
    const res = await post(
      { partner: "eme-energies", month: "2026-07" },
      { "x-admin-token": "wrong" },
    );
    expect(res.status).toBe(401);
    expect(vi.mocked(previewInvoice)).not.toHaveBeenCalled();
  });

  it("returns 401 when DIRECTUS_STATIC_TOKEN is unset, even with a header", async () => {
    const { previewInvoice } = await import("@/lib/billing/invoice");
    const original = process.env.DIRECTUS_STATIC_TOKEN;
    delete process.env.DIRECTUS_STATIC_TOKEN;
    try {
      const res = await post(
        { partner: "eme-energies", month: "2026-07" },
        { "x-admin-token": "anything" },
      );
      expect(res.status).toBe(401);
      expect(vi.mocked(previewInvoice)).not.toHaveBeenCalled();
    } finally {
      process.env.DIRECTUS_STATIC_TOKEN = original;
    }
  });

  it("returns 400 when partner or month is missing", async () => {
    const res = await post({ month: "2026-07" }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("partner_and_month_required");
  });

  it("calls previewInvoice and returns its result with a correct token", async () => {
    const { previewInvoice } = await import("@/lib/billing/invoice");
    vi.mocked(previewInvoice).mockResolvedValueOnce({
      period: { month: "2026-07", start: "2026-07-01", end: "2026-07-31", issuableFrom: "2026-08-16" },
      issuable: true,
      number: "EME-202607",
      issuanceRank: 1,
      existingLiveInvoice: null,
      scope: { lines: [], gifts: [], subtotalChf: 0, unsettled: [], excluded: [] },
      subtotalChf: 0,
      totalChf: 0,
    });

    const res = await post(
      { partner: "eme-energies", month: "2026-07" },
      { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.number).toBe("EME-202607");
    expect(vi.mocked(previewInvoice)).toHaveBeenCalledWith("eme-energies", "2026-07");
  });

  it("maps partner_not_found to 404", async () => {
    const { previewInvoice } = await import("@/lib/billing/invoice");
    vi.mocked(previewInvoice).mockRejectedValueOnce(new Error("partner_not_found"));

    const res = await post(
      { partner: "nope", month: "2026-07" },
      { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("partner_not_found");
  });

  it("maps invalid_month to 400", async () => {
    const { previewInvoice } = await import("@/lib/billing/invoice");
    vi.mocked(previewInvoice).mockRejectedValueOnce(new Error("invalid_month"));

    const res = await post(
      { partner: "eme-energies", month: "bad" },
      { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_month");
  });

  it("maps an unrecognized library error to 500 internal_error, not the raw message", async () => {
    const { previewInvoice } = await import("@/lib/billing/invoice");
    vi.mocked(previewInvoice).mockRejectedValueOnce(
      new Error("Directus 403: forbidden on collection partners, field uid"),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post(
      { partner: "eme-energies", month: "2026-07" },
      { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("internal_error");
    expect(json.error).not.toContain("partners");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
