import { directusFetch } from "@/lib/directus";
import { fetchDispatchConfig } from "@/lib/dispatch/queries";
import { fetchPartnerLeadsConfig } from "@/lib/dispatch/partner-dashboard-queries";
import { emitDispatchEvent } from "@/lib/dispatch/events";
import { parseUtc } from "@/lib/dispatch/reminders";
import type { DispatchStage } from "@/lib/dispatch/types";
import {
  decide,
  type Actor,
  type DispatchPatch,
  type Intent,
  type LifecycleContext,
  type LifecycleDispatch,
} from "./rules";

export { allowedActions, reopenStage, type Actor, type Intent, type LifecycleAction } from "./rules";

/**
 * The Dispatch lifecycle module: the only place that writes a dispatch's
 * stage, disqualification or billing lock. Callers name an Actor and an
 * Intent; the rules in `./rules.ts` decide, this file loads, writes and sends.
 *
 * Known race, left as is: `stage_history` is a JSON column, so a move reads
 * it, appends, and PATCHes the whole array back (Directus replaces JSON on
 * PATCH). Two moves on the same lead at the same instant can lose an entry.
 */

export type ActResult =
  | { ok: true; stage: DispatchStage; billable: boolean; before: LifecycleDispatch }
  | { ok: false; error: string; status: number; invoice?: { number: string; status: string } };

/** HTTP status per refusal, shared by every route that calls `act`. */
const STATUS: Record<string, number> = {
  not_found: 404,
  not_allowed: 403,
  invalid_stage: 400,
  invalid_reason: 400,
  note_required_for_other: 400,
  lost_reason_required: 400,
  lost_note_required_for_other: 400,
  reason_not_allowed_for_stage: 400,
};

const ROW_FIELDS = [
  "id",
  "stage",
  "stage_history",
  "dispatched_at",
  "disqualified",
  "gift",
  "billable",
  "billable_locked_at",
  "lost_reason",
  "invoice",
  "canton",
  "product",
  "partner.id",
  "partner.slug",
  "partner.name",
  "partner.disqualification_overrides",
  "submission.id",
  "submission.data",
].join(",");

type Row = Omit<LifecycleDispatch, "invoice"> & { invoice: string | null };

/** Directus returns datetimes without a zone; they are UTC. */
const toUtc = (value: string) => new Date(parseUtc(value)).toISOString();

async function load(dispatchId: string): Promise<LifecycleDispatch | null> {
  const res = await directusFetch<{ data: Row | null }>(
    `/items/partner_dispatches/${dispatchId}?fields=${ROW_FIELDS}`,
    { next: { revalidate: 0 } },
  );
  const row = res?.data;
  if (!row) return null;
  let invoice: LifecycleDispatch["invoice"] = null;
  if (row.invoice) {
    const inv = await directusFetch<{ data: { number: string; status: string } | null }>(
      `/items/partner_invoices/${row.invoice}?fields=number,status`,
      { next: { revalidate: 0 } },
    );
    invoice = inv?.data ?? null;
  }
  return { ...row, dispatched_at: toUtc(row.dispatched_at), invoice };
}

async function context(actor: Actor, intent: Intent, now: Date): Promise<LifecycleContext> {
  // Stage reason lists only constrain a partner's own disqualification.
  const needsReasons = actor.kind === "partner" && intent.type === "disqualify";
  const [config, leads] = await Promise.all([
    fetchDispatchConfig(),
    needsReasons ? fetchPartnerLeadsConfig() : null,
  ]);
  return { billing: config.billing, reasonsByStage: leads?.reasons_by_stage ?? {}, now };
}

async function write(dispatchId: string, patch: DispatchPatch): Promise<void> {
  await directusFetch(`/items/partner_dispatches/${dispatchId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    next: { revalidate: 0 },
  });
}

/** Apply an Actor's Intent to one dispatch. */
export async function act(
  dispatchId: string,
  actor: Actor,
  intent: Intent,
  opts: { now?: Date } = {},
): Promise<ActResult> {
  const d = await load(dispatchId);
  if (!d) return { ok: false, error: "not_found", status: 404 };

  const decision = decide(d, actor, intent, await context(actor, intent, opts.now ?? new Date()));
  if (decision.patch) await write(dispatchId, decision.patch);
  if (!decision.ok) {
    return {
      ok: false,
      error: decision.error,
      status: STATUS[decision.error] ?? 409,
      ...(decision.invoice ? { invoice: decision.invoice } : {}),
    };
  }
  for (const e of decision.events) emitDispatchEvent(e.name, e.payload);
  return {
    ok: true,
    stage: decision.patch?.stage ?? d.stage,
    billable: decision.billable,
    before: d,
  };
}

/**
 * The nightly backstop: lock billing on every dispatched lead whose
 * acceptance window has ended. Flags are read in memory rather than filtered
 * in the query — `disqualified` and `gift` are often null, and a `_neq`
 * filter is not to be trusted with nulls.
 */
export async function lockAcceptedDispatches(
  opts: { dryRun?: boolean; now?: Date } = {},
): Promise<{ locked: number; ids: string[]; dryRun: boolean }> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  const actor: Actor = { kind: "system" };
  const intent: Intent = { type: "lock_if_accepted" };

  const params = new URLSearchParams();
  params.set("fields", ROW_FIELDS);
  params.set("filter[status][_eq]", "dispatched");
  params.set("filter[billable_locked_at][_null]", "true");
  params.set("limit", "-1");
  const [res, ctx] = await Promise.all([
    directusFetch<{ data: Row[] }>(`/items/partner_dispatches?${params}`, { next: { revalidate: 0 } }),
    context(actor, intent, now),
  ]);

  const ids: string[] = [];
  for (const row of res?.data ?? []) {
    // A row on an invoice is already billed; the lock rule never needs it.
    const d: LifecycleDispatch = { ...row, dispatched_at: toUtc(row.dispatched_at), invoice: null };
    const decision = decide(d, actor, intent, ctx);
    if (!decision.patch) continue;
    ids.push(d.id);
    if (!dryRun) await write(d.id, decision.patch);
  }
  return { locked: ids.length, ids, dryRun };
}
