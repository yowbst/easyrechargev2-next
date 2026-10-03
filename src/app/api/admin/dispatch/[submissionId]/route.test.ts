import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ manualDispatch: vi.fn() }));
vi.mock("@/lib/dispatch/manual-dispatch", () => ({ manualDispatch: h.manualDispatch }));

afterEach(() => vi.clearAllMocks());

describe("POST /api/admin/dispatch/[submissionId]", () => {
  it("answers 422 for a lead that is never dispatched", async () => {
    process.env.DIRECTUS_STATIC_TOKEN = "tok";
    h.manualDispatch.mockResolvedValueOnce({ ok: false, error: "not_dispatchable" });
    const { POST } = await import("./route");

    const res = await POST(
      new Request("http://localhost/api/admin/dispatch/sub1", { method: "POST", headers: { "x-admin-token": "tok" } }),
      { params: Promise.resolve({ submissionId: "sub1" }) },
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "not_dispatchable" });
  });
});
