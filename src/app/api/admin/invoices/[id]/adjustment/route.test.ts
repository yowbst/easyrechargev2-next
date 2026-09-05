import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/invoice", () => ({
  addAdjustmentLine: vi.fn(),
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
    new Request(`http://localhost/api/admin/invoices/${id}/adjustment`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
};

describe("POST /api/admin/invoices/[id]/adjustment", () => {
  it("returns 401 when x-admin-token header is missing", async () => {
    const { addAdjustmentLine } = await import("@/lib/billing/invoice");
    const res = await post("inv1", { description: "discount", amount_chf: -50 });
    expect(res.status).toBe(401);
    expect(vi.mocked(addAdjustmentLine)).not.toHaveBeenCalled();
  });

  it("returns 401 when x-admin-token is wrong", async () => {
    const { addAdjustmentLine } = await import("@/lib/billing/invoice");
    const res = await post(
      "inv1", { description: "discount", amount_chf: -50 }, { "x-admin-token": "wrong" },
    );
    expect(res.status).toBe(401);
    expect(vi.mocked(addAdjustmentLine)).not.toHaveBeenCalled();
  });

  it("returns 401 when DIRECTUS_STATIC_TOKEN is unset, even with a header", async () => {
    const { addAdjustmentLine } = await import("@/lib/billing/invoice");
    const original = process.env.DIRECTUS_STATIC_TOKEN;
    delete process.env.DIRECTUS_STATIC_TOKEN;
    try {
      const res = await post(
        "inv1", { description: "discount", amount_chf: -50 }, { "x-admin-token": "anything" },
      );
      expect(res.status).toBe(401);
      expect(vi.mocked(addAdjustmentLine)).not.toHaveBeenCalled();
    } finally {
      process.env.DIRECTUS_STATIC_TOKEN = original;
    }
  });

  it("returns 400 when description is missing", async () => {
    const res = await post("inv1", { amount_chf: -50 }, { "x-admin-token": TOKEN });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("description_and_amount_required");
  });

  it("returns 400 when amount_chf is not a number", async () => {
    const res = await post(
      "inv1", { description: "discount", amount_chf: "not-a-number" }, { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(400);
  });

  it("calls addAdjustmentLine with a negative amount (the normal discount case) and a correct token", async () => {
    const { addAdjustmentLine } = await import("@/lib/billing/invoice");
    vi.mocked(addAdjustmentLine).mockResolvedValueOnce(undefined);

    const res = await post(
      "inv1", { description: "loyalty discount", amount_chf: -25.5 }, { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(addAdjustmentLine)).toHaveBeenCalledWith("inv1", "loyalty discount", -25.5);
  });

  it("maps invoice_closed to 409", async () => {
    const { addAdjustmentLine } = await import("@/lib/billing/invoice");
    vi.mocked(addAdjustmentLine).mockRejectedValueOnce(new Error("invoice_closed"));

    const res = await post(
      "inv1", { description: "discount", amount_chf: -10 }, { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invoice_closed");
  });

  it("maps an unrecognized library error to 500 internal_error, not the raw message", async () => {
    const { addAdjustmentLine } = await import("@/lib/billing/invoice");
    vi.mocked(addAdjustmentLine).mockRejectedValueOnce(
      new Error("Directus 403: forbidden on collection partner_invoice_lines"),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post(
      "inv1", { description: "discount", amount_chf: -10 }, { "x-admin-token": TOKEN },
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("internal_error");
    expect(json.error).not.toContain("partner_invoice_lines");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
