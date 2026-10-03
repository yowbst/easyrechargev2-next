import { describe, expect, it } from "vitest";
import { effectiveQuota, partnerProductConfig } from "./partner-products";
import type { Partner, PartnerArea } from "./types";

const partner = (extra: Partial<Partner> = {}) =>
  ({ id: "p1", slug: "p1", monthly_quota: 30, ...extra }) as Partner;

const area = (p: Partner, quota_override: number | null = null) =>
  ({ id: "a1", mode: "shared", partner: p, quota_override }) as unknown as PartnerArea;

describe("partnerProductConfig", () => {
  it("serves a partner without product rows as charger-only, with its legacy quota", () => {
    expect(partnerProductConfig(partner(), "ecp")).toEqual({ monthlyQuota: 30 });
    expect(partnerProductConfig(partner({ products: [] }), "ecp")).toEqual({ monthlyQuota: 30 });
    expect(partnerProductConfig(partner(), "battery")).toBeNull();
  });

  it("reads the product row once the partner has any", () => {
    const p = partner({
      products: [
        { product: "ecp", status: "active", monthly_quota: 40 },
        { product: "battery", status: "active", monthly_quota: 10 },
      ],
    });
    expect(partnerProductConfig(p, "ecp")).toEqual({ monthlyQuota: 40 });
    expect(partnerProductConfig(p, "battery")).toEqual({ monthlyQuota: 10 });
  });

  it("excludes a paused product and a product without a row", () => {
    const p = partner({ products: [{ product: "battery", status: "paused", monthly_quota: 10 }] });
    expect(partnerProductConfig(p, "battery")).toBeNull();
    // Once rows exist, the charger needs its own row too.
    expect(partnerProductConfig(p, "ecp")).toBeNull();
  });

  it("treats an empty quota as unlimited", () => {
    const p = partner({ products: [{ product: "battery", status: "active", monthly_quota: null }] });
    expect(partnerProductConfig(p, "battery")).toEqual({ monthlyQuota: 0 });
  });
});

describe("effectiveQuota", () => {
  it("keeps today's charger rule: canton override, else the partner quota", () => {
    expect(effectiveQuota(area(partner()), "ecp")).toBe(30);
    expect(effectiveQuota(area(partner(), 5), "ecp")).toBe(5);
  });

  it("never applies the canton override to the battery", () => {
    const p = partner({ products: [{ product: "battery", status: "active", monthly_quota: 10 }] });
    expect(effectiveQuota(area(p, 5), "battery")).toBe(10);
  });

  it("returns unlimited for a product the partner does not receive", () => {
    expect(effectiveQuota(area(partner()), "battery")).toBe(0);
  });
});
