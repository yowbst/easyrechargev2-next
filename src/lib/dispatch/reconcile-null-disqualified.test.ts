import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; method: string }[] = [];

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ path, method });

    if (path.startsWith("/items/site_settings")) {
      return {
        data: {
          global_config: {
            dispatch: {
              billing: { currency: "CHF", acceptance_window_days: 15, dedup_window_days: 30 },
            },
          },
        },
      };
    }
    if (path.startsWith("/items/partner_dispatches") && method === "GET") {
      return {
        data: [
          {
            id: "dispatch-null",
            dispatched_at: "2020-01-01T00:00:00.000Z",
            disqualified: null,
            gift: null,
            billable: false,
            partner: null,
          },
        ],
      };
    }
    if (method === "PATCH") return { data: {} };
    return { data: [] };
  }),
}));

describe("reconcileBilling with null booleans (production shape)", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.resetModules();
  });

  it("locks a null-disqualified row whose window has elapsed", async () => {
    const { reconcileBilling } = await import("./admin");
    const result = await reconcileBilling({ dryRun: true });
    expect(result.ids).toEqual(["dispatch-null"]);
    expect(result.locked).toBe(1);
  });
});
