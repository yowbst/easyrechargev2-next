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
    linkSubmission: vi.fn(async () => {}),
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
vi.mock("@/lib/site-settings", () => ({ webhookUrl: vi.fn(async () => "https://hook.example") }));
vi.mock("@/lib/dispatch/webhook", () => ({
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

const { storage } = await import("@/lib/directus-storage");
const create = vi.mocked(storage.createFormSubmission);
const link = vi.mocked(storage.linkSubmission);

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

describe("POST /api/quote — incomplete answers", () => {
  it("still stores and dispatches an incomplete request, and flags it", async () => {
    h.runDispatch.mockResolvedValueOnce(DISPATCHED);
    const res = await post({ product: "ecp", housingStatus: "owner", solarEquipment: "exists" });

    expect((await res.json()).success).toBe(true);
    expect(h.runDispatch).toHaveBeenCalled();
    expect(h.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "quote_incomplete_server",
        properties: expect.objectContaining({ product: "ecp", step: "housing", field: "housingType", submission_id: "sub1" }),
      }),
    );
  });

  it("does not flag a complete request", async () => {
    h.runDispatch.mockResolvedValueOnce(DISPATCHED);
    await post({
      product: "ecp",
      housingStatus: "owner",
      housingType: "house",
      solarEquipment: "none",
      parkingSpotLocation: "garage-adjacent",
      parkingSpotCount: "1",
      deadline: "asap",
      vehicleStatus: "own",
    });
    expect(h.capture).not.toHaveBeenCalledWith(expect.objectContaining({ event: "quote_incomplete_server" }));
  });
});

describe("POST /api/quote — battery add-on", () => {
  const charger = {
    product: "ecp",
    housingStatus: "owner",
    housingType: "house",
    solarEquipment: "exists",
    homeBattery: "none",
    parkingSpotLocation: "garage-adjacent",
    parkingSpotCount: "1",
    deadline: "asap",
    vehicleStatus: "own",
    acceptTerms: true,
  };
  type CreateArg = { product: string; data: Record<string, unknown>; origin?: string; linked_submission?: string };
  const created = () => create.mock.calls.map((c) => c[0] as CreateArg);

  it("creates a linked battery submission and dispatches both leads", async () => {
    create.mockResolvedValueOnce({ id: "ecp1" } as never).mockResolvedValueOnce({ id: "bat1" } as never);
    h.runDispatch.mockResolvedValue(DISPATCHED);

    const json = await (await post({ ...charger, batteryAddon: true, batteryAddonPvPower: 8 })).json();

    expect(json).toMatchObject({ success: true, submissionId: "ecp1", dispatchable: true, batterySubmissionId: "bat1", batteryDispatchable: true });
    expect(storage.createOrUpdateFormUser).toHaveBeenCalledTimes(1);

    const [ecp, bat] = created();
    expect(ecp.product).toBe("ecp");
    expect(ecp.data).not.toHaveProperty("batteryAddon");
    expect(ecp.data).not.toHaveProperty("batteryAddonPvPower");
    expect(ecp.origin).toBeUndefined();
    expect(bat).toMatchObject({ product: "battery", origin: "ecp-addon", linked_submission: "ecp1" });
    expect(bat.data).toMatchObject({ product: "battery", housingStatus: "owner", solarEquipment: "exists", pvPower: 8, deadline: "asap" });
    expect(bat.data).not.toHaveProperty("parkingSpotLocation");
    expect(link).toHaveBeenCalledWith("ecp1", "bat1");

    expect(h.runDispatch).toHaveBeenCalledWith(expect.objectContaining({ submissionId: "bat1", product: "battery", leadCategory: "owner_pv_small" }));
    expect(h.runDispatch).toHaveBeenCalledWith(expect.objectContaining({ submissionId: "ecp1", product: "ecp" }));

    const payloads = h.buildPayload.mock.calls.map((c) => (c[0] as { submission: { product: string; origin?: string; linkedSubmissionId?: string } }).submission);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toMatchObject({ product: "battery", origin: "ecp-addon", linkedSubmissionId: "ecp1" });

    expect(h.capture).not.toHaveBeenCalledWith(expect.objectContaining({ event: "quote_incomplete_server" }));
  });

  it("ignores the add-on of a visitor who is not eligible, and strips it", async () => {
    h.runDispatch.mockResolvedValue(DISPATCHED);
    const json = await (await post({ ...charger, housingStatus: "tenant", batteryAddon: true, batteryAddonPvPower: 8 })).json();

    expect(json.batterySubmissionId).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
    expect(created()[0].data).not.toHaveProperty("batteryAddon");
    expect(link).not.toHaveBeenCalled();
  });

  it("ignores an add-on on a battery request", async () => {
    await post({ product: "battery", housingStatus: "owner", solarEquipment: "exists", homeBattery: "none", pvPower: 15, batteryAddon: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("keeps the charger lead when the battery submission fails", async () => {
    create.mockResolvedValueOnce({ id: "ecp1" } as never).mockRejectedValueOnce(new Error("directus down"));
    h.runDispatch.mockResolvedValue(DISPATCHED);

    const res = await post({ ...charger, batteryAddon: true, batteryAddonPvPower: "na" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ success: true, submissionId: "ecp1", batterySubmissionId: null, batteryDispatchable: false });
  });
});
