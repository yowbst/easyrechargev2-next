import { writeFileSync } from "node:fs";
import { directusFetch } from "@/lib/directus";
import type { CompanyPlan, PlanEntry } from "./types";

export type WriteFn = (method: "POST" | "PATCH", path: string, body: unknown) => Promise<void>;

/** `retry: false`: a 502 can arrive after the row was created, and a retried POST would duplicate it. */
const directusWrite: WriteFn = async (method, path, body) => {
  await directusFetch(path, {
    method,
    body: JSON.stringify(body),
    retry: false,
    next: { revalidate: 0 },
  });
};

export interface ApplyResult {
  created: number;
  updated: number;
  gone: number;
  reappeared: number;
  skipped: number;
  completed: string[];
}

export async function applyCompanyPlan(
  plan: CompanyPlan,
  opts: {
    dryRun: boolean;
    onProgress?: (entry: PlanEntry, index: number, total: number) => void;
    write?: WriteFn;
  },
): Promise<ApplyResult> {
  const write = opts.write ?? directusWrite;
  const done = new Set(plan.completed);
  const result: ApplyResult = { created: 0, updated: 0, gone: 0, reappeared: 0, skipped: 0, completed: [] };

  const actionable = plan.entries.filter((e) => e.bucket !== "UNCHANGED");
  result.skipped = plan.entries.length - actionable.length;

  for (const [i, entry] of actionable.entries()) {
    if (done.has(entry.ehraid)) {
      result.skipped += 1;
      continue;
    }
    opts.onProgress?.(entry, i, actionable.length);

    if (entry.bucket === "CREATE") {
      if (!opts.dryRun) await write("POST", "/items/companies", entry.payload ?? {});
      result.created += 1;
    } else {
      const body: Record<string, unknown> = {};
      for (const [key, change] of Object.entries(entry.changes)) body[key] = change.to;
      if (Object.keys(body).length === 0 || !entry.cmsId) {
        result.skipped += 1;
        continue;
      }
      if (!opts.dryRun) await write("PATCH", `/items/companies/${entry.cmsId}`, body);
      if (entry.bucket === "GONE") result.gone += 1;
      else if (entry.bucket === "REAPPEARED") result.reappeared += 1;
      else result.updated += 1;
    }

    // A dry run applies nothing, so it must never mark anything done.
    if (!opts.dryRun) {
      done.add(entry.ehraid);
      plan.completed = [...done];
    }
  }
  result.completed = [...done];
  return result;
}

export type PersistFn = (path: string, plan: CompanyPlan) => void;
const defaultPersist: PersistFn = (path, plan) => writeFileSync(path, JSON.stringify(plan, null, 1));

/** Writes `plan.completed` back to disk even when the run throws midway, so a resume skips what landed. */
export async function applyCompanyPlanAndPersist(
  plan: CompanyPlan,
  planPath: string,
  opts: {
    dryRun: boolean;
    onProgress?: (entry: PlanEntry, index: number, total: number) => void;
    write?: WriteFn;
    persist?: PersistFn;
  },
): Promise<ApplyResult> {
  try {
    return await applyCompanyPlan(plan, opts);
  } finally {
    if (!opts.dryRun) (opts.persist ?? defaultPersist)(planPath, plan);
  }
}
