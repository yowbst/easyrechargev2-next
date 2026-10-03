import { afterEach, describe, expect, it, vi } from "vitest";
import type { PartnerArea } from "./types";

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  fetchAreas: vi.fn(),
  count: vi.fn(async () => new Map<string, number>()),
  record: vi.fn(async () => "row1"),
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => { void fn(); },
}));
vi.mock("@/lib/directus-storage", () => ({ getEnvironment: () => "production" }));
vi.mock("@/lib/posthog-server", () => ({
  getPostHogServer: () => ({ capture: h.capture, flush: vi.fn() }),
  serverLog: vi.fn(),
}));
vi.mock("./queries", async (orig) => ({
  ...(await orig<typeof import("./queries")>()),
  fetchDispatchConfig: vi.fn(async () => ({
    max_shared_targets: 2,
    test_email_patterns: [],
    billing: { currency: "CHF", acceptance_window_days: 15, dedup_window_days: 30 },
  })),
  fetchPartnerAreasForCanton: h.fetchAreas,
  countDispatchesThisMonth: h.count,
  findRecentDispatchesByEmail: vi.fn(async () => new Set<string>()),
  recordDispatch: h.record,
}));

afterEach(() => vi.clearAllMocks());

function area(id: string, pricing_policy: unknown, products?: unknown[]): PartnerArea {
  return {
    id: `area-${id}`,
    mode: "shared",
    priority_override: null,
    quota_override: null,
    canton: { id: "c1", code: "VD", is_active: true },
    partner: {
      id, slug: id, name: id, status: "active", notification_email: `${id}@x.ch`,
      monthly_quota: 10, priority: 1, language: "fr", billable_rate: 1,
      environment: "production", pricing_policy, products,
    },
  } as unknown as PartnerArea;
}

const chargerOnly = area("p-charger", { id: "pol", settings: { prices: { ecp: { owner_solar: 50 } } } });
const noPolicy = area("p-none", null);

const run = async (product: string, leadCategory: string) => {
  const { runDispatch } = await import("./index");
  return runDispatch({
    submissionId: "sub1", rawCanton: "VD", email: "a@b.ch", locale: "fr",
    leadCategory: leadCategory as never, product, modeOverride: "live",
  });
};

describe("runDispatch — product eligibility", () => {
  it("never sends a battery lead to a partner without an active battery product", async () => {
    h.fetchAreas.mockResolvedValueOnce([chargerOnly, noPolicy]);
    const res = await run("battery", "owner_pv_small");

    expect(res.targets).toEqual([]);
    expect(res.summary.reasons).toEqual(["no_partner_for_product"]);
    expect(h.record).not.toHaveBeenCalled();
    expect(h.count).not.toHaveBeenCalled();
    expect(h.capture).toHaveBeenCalledWith(expect.objectContaining({
      event: "dispatch_resolved",
      properties: expect.objectContaining({ product: "battery", reasons: ["no_partner_for_product"] }),
    }));
  });

  it("counts battery quotas on battery rows only", async () => {
    const battery = area(
      "p-battery",
      { id: "pol-b", settings: { prices: { battery: { owner_pv_small: 80 } } } },
      [{ product: "battery", status: "active", monthly_quota: 10 }],
    );
    h.fetchAreas.mockResolvedValueOnce([battery, chargerOnly]);
    const res = await run("battery", "owner_pv_small");

    expect(h.count).toHaveBeenCalledWith(["p-battery"], "production", "battery");
    expect(res.targets.map((t) => t.partnerSlug)).toEqual(["p-battery"]);
  });

  it("still sends charger leads to legacy partners without product rows nor policy (as gifts)", async () => {
    h.fetchAreas.mockResolvedValueOnce([noPolicy]);
    const res = await run("ecp", "owner_solar");

    expect(h.count).toHaveBeenCalledWith(["p-none"], "production", "ecp");
    expect(res.targets.map((t) => [t.partnerSlug, t.gift])).toEqual([["p-none", true]]);
  });
});
