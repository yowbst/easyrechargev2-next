import { describe, it, expect, vi } from "vitest";
import { applyPlan } from "./upsert";
import type { IngestPlan } from "./types";

const plan = (): IngestPlan => ({
  createdAt: "2026-08-23T00:00:00Z",
  sourceFile: "x.json",
  cmsCount: 3,
  scrapeCount: 3,
  completed: [],
  entries: [
    { bucket: "CREATE", evdbId: "1", slug: "a", changes: {}, payload: { name: "A", status: "draft" } },
    { bucket: "UPDATE", evdbId: "2", slug: "b", cmsId: "u2", changes: { range: { from: 1, to: 2 } } },
    { bucket: "UNCHANGED", evdbId: "3", slug: "c", cmsId: "u3", changes: {} },
    { bucket: "GONE", evdbId: "4", slug: "d", cmsId: "u4", changes: {} },
    { bucket: "SLUG_DRIFT", evdbId: "5", slug: "e", cmsId: "u5", changes: {}, generatedSlug: "e2" },
  ],
});

describe("applyPlan", () => {
  it("POSTs creates and PATCHes only the changed fields", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const res = await applyPlan(plan(), { dryRun: false, write });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledWith("POST", "/items/vehicles", { name: "A", status: "draft" });
    expect(write).toHaveBeenCalledWith("PATCH", "/items/vehicles/u2", { range: 2 });
    expect(res).toMatchObject({ created: 1, updated: 1, skipped: 3 });
  });

  it("never writes for GONE, SLUG_DRIFT or UNCHANGED", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await applyPlan(plan(), { dryRun: false, write });
    const paths = write.mock.calls.map((c) => c[1]);
    expect(paths).not.toContain("/items/vehicles/u3");
    expect(paths).not.toContain("/items/vehicles/u4");
    expect(paths).not.toContain("/items/vehicles/u5");
  });

  it("never includes status in a PATCH body", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const p = plan();
    p.entries[1].changes.status = { from: "published", to: "draft" };
    await applyPlan(p, { dryRun: false, write });

    const patch = write.mock.calls.find((c) => c[0] === "PATCH");
    expect(patch?.[2]).not.toHaveProperty("status");
  });

  it("never includes slug in a PATCH body", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const p = plan();
    p.entries[1].changes.slug = { from: "b", to: "b-new" };
    await applyPlan(p, { dryRun: false, write });

    const patch = write.mock.calls.find((c) => c[0] === "PATCH");
    expect(patch?.[2]).not.toHaveProperty("slug");
  });

  it("writes nothing when dryRun is set", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const res = await applyPlan(plan(), { dryRun: true, write });
    expect(write).not.toHaveBeenCalled();
    expect(res.created).toBe(1);
  });

  it("skips entries already in completed so an interrupted run resumes", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const p = plan();
    p.completed = ["1"];
    const res = await applyPlan(p, { dryRun: false, write });
    expect(write).toHaveBeenCalledTimes(1);
    expect(res.created).toBe(0);
    expect(res.updated).toBe(1);
  });

  it("records completed ids so a crash mid-run is resumable", async () => {
    const write = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"));
    await expect(applyPlan(plan(), { dryRun: false, write })).rejects.toThrow("boom");
  });
});
