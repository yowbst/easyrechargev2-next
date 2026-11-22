import { describe, expect, it } from "vitest";
import { applyCompanyPlan, applyCompanyPlanAndPersist, type WriteFn } from "./upsert";
import type { CompanyPlan, PlanEntry } from "./types";

const entry = (over: Partial<PlanEntry>): PlanEntry => ({
  bucket: "CREATE",
  ehraid: "1",
  legalName: "Co",
  canton: "VD",
  changes: {},
  ...over,
});

const planOf = (entries: PlanEntry[], completed: string[] = []): CompanyPlan => ({
  createdAt: "2026-11-20T00:00:00.000Z",
  sourceFile: "x",
  cmsCount: 0,
  candidateCount: entries.length,
  entries,
  completed,
});

function recorder() {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const write: WriteFn = async (method, path, body) => void calls.push({ method, path, body });
  return { calls, write };
}

describe("applyCompanyPlan", () => {
  it("POSTs creates and PATCHes the changed fields of the rest", async () => {
    const { calls, write } = recorder();
    const plan = planOf([
      entry({ ehraid: "1", payload: { ehraid: "1", legal_name: "A" } }),
      entry({ bucket: "UPDATE", ehraid: "2", cmsId: "c2", changes: { locality: { from: "A", to: "B" } } }),
      entry({ bucket: "GONE", ehraid: "3", cmsId: "c3", changes: { status: { from: "published", to: "archived" } } }),
      entry({ bucket: "REAPPEARED", ehraid: "4", cmsId: "c4", changes: { status: { from: "archived", to: "draft" } } }),
      entry({ bucket: "UNCHANGED", ehraid: "5", cmsId: "c5" }),
    ]);
    const r = await applyCompanyPlan(plan, { dryRun: false, write });
    expect(calls).toEqual([
      { method: "POST", path: "/items/companies", body: { ehraid: "1", legal_name: "A" } },
      { method: "PATCH", path: "/items/companies/c2", body: { locality: "B" } },
      { method: "PATCH", path: "/items/companies/c3", body: { status: "archived" } },
      { method: "PATCH", path: "/items/companies/c4", body: { status: "draft" } },
    ]);
    expect(r).toMatchObject({ created: 1, updated: 1, gone: 1, reappeared: 1, skipped: 1 });
    expect(plan.completed.sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("writes nothing and marks nothing done on a dry run", async () => {
    const { calls, write } = recorder();
    const plan = planOf([entry({ payload: { ehraid: "1" } })]);
    const r = await applyCompanyPlan(plan, { dryRun: true, write });
    expect(calls).toHaveLength(0);
    expect(r.created).toBe(1);
    expect(plan.completed).toEqual([]);
  });

  it("skips what a previous run already completed", async () => {
    const { calls, write } = recorder();
    const plan = planOf([entry({ ehraid: "1", payload: {} }), entry({ ehraid: "2", payload: {} })], ["1"]);
    await applyCompanyPlan(plan, { dryRun: false, write });
    expect(calls).toHaveLength(1);
    expect(plan.completed.sort()).toEqual(["1", "2"]);
  });

  it("does not PATCH an update with nothing to write", async () => {
    const { calls, write } = recorder();
    const r = await applyCompanyPlan(planOf([entry({ bucket: "UPDATE", cmsId: "c1" })]), { dryRun: false, write });
    expect(calls).toHaveLength(0);
    expect(r.skipped).toBe(1);
  });
});

describe("applyCompanyPlanAndPersist", () => {
  it("persists progress even when a write throws midway", async () => {
    let n = 0;
    const write: WriteFn = async () => {
      if (++n === 2) throw new Error("502");
    };
    const persisted: string[][] = [];
    const plan = planOf([entry({ ehraid: "1", payload: {} }), entry({ ehraid: "2", payload: {} })]);
    await expect(
      applyCompanyPlanAndPersist(plan, "p.json", { dryRun: false, write, persist: (_p, pl) => void persisted.push([...pl.completed]) }),
    ).rejects.toThrow("502");
    expect(persisted).toEqual([["1"]]);
  });

  it("does not touch the file on a dry run", async () => {
    const persisted: unknown[] = [];
    await applyCompanyPlanAndPersist(planOf([entry({ payload: {} })]), "p.json", {
      dryRun: true,
      persist: () => void persisted.push(1),
    });
    expect(persisted).toHaveLength(0);
  });
});
