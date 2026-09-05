import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/invoice", () => ({
  issueInvoice: vi.fn(),
}));
vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(),
}));

const TOKEN = "test-static-token-0123456789abcdef";

beforeAll(() => {
  process.env.DIRECTUS_STATIC_TOKEN = TOKEN;
});

afterEach(() => {
  vi.clearAllMocks();
});

const get = async (headers?: Record<string, string>, qs = "") => {
  const { GET } = await import("./route");
  return GET(new Request(`http://localhost/api/admin/invoices${qs}`, { headers: headers || {} }));
};

const post = async (body: unknown, headers?: Record<string, string>) => {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost/api/admin/invoices", {
      method: "POST",
      headers: { "content-type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
    }),
  );
};

describe("GET /api/admin/invoices", () => {
  it("returns 401 when x-admin-token header is missing", async () => {
    const res = await get();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });

  it("returns 401 when x-admin-token is wrong", async () => {
    const res = await get({ "x-admin-token": "wrong" });
    expect(res.status).toBe(401);
  });

  it("returns 401 when DIRECTUS_STATIC_TOKEN is unset, even with a header", async () => {
    const original = process.env.DIRECTUS_STATIC_TOKEN;
    delete process.env.DIRECTUS_STATIC_TOKEN;
    try {
      const res = await get({ "x-admin-token": "anything" });
      expect(res.status).toBe(401);
    } finally {
      process.env.DIRECTUS_STATIC_TOKEN = original;
    }
  });

  it("returns rows from directusFetch with a correct token", async () => {
    const { directusFetch } = await import("@/lib/directus");
    vi.mocked(directusFetch).mockResolvedValueOnce({ data: [{ id: "inv1" }] });

    const res = await get({ "x-admin-token": TOKEN }, "?month=2026-07");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toEqual([{ id: "inv1" }]);
    expect(vi.mocked(directusFetch)).toHaveBeenCalledWith(
      expect.stringContaining("filter%5Bperiod_month%5D%5B_eq%5D=2026-07"),
      expect.any(Object),
    );
  });
});

describe("POST /api/admin/invoices", () => {
  it("returns 401 when x-admin-token header is missing", async () => {
    const res = await post({ partner: "eme-energies", month: "2026-07" });
    expect(res.status).toBe(401);
  });

  it("returns 401 when x-admin-token is wrong", async () => {
    const res = await post(
      { partner: "eme-energies", month: "2026-07" },
      { "x-admin-token": "wrong" },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when partner or month is missing", async () => {
    const res = await post({ partner: "eme-energies" }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("partner_and_month_required");
  });

  it("calls issueInvoice and returns its result with a correct token", async () => {
    const { issueInvoice } = await import("@/lib/billing/invoice");
    vi.mocked(issueInvoice).mockResolvedValueOnce({ id: "inv1", number: "EME-202607", total_chf: 680 });

    const res = await post(
      { partner: "eme-energies", month: "2026-07" },
      { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.number).toBe("EME-202607");
    expect(vi.mocked(issueInvoice)).toHaveBeenCalledWith("eme-energies", "2026-07");
  });

  it("maps period_not_issuable to 409", async () => {
    const { issueInvoice } = await import("@/lib/billing/invoice");
    vi.mocked(issueInvoice).mockRejectedValueOnce(new Error("period_not_issuable"));

    const res = await post(
      { partner: "eme-energies", month: "2026-07" },
      { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("period_not_issuable");
  });

  it("maps invalid_month to 400", async () => {
    const { issueInvoice } = await import("@/lib/billing/invoice");
    vi.mocked(issueInvoice).mockRejectedValueOnce(new Error("invalid_month"));

    const res = await post(
      { partner: "eme-energies", month: "not-a-month" },
      { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_month");
  });

  it("maps an unrecognized library error to 500", async () => {
    const { issueInvoice } = await import("@/lib/billing/invoice");
    vi.mocked(issueInvoice).mockRejectedValueOnce(new Error("something_unexpected"));

    const res = await post(
      { partner: "eme-energies", month: "2026-07" },
      { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("something_unexpected");
  });
});
