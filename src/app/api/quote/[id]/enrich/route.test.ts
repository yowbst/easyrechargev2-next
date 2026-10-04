import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(async () => {}) }));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => { void fn(); },
}));
vi.mock("@/lib/directus-storage", () => ({ storage: { getSubmissionById: h.get, updateSubmissionData: h.update } }));
vi.mock("@/lib/posthog-server", () => ({
  getPostHogServer: () => ({ capture: vi.fn(), flush: vi.fn() }),
  serverLog: vi.fn(),
}));

import { PATCH } from "./route";
import { enrichToken } from "@/lib/quote-enrich";

const call = (body: unknown, id = "sub1") =>
  PATCH(new Request(`http://x/api/quote/${id}/enrich`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

const submission = (over: Record<string, unknown> = {}) => ({
  submission: { id: "sub1", form_type: "quote", product: "ecp", date_created: new Date().toISOString(), data: { housingStatus: "owner", electricalBoardType: null }, ...over },
  session: { ph_distinct_id: "d1" },
});

describe("PATCH /api/quote/:id/enrich", () => {
  beforeEach(() => { process.env.QUOTE_ENRICH_SECRET = "test-secret"; });
  afterEach(() => { vi.clearAllMocks(); delete process.env.QUOTE_ENRICH_SECRET; });

  it("rejects a missing or foreign token", async () => {
    expect((await call({ answers: { electricalBoardType: "old" } })).status).toBe(403);
    expect((await call({ token: enrichToken("other"), answers: {} })).status).toBe(403);
    expect(h.get).not.toHaveBeenCalled();
  });

  it("writes the valid answers onto the whole data object", async () => {
    h.get.mockResolvedValue(submission());
    const res = await call({ token: enrichToken("sub1"), answers: { electricalBoardType: "old", email: "x@y.z" } });
    expect(await res.json()).toEqual({ success: true, answered: 1 });
    expect(h.update).toHaveBeenCalledWith("sub1", { housingStatus: "owner", electricalBoardType: "old" });
  });

  it("refuses after the two-hour window and for other products", async () => {
    h.get.mockResolvedValue(submission({ date_created: new Date(Date.now() - 3 * 3600_000).toISOString() }));
    expect((await call({ token: enrichToken("sub1"), answers: { ecpProvided: "include" } })).status).toBe(409);
    h.get.mockResolvedValue(submission({ product: "battery" }));
    expect((await call({ token: enrichToken("sub1"), answers: { ecpProvided: "include" } })).status).toBe(404);
    expect(h.update).not.toHaveBeenCalled();
  });
});
