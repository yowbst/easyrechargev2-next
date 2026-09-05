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

describe("getMonthlyBilling filter semantics", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.resetModules();
  });

  it("uses _eq:true for billable, _neq:true for gift and disqualified", async () => {
    const { getMonthlyBilling } = await import("./admin");
    await getMonthlyBilling("2020-01");

    const get = calls.find((c) => c.path.startsWith("/items/partner_dispatches") && c.method === "GET");
    expect(get).toBeDefined();
    const query = decodeURIComponent(get!.path);
    expect(query).toContain("filter[billable][_eq]=true");
    expect(query).toContain("filter[gift][_neq]=true");
    expect(query).toContain("filter[disqualified][_neq]=true");
    expect(query).not.toContain("filter[billable][_neq]");
  });
});

describe("reconcileBilling with null booleans (production shape)", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.resetModules();
  });

  it("queries with _neq:true so null rows are not excluded", async () => {
    const { reconcileBilling } = await import("./admin");
    await reconcileBilling({ dryRun: true });

    const get = calls.find((c) => c.path.startsWith("/items/partner_dispatches") && c.method === "GET");
    expect(get).toBeDefined();
    const query = decodeURIComponent(get!.path);
    expect(query).toContain("filter[disqualified][_neq]=true");
    expect(query).toContain("filter[gift][_neq]=true");
    expect(query).not.toContain("[_eq]=false");
  });

  it("locks a null-disqualified row whose window has elapsed", async () => {
    const { reconcileBilling } = await import("./admin");
    const result = await reconcileBilling({ dryRun: true });
    expect(result.ids).toEqual(["dispatch-null"]);
    expect(result.locked).toBe(1);
  });
});
