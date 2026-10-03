import { describe, expect, it } from "vitest";
import { deriveLeadCategory, isDispatchable, PV_LARGE_THRESHOLD_KWC } from "./categorize";
import { LEAD_CATEGORIES } from "./types";

describe("deriveLeadCategory — ecp (unchanged)", () => {
  it("keeps the six charger categories", () => {
    expect(deriveLeadCategory("ecp", { housingStatus: "owner", solarEquipment: "exists" })).toBe("owner_solar");
    expect(deriveLeadCategory("ecp", { housingStatus: "owner", solarEquipment: "none" })).toBe("owner_no_solar");
    expect(deriveLeadCategory("ecp", { housingStatus: "co-owner", solarEquipment: "in-progress" })).toBe("co_owner_solar");
    expect(deriveLeadCategory("ecp", { housingStatus: "co-owner", solarEquipment: "" })).toBe("co_owner_no_solar");
    expect(deriveLeadCategory("ecp", { housingStatus: "tenant", solarEquipment: "exists" })).toBe("tenant_solar");
    expect(deriveLeadCategory("ecp", {})).toBe("tenant_no_solar");
  });
});

describe("deriveLeadCategory — battery", () => {
  const owner = (extra: Record<string, unknown>) => ({ housingStatus: "owner", solarEquipment: "exists", ...extra });

  it("puts the threshold itself in the large category", () => {
    expect(PV_LARGE_THRESHOLD_KWC).toBe(10);
    expect(deriveLeadCategory("battery", owner({ pvPower: 10 }))).toBe("owner_pv_large");
    expect(deriveLeadCategory("battery", owner({ pvPower: 9.9 }))).toBe("owner_pv_small");
  });

  it("splits co-owners the same way", () => {
    expect(deriveLeadCategory("battery", { housingStatus: "co-owner", solarEquipment: "exists", pvPower: 25 })).toBe("co_owner_pv_large");
    expect(deriveLeadCategory("battery", { housingStatus: "co-owner", solarEquipment: "exists", pvPower: 4 })).toBe("co_owner_pv_small");
  });

  it("counts an unknown size as small, never charging the partner for a size we do not have", () => {
    expect(deriveLeadCategory("battery", owner({ pvPower: "na" }))).toBe("owner_pv_small");
    expect(deriveLeadCategory("battery", owner({}))).toBe("owner_pv_small");
    expect(deriveLeadCategory("battery", owner({ pvPower: null }))).toBe("owner_pv_small");
    expect(deriveLeadCategory("battery", owner({ pvPower: "abc" }))).toBe("owner_pv_small");
  });

  it("accepts a numeric string, in case a client sends one", () => {
    expect(deriveLeadCategory("battery", owner({ pvPower: "12.5" }))).toBe("owner_pv_large");
  });

  it("treats an installation being built as an installation", () => {
    expect(deriveLeadCategory("battery", owner({ solarEquipment: "in-progress", pvPower: 15 }))).toBe("owner_pv_large");
  });

  it("follows the last solar answer, whatever PV size is still in the data", () => {
    // Review Focus 1: the visitor filled the PV step, then switched to "none".
    expect(deriveLeadCategory("battery", owner({ solarEquipment: "none", pvPower: 25 }))).toBe("no_pv");
    expect(deriveLeadCategory("battery", owner({ solarEquipment: "", pvPower: 25 }))).toBe("no_pv");
  });

  it("files tenants as no_pv defensively (the funnel exits them before submission)", () => {
    expect(deriveLeadCategory("battery", { housingStatus: "tenant", solarEquipment: "exists", pvPower: 25 })).toBe("no_pv");
  });
});

describe("isDispatchable", () => {
  it("excludes only no_pv", () => {
    expect(isDispatchable("no_pv")).toBe(false);
    for (const c of LEAD_CATEGORIES.filter((c) => c !== "no_pv")) expect(isDispatchable(c)).toBe(true);
  });

  it("lists every battery category in the runtime array as well as the type", () => {
    for (const c of ["owner_pv_small", "owner_pv_large", "co_owner_pv_small", "co_owner_pv_large", "no_pv"]) {
      expect(LEAD_CATEGORIES).toContain(c);
    }
  });
});
