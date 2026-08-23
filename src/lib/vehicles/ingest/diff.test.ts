import { describe, it, expect } from "vitest";
import { buildPlan, assertPlanSane, summarize, deepEqual, NON_TRIGGERING_FIELDS } from "./diff";
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

  it("classifies a record differing ONLY in evdb_time_fetched as UNCHANGED with empty changes", () => {
    const plan = buildPlan(
      [
        scrapedRow({
          metadata: { parsed_at: "2026-08-23T00:00:00.000Z" },
        } as Partial<ScrapedVehicle>),
      ],
      [cmsRow({ evdb_time_fetched: "2026-01-01T00:00:00" })],
    );
    expect(plan.entries[0].bucket).toBe("UNCHANGED");
    expect(plan.entries[0].changes).toEqual({});
  });

  it("classifies as UPDATE when evdb_time_fetched differs alongside a real field change, with BOTH fields carried in changes", () => {
    const plan = buildPlan(
      [
        scrapedRow({
          metadata: { parsed_at: "2026-08-23T00:00:00.000Z" },
          range: { value: 230, unit: "km" },
        } as Partial<ScrapedVehicle>),
      ],
      [cmsRow({ evdb_time_fetched: "2026-01-01T00:00:00" })],
    );
    const entry = plan.entries[0];
    expect(entry.bucket).toBe("UPDATE");
    // The real change must be present...
    expect(entry.changes.range).toEqual({
      from: { value: 225, unit: "km" },
      to: { value: 230, unit: "km" },
    });
    // ...and so must the non-triggering field, so the PATCH refreshes it —
    // this is the half that's easy to get wrong (dropping it entirely
    // instead of merely excluding it from the UPDATE-vs-UNCHANGED decision).
    expect(entry.changes.evdb_time_fetched).toEqual({
      from: "2026-01-01T00:00:00",
      to: "2026-08-23T00:00:00.000Z",
    });
  });
});

describe("NON_TRIGGERING_FIELDS", () => {
  it("contains evdb_time_fetched", () => {
    expect(NON_TRIGGERING_FIELDS.has("evdb_time_fetched")).toBe(true);
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

  it("rejects a non-finite maxChangeRatio instead of silently disabling the breaker", () => {
    // This is the safety chokepoint itself — it must not trust a caller
    // that passes through an unvalidated Number(...) (e.g. from a CLI flag
    // that failed to parse). `NaN > x` is always false, so without this
    // guard a bad ratio would silently pass every plan, however large.
    expect(() =>
      assertPlanSane(planWith(562, 562, 400), { maxChangeRatio: NaN }),
    ).toThrow(/finite number/i);
  });

  it("rejects an infinite maxChangeRatio too", () => {
    expect(() =>
      assertPlanSane(planWith(562, 562, 400), { maxChangeRatio: Infinity }),
    ).toThrow(/finite number/i);
  });

  const createPlanWith = (payloads: Array<Record<string, unknown> | undefined>) => ({
    createdAt: "2026-08-23T00:00:00Z",
    sourceFile: "x.json",
    cmsCount: 562,
    scrapeCount: 562,
    completed: [],
    entries: payloads.map((payload, i) => ({
      bucket: "CREATE" as const,
      evdbId: String(i),
      slug: `slug-${i}`,
      changes: {},
      payload,
    })),
  });

  const validCreatePayload = () => ({
    name: "Abarth 500e",
    slug: "abarth-500e",
    brand: "brand-uuid",
  });
  const missingName = () => ({ slug: "abarth-500e", brand: "brand-uuid" });
  const missingSlug = () => ({ name: "Abarth 500e", brand: "brand-uuid" });
  const missingBrand = () => ({ name: "Abarth 500e", slug: "abarth-500e" });

  it("passes a plan whose CREATE entries have name, slug, and brand", () => {
    expect(() => assertPlanSane(createPlanWith([validCreatePayload()]))).not.toThrow();
  });

  it("rejects a CREATE entry missing name (e.g. --in pointed at a raw, not cleaned, snapshot)", () => {
    expect(() => assertPlanSane(createPlanWith([missingName()]))).toThrow(/missing/i);
  });

  it("rejects a CREATE entry missing slug", () => {
    expect(() => assertPlanSane(createPlanWith([missingSlug()]))).toThrow(/missing/i);
  });

  it("rejects a CREATE entry missing brand (unresolved brand lookup)", () => {
    expect(() => assertPlanSane(createPlanWith([missingBrand()]))).toThrow(/missing/i);
  });

  it("reports the count and names examples in the error", () => {
    expect(() =>
      assertPlanSane(createPlanWith([missingName(), missingName(), validCreatePayload()])),
    ).toThrow(/2 of 3 CREATE entries/);
  });

  it("hints at the likely cause (raw snapshot or missing brands step)", () => {
    expect(() => assertPlanSane(createPlanWith([missingBrand()]))).toThrow(
      /raw scrape|brands.*step/i,
    );
  });
});

describe("deepEqual", () => {
  it("treats nested {value, unit} objects with differing key order as equal", () => {
    expect(deepEqual({ value: 225, unit: "km" }, { unit: "km", value: 225 })).toBe(true);
  });

  it("treats arrays in the same order as equal", () => {
    expect(deepEqual(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
  });

  it("treats reordered arrays as NOT equal (order is meaningful, e.g. primary image first)", () => {
    expect(deepEqual(["a", "b", "c"], ["c", "b", "a"])).toBe(false);
  });

  it("treats arrays of differing length as not equal", () => {
    expect(deepEqual(["a", "b"], ["a", "b", "c"])).toBe(false);
  });

  it("treats null and undefined as not equal", () => {
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it("treats 0 and \"0\" as not equal", () => {
    expect(deepEqual(0, "0")).toBe(false);
  });

  it("treats a key present with value undefined the same as the key being absent", () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it("treats JSON round-trip float noise as equal", () => {
    expect(deepEqual(1.7000000000000002, 1.7)).toBe(true);
  });

  it("treats a genuinely different measurement as not equal (1.7 vs 1.8)", () => {
    expect(deepEqual(1.7, 1.8)).toBe(false);
  });

  it("treats a genuinely different measurement as not equal (225 vs 230)", () => {
    expect(deepEqual(225, 230)).toBe(false);
  });

  it("treats 0 and a float-epsilon-scale value (1e-15) as equal", () => {
    // 1e-15 is far below any real-world measurement's precision floor and
    // on the order of float rounding noise itself, so it's judged noise,
    // not a genuine change from zero.
    expect(deepEqual(0, 1e-15)).toBe(true);
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
