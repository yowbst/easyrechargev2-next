import { beforeEach, describe, expect, it, vi } from "vitest";

// Every directusFetch call this test suite makes, recorded as { path, method }.
// Populated by the mock implementation below; asserted on in each test.
const calls: { path: string; method: string }[] = [];

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ path, method });

    if (path.startsWith("/items/site_settings")) {
      // Plausible site_settings shape so fetchDispatchConfig resolves the
      // real (non-fallback) code path rather than exercising its catch block.
      return {
        data: {
          global_config: {
            dispatch: {
              max_shared_targets: 1,
              test_email_patterns: [],
              billing: { currency: "CHF", acceptance_window_days: 30, dedup_window_days: 30 },
            },
          },
        },
      };
    }

    if (path.startsWith("/items/partner_dispatches") && method === "GET") {
      // One candidate row, dispatched well outside the 30-day acceptance
      // window, with no partner override — expired under isAcceptanceExpired.
      return {
        data: [
          {
            id: "dispatch-1",
            dispatched_at: "2020-01-01T00:00:00.000Z",
            disqualified: false,
            gift: false,
            billable: false,
            partner: null,
          },
        ],
      };
    }

    if (method === "PATCH") {
      return { data: { id: path.split("/").pop() } };
    }

    return { data: [] };
  }),
}));

import { reconcileBilling } from "./admin";

beforeEach(() => {
  calls.length = 0;
});

describe("reconcileBilling dryRun guard", () => {
  it("dryRun: true computes candidates but issues zero PATCH requests", async () => {
    const result = await reconcileBilling({ dryRun: true, now: new Date("2020-06-01T00:00:00.000Z") });

    expect(result.dryRun).toBe(true);
    expect(result.locked).toBeGreaterThanOrEqual(1);
    expect(result.ids).toContain("dispatch-1");

    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches.length).toBe(0);
  });

  it("dryRun: false issues exactly one PATCH per candidate", async () => {
    const result = await reconcileBilling({ dryRun: false, now: new Date("2020-06-01T00:00:00.000Z") });

    expect(result.dryRun).toBe(false);
    expect(result.locked).toBe(1);
    expect(result.ids).toEqual(["dispatch-1"]);

    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches.length).toBe(result.locked);
    expect(patches.length).toBe(1);
    expect(patches[0].path).toBe("/items/partner_dispatches/dispatch-1");
  });
});
