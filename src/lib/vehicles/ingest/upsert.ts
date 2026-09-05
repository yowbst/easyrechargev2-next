import { writeFileSync } from "node:fs";
import { directusFetch } from "@/lib/directus";
import type { IngestPlan, PlanEntry } from "./types";

export type WriteFn = (
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
) => Promise<void>;

const directusWrite: WriteFn = async (method, path, body) => {
  await directusFetch(path, {
    method,
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });
};

/** Keys that must never reach an update payload, whatever the diff says. */
const FROZEN_ON_UPDATE = new Set(["status", "slug"]);

export async function applyPlan(
  plan: IngestPlan,
  opts: {
    dryRun: boolean;
    onProgress?: (entry: PlanEntry, index: number, total: number) => void;
    write?: WriteFn;
  },
): Promise<{ created: number; updated: number; skipped: number; completed: string[] }> {
  const write = opts.write ?? directusWrite;
  const done = new Set(plan.completed);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const actionable = plan.entries.filter(
    (e) => e.bucket === "CREATE" || e.bucket === "UPDATE",
  );
  skipped = plan.entries.length - actionable.length;

  for (const [i, entry] of actionable.entries()) {
    if (done.has(entry.evdbId)) {
      skipped += 1;
      continue;
    }

    opts.onProgress?.(entry, i, actionable.length);

    if (entry.bucket === "CREATE") {
      if (!opts.dryRun) await write("POST", "/items/vehicles", entry.payload ?? {});
      created += 1;
    } else {
      const body: Record<string, unknown> = {};
      for (const [key, change] of Object.entries(entry.changes)) {
        if (FROZEN_ON_UPDATE.has(key)) continue;
        body[key] = change.to;
      }
      if (Object.keys(body).length === 0) {
        // Nothing left to write after stripping frozen keys — never wrote,
        // so intentionally not marked done. Harmless: it will simply be
        // re-evaluated (and again produce no write) on a resumed run.
        skipped += 1;
        continue;
      }
      if (!opts.dryRun) await write("PATCH", `/items/vehicles/${entry.cmsId}`, body);
      updated += 1;
    }

    // Only record as completed once a write has genuinely happened. A dry
    // run applies nothing, so it must never populate `plan.completed` —
    // doing so would make a subsequent real run skip everything as
    // already-done.
    if (!opts.dryRun) {
      done.add(entry.evdbId);
      plan.completed = [...done];
    }
  }

  return { created, updated, skipped, completed: [...done] };
}

/** File-persistence seam for {@link applyPlanAndPersist}. Defaults to a real write. */
export type PersistFn = (path: string, plan: IngestPlan) => void;

const defaultPersist: PersistFn = (path, plan) => {
  writeFileSync(path, JSON.stringify(plan, null, 1));
};

/**
 * Wraps {@link applyPlan} so `plan.completed` is written back to `planPath`
 * even when the run throws partway through — a Directus 502 surviving its
 * retries, for example. Without this, `applyPlan` still accumulates
 * `plan.completed` in memory (proven by its own tests), but the CLI never
 * got a chance to flush it to disk, so a resumed run had no record of what
 * had already succeeded and would re-POST/re-PATCH entries that landed
 * before the failure.
 *
 * The `finally` persists on the way out either way; `try/finally` lets the
 * original error keep propagating unmodified after the write.
 *
 * A dry run never mutates `plan.completed`, so persisting one would just
 * rewrite the file with itself — skipped entirely, matching `applyPlan`'s
 * own dry-run contract.
 */
export async function applyPlanAndPersist(
  plan: IngestPlan,
  planPath: string,
  opts: {
    dryRun: boolean;
    onProgress?: (entry: PlanEntry, index: number, total: number) => void;
    write?: WriteFn;
    persist?: PersistFn;
  },
): Promise<{ created: number; updated: number; skipped: number; completed: string[] }> {
  try {
    return await applyPlan(plan, {
      dryRun: opts.dryRun,
      onProgress: opts.onProgress,
      write: opts.write,
    });
  } finally {
    if (!opts.dryRun) {
      (opts.persist ?? defaultPersist)(planPath, plan);
    }
  }
}
