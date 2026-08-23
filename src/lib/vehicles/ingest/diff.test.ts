import { describe, it, expect } from "vitest";
import { buildPlan, assertPlanSane, summarize } from "./diff";
import type { ScrapedVehicle, CmsVehicle } from "./types";

const scrapedRow = (over: Partial<ScrapedVehicle> = {}) =>
  ({
    evdb_id: 1903,
    make: "Abarth",
    make_slug: "abarth",
    model: "500e Hatchback",
    title_v2: "Abarth 500e Hatchback 42kWh 225km [2023-]",
    slug: "abarth-500e-hatchback-42kwh-225km-2023",
    year: { from: 2023, to: null },
    available: true,
    battery_details: { nominal_capacity: { value: 42.2, unit: "kWh" } },
    range: { value: 225, unit: "km" },
    ...over,
  }) as unknown as ScrapedVehicle;

const cmsRow = (over: Partial<CmsVehicle> = {}) =>
  ({
    id: "uuid-1",
    evdb_id: "1903",
    slug: "abarth-500e-hatchback-42kwh-225km-2023",
    status: "published",
    name: "Abarth 500e Hatchback 42kWh 225km [2023-]",
    model: "500e Hatchback",
    is_available: true,
    range: { value: 225, unit: "km" },
    battery_details: { nominal_capacity: { value: 42.2, unit: "kWh" } },
    ...over,
  }) as unknown as CmsVehicle;

describe("buildPlan", () => {
  it("classifies an unseen evdb_id as CREATE", () => {
    const plan = buildPlan([scrapedRow({ evdb_id: 9999 })], []);
    expect(plan.entries[0].bucket).toBe("CREATE");
    expect(plan.entries[0].payload?.status).toBe("draft");
  });

  it("classifies an identical record as UNCHANGED with no changes", () => {
    const plan = buildPlan([scrapedRow()], [cmsRow()]);
    expect(plan.entries[0].bucket).toBe("UNCHANGED");
    expect(plan.entries[0].changes).toEqual({});
  });

  it("matches numeric scrape id to string CMS id instead of duplicating", () => {
    const plan = buildPlan([scrapedRow({ evdb_id: 1903 })], [cmsRow({ evdb_id: "1903" })]);
    expect(plan.entries[0].bucket).not.toBe("CREATE");
    expect(plan.entries[0].cmsId).toBe("uuid-1");
  });

  it("reports only the changed fields on UPDATE", () => {
    const plan = buildPlan(
      [scrapedRow({ range: { value: 230, unit: "km" } } as Partial<ScrapedVehicle>)],
      [cmsRow()],
    );
    const entry = plan.entries[0];
    expect(entry.bucket).toBe("UPDATE");
    expect(entry.changes.range).toEqual({
      from: { value: 225, unit: "km" },
      to: { value: 230, unit: "km" },
    });
    expect(entry.changes.model).toBeUndefined();
  });

  it("never puts status or slug in an UPDATE change set", () => {
    const plan = buildPlan([scrapedRow({ model: "500e Hatch" })], [cmsRow()]);
    expect(plan.entries[0].changes.status).toBeUndefined();
    expect(plan.entries[0].changes.slug).toBeUndefined();
  });

  it("flags SLUG_DRIFT when a discontinued year closes the range", () => {
    const plan = buildPlan([scrapedRow({ year: { from: 2023, to: 2026 } })], [cmsRow()]);
    const drift = plan.entries.find((e) => e.bucket === "SLUG_DRIFT");
    expect(drift?.generatedSlug).toBe("abarth-500e-hatchback-42kwh-225km-2023-2026");
    expect(drift?.slug).toBe("abarth-500e-hatchback-42kwh-225km-2023");
  });

  it("classifies a CMS record absent from the scrape as GONE", () => {
    const plan = buildPlan([], [cmsRow()]);
    expect(plan.entries[0].bucket).toBe("GONE");
    expect(plan.entries[0].changes).toEqual({});
  });
});

describe("assertPlanSane", () => {
  const planWith = (scrapeCount: number, cmsCount: number, updates: number) => ({
    createdAt: "2026-08-23T00:00:00Z",
    sourceFile: "x.json",
    cmsCount,
    scrapeCount,
    completed: [],
    entries: Array.from({ length: updates }, (_, i) => ({
      bucket: "UPDATE" as const,
      evdbId: String(i),
      slug: `s-${i}`,
      cmsId: `c-${i}`,
      changes: { range: { from: 1, to: 2 } },
    })),
  });

  it("passes a normal plan", () => {
    expect(() => assertPlanSane(planWith(562, 562, 30))).not.toThrow();
  });

  it("rejects a scrape that lost most of the catalogue", () => {
    expect(() => assertPlanSane(planWith(100, 562, 0))).toThrow(/scrape returned/i);
  });

  it("rejects a plan that would rewrite most of the catalogue", () => {
    expect(() => assertPlanSane(planWith(562, 562, 400))).toThrow(/change ratio/i);
  });

  it("allows an override for a genuinely large refresh", () => {
    expect(() =>
      assertPlanSane(planWith(562, 562, 400), { maxChangeRatio: 1 }),
    ).not.toThrow();
  });
});

describe("summarize", () => {
  it("counts each bucket", () => {
    const plan = buildPlan([scrapedRow(), scrapedRow({ evdb_id: 9999 })], [cmsRow()]);
    const s = summarize(plan);
    expect(s.UNCHANGED).toBe(1);
    expect(s.CREATE).toBe(1);
  });
});
