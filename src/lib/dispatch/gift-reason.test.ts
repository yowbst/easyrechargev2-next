import { describe, expect, it } from "vitest";
import { resolveDispatchTargets } from "./resolver";
import type { PartnerArea } from "./types";

/**
 * A gift used to be a single boolean, so three quite different situations were
 * indistinguishable after the fact: a partner past their quota (legitimate), a
 * partner with no price row for the category (a misconfiguration), and a price
 * deliberately set to zero. Only the first is good news.
 */

function area(overrides: Partial<PartnerArea["partner"]> = {}, quota = 10): PartnerArea {
  return {
    id: "area-1",
    mode: "exclusive",
    priority_override: null,
    quota_override: null,
    partner: {
      id: "p1", slug: "eme-energies", name: "E-ME Énergies",
      notification_email: "x@example.test", language: "fr",
      monthly_quota: quota, priority: 100, billable_rate: 1,
      status: "active", business_name: null, legal_form: null, uid: null,
      street_name: null, street_number: null, postal_code: null, locality: null,
      canton: null, dashboard_token: "tok", disqualification_overrides: null,
      lead_scoring_weights: null, pricing_policy: null,
      ...overrides,
    },
  } as unknown as PartnerArea;
}

function resolve(opts: { quotaUsed?: number; price?: number | undefined }) {
  const prices = new Map<string, Map<string, number>>();
  if (opts.price !== undefined) {
    prices.set("p1", new Map([["owner_solar", opts.price]]));
  }
  return resolveDispatchTargets({
    areas: [area()],
    quotaUsed: new Map([["p1", opts.quotaUsed ?? 0]]),
    maxSharedTargets: 1,
    leadCategory: "owner_solar",
    partnerPrices: prices,
    dedupPartnerIds: new Set(),
  });
}

describe("gift reasons", () => {
  it("is not a gift when the partner is within quota and has a price", () => {
    const t = resolve({ quotaUsed: 0, price: 40 }).targets[0];
    expect(t.gift).toBe(false);
    expect(t.giftReason).toBeNull();
    expect(t.priceChf).toBe(40);
  });

  it("records quota_exceeded when the partner is over their monthly quota", () => {
    const t = resolve({ quotaUsed: 99, price: 40 }).targets[0];
    expect(t.gift).toBe(true);
    expect(t.giftReason).toBe("quota_exceeded");
    expect(t.priceChf).toBeNull();
  });

  it("records no_price_row when the partner has no price for the category", () => {
    const t = resolve({ quotaUsed: 0, price: undefined }).targets[0];
    expect(t.gift).toBe(true);
    // This is a misconfiguration, not generosity — it must be distinguishable.
    expect(t.giftReason).toBe("no_price_row");
  });

  it("records price_zero when the grid deliberately prices the category at 0", () => {
    const t = resolve({ quotaUsed: 0, price: 0 }).targets[0];
    expect(t.gift).toBe(true);
    expect(t.giftReason).toBe("price_zero");
  });

  it("prefers quota_exceeded over a missing price when both apply", () => {
    // Over quota is the legitimate reason; reporting the config gap instead
    // would send someone hunting a pricing bug that is not there.
    const t = resolve({ quotaUsed: 99, price: undefined }).targets[0];
    expect(t.giftReason).toBe("quota_exceeded");
  });
});
