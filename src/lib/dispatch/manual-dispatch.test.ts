import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSubmissionById: vi.fn(),
  runDispatch: vi.fn(),
  fireWebhook: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/directus-storage", () => ({
  getEnvironment: () => "production",
  storage: { getSubmissionById: h.getSubmissionById },
}));
vi.mock("@/lib/directus", () => ({ directusFetch: vi.fn(async () => ({ data: [] })) }));
vi.mock("@/lib/dispatch", () => ({ runDispatch: h.runDispatch }));
vi.mock("@/lib/dispatch/webhook", () => ({
  getQuoteWebhookUrl: vi.fn(async () => "https://hook.example"),
  parsePhone: vi.fn(() => null),
  buildQuoteWebhookPayload: vi.fn((x: unknown) => x),
  fireQuoteWebhook: h.fireWebhook,
}));
vi.mock("@/lib/posthog-server", () => ({ serverLog: vi.fn() }));

const DISPATCHED = {
  mode: "live", canton: "VD", isTest: false, billableRate: 1,
  summary: { resolved: 1, dispatched: 1, skipped: 0, skippedDedup: 0, reasons: [] },
  dedup: { skippedPartnerSlugs: [], windowDays: 30 },
  targets: [{ partnerSlug: "p1" }],
};

const record = (product: string, data: Record<string, unknown>) => ({
  submission: { id: "sub1", product, data: { canton: "VD", ...data } },
  user: { id: "u1", email: "a@b.ch", language: "fr" },
  session: null,
});

afterEach(() => vi.clearAllMocks());

describe("manualDispatch", () => {
  it("refuses a battery lead without PV and never resolves partners", async () => {
    h.getSubmissionById.mockResolvedValueOnce(
      record("battery", { housingStatus: "owner", solarEquipment: "none" }),
    );
    const { manualDispatch } = await import("./manual-dispatch");

    expect(await manualDispatch("sub1")).toEqual({ ok: false, error: "not_dispatchable" });
    expect(h.runDispatch).not.toHaveBeenCalled();
    expect(h.fireWebhook).not.toHaveBeenCalled();
  });

  it("dispatches it anyway with force", async () => {
    h.getSubmissionById.mockResolvedValueOnce(
      record("battery", { housingStatus: "owner", solarEquipment: "none" }),
    );
    h.runDispatch.mockResolvedValueOnce(DISPATCHED);
    const { manualDispatch } = await import("./manual-dispatch");

    const res = await manualDispatch("sub1", { force: true });
    expect(res.ok).toBe(true);
    expect(h.runDispatch).toHaveBeenCalledWith(expect.objectContaining({ leadCategory: "no_pv" }));
  });

  it("dispatches a charger lead as before", async () => {
    h.getSubmissionById.mockResolvedValueOnce(
      record("ecp", { housingStatus: "tenant", solarEquipment: "none" }),
    );
    h.runDispatch.mockResolvedValueOnce(DISPATCHED);
    const { manualDispatch } = await import("./manual-dispatch");

    const res = await manualDispatch("sub1");
    expect(res.ok).toBe(true);
    expect(h.runDispatch).toHaveBeenCalledWith(expect.objectContaining({ leadCategory: "tenant_no_solar", product: "ecp" }));
  });
});
