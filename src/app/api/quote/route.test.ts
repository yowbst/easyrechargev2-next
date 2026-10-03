import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  runDispatch: vi.fn(),
  buildPayload: vi.fn((x: unknown) => x),
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => { void fn(); },
}));
vi.mock("@/lib/directus-storage", () => ({
  getEnvironment: () => "development",
  storage: {
    createOrGetFormSession: vi.fn(async () => ({ id: "s1", session_token: "tok" })),
    createOrUpdateFormUser: vi.fn(async () => ({ id: "u1" })),
    createFormSubmission: vi.fn(async () => ({ id: "sub1" })),
  },
}));
vi.mock("@/lib/posthog-server", () => ({
  getPostHogServer: () => ({ capture: h.capture, identify: vi.fn(), flush: vi.fn(), captureException: vi.fn() }),
  serverLog: vi.fn(),
}));
vi.mock("@/lib/dispatch", async (orig) => ({
  ...(await orig<typeof import("@/lib/dispatch")>()),
  runDispatch: h.runDispatch,
}));
vi.mock("@/lib/dispatch/webhook", () => ({
  getQuoteWebhookUrl: vi.fn(async () => "https://hook.example"),
  parsePhone: vi.fn(() => null),
  buildQuoteWebhookPayload: h.buildPayload,
  fireQuoteWebhook: vi.fn(async () => {}),
}));

const DISPATCHED = {
  mode: "live", canton: "VD", isTest: false, billableRate: 1,
  summary: { resolved: 1, dispatched: 1, skipped: 0, skippedDedup: 0, reasons: [] },
  dedup: { skippedPartnerSlugs: [], windowDays: 30 },
  targets: [],
};

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import("./route");
  return POST(new Request("http://localhost/api/quote", {
    method: "POST",
    headers: { "content-type": "application/json", referer: "http://localhost/fr/devis-batterie-solaire" },
    body: JSON.stringify({ firstName: "Ana", lastName: "Test", email: "ana@example.ch", lang: "fr", canton: "VD", ...body }),
  }));
};

afterEach(() => vi.clearAllMocks());

describe("POST /api/quote — battery", () => {
  it("does not dispatch a visitor without PV, and says so", async () => {
    const res = await post({ product: "battery", housingStatus: "owner", solarEquipment: "none" });
    const json = await res.json();

    expect(json).toEqual({ success: true, submissionId: "sub1", dispatchable: false });
    expect(h.runDispatch).not.toHaveBeenCalled();

    const payload = h.buildPayload.mock.calls[0][0] as { submission: { leadCategory: string }; dispatch: { targets: unknown[]; summary: { reasons: string[] } } };
    expect(payload.submission.leadCategory).toBe("no_pv");
    expect(payload.dispatch.targets).toEqual([]);
    expect(payload.dispatch.summary.reasons).toEqual(["not_dispatchable"]);

    expect(h.capture).toHaveBeenCalledWith(expect.objectContaining({ event: "dispatch_not_dispatchable" }));
  });

  it("dispatches a large-PV owner with the battery category and product", async () => {
    h.runDispatch.mockResolvedValueOnce(DISPATCHED);
    const res = await post({ product: "battery", housingStatus: "owner", solarEquipment: "exists", pvPower: 15 });

    expect((await res.json()).dispatchable).toBe(true);
    expect(h.runDispatch).toHaveBeenCalledWith(expect.objectContaining({ leadCategory: "owner_pv_large", product: "battery" }));
  });
});

describe("POST /api/quote — charger unchanged", () => {
  it("dispatches with the charger category", async () => {
    h.runDispatch.mockResolvedValueOnce(DISPATCHED);
    const res = await post({ product: "ecp", housingStatus: "owner", solarEquipment: "exists" });

    expect((await res.json()).dispatchable).toBe(true);
    expect(h.runDispatch).toHaveBeenCalledWith(expect.objectContaining({ leadCategory: "owner_solar", product: "ecp" }));
  });
});
