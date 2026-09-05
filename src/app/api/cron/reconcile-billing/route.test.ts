import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Mock the reconcileBilling function
vi.mock("@/lib/dispatch/admin", () => ({
  reconcileBilling: vi.fn(),
}));

beforeAll(() => {
  process.env.CRON_SECRET = "test-cron-secret-0123456789abcdef";
});

afterEach(() => {
  vi.clearAllMocks();
});

const get = async (headers?: Record<string, string>) => {
  const { GET } = await import("./route");
  return GET(
    new Request("http://localhost:3000/api/cron/reconcile-billing", {
      method: "GET",
      headers: headers || {},
    }),
  );
};

describe("GET /api/cron/reconcile-billing", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await get();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("unauthorized");
  });

  it("returns 401 when Authorization header has wrong bearer token", async () => {
    const res = await get({
      authorization: "Bearer wrong-secret",
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("unauthorized");
  });

  it("returns 401 when Authorization header format is incorrect", async () => {
    const res = await get({
      authorization: `test-cron-secret-0123456789abcdef`,
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("unauthorized");
  });

  it("returns 200 and reconcile result with correct bearer token", async () => {
    const { reconcileBilling } = await import("@/lib/dispatch/admin");
    vi.mocked(reconcileBilling).mockResolvedValueOnce({
      locked: 5,
      ids: ["id1", "id2", "id3", "id4", "id5"],
      dryRun: false,
    });

    const res = await get({
      authorization: "Bearer test-cron-secret-0123456789abcdef",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.locked).toBe(5);
    expect(json.ids).toEqual(["id1", "id2", "id3", "id4", "id5"]);
    expect(json.dryRun).toBe(false);
    expect(vi.mocked(reconcileBilling)).toHaveBeenCalledWith({ dryRun: false });
  });

  it("returns 401 when CRON_SECRET is unset", async () => {
    const originalSecret = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    try {
      const res = await get({
        authorization: "Bearer anything",
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("unauthorized");
    } finally {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it("calls reconcileBilling with dryRun: false", async () => {
    const { reconcileBilling } = await import("@/lib/dispatch/admin");
    vi.mocked(reconcileBilling).mockResolvedValueOnce({
      locked: 0,
      ids: [],
      dryRun: false,
    });

    await get({
      authorization: "Bearer test-cron-secret-0123456789abcdef",
    });

    expect(vi.mocked(reconcileBilling)).toHaveBeenCalledWith({ dryRun: false });
  });
});
