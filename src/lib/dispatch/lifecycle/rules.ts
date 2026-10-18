import { isAcceptanceExpired } from "@/lib/dispatch/billing";
import type { BillingConfig } from "@/lib/dispatch/queries";
import type { ActionSource, DispatchEventName } from "@/lib/dispatch/events";
import {
  DISPATCH_STAGES,
  DISQUALIFICATION_REASONS,
  LOST_REASONS,
  STAGE_RANK,
  type DispatchStage,
  type DisqualificationReason,
  type LostReason,
} from "@/lib/dispatch/types";

/**
 * The rules of a Dispatch's lifecycle (see GLOSSARY.md): which moves are
 * legal, what each does to billing, who may disqualify, and which Lifecycle
 * events follow. Pure — no Directus, no `next/server` — so the board can ask
 * `allowedActions` the same question the server answers with `decide`.
 *
 * Every write to a dispatch's lifecycle fields goes through `decide`; the
 * server side (`./index.ts`) only loads, writes the patch and sends events.
 */

/** What `decide` needs to know about a dispatch. */
export interface LifecycleDispatch {
  id: string;
  stage: DispatchStage;
  stage_history: Array<{ stage: string; at: string; by?: string }> | null;
  dispatched_at: string;
  disqualified: boolean | null;
  gift: boolean | null;
  billable: boolean | null;
  billable_locked_at: string | null;
  lost_reason: string | null;
  /** The invoice this dispatch sits on, if any. */
  invoice: { number: string; status: string } | null;
  canton: string | null;
  product: string | null;
  partner: {
    id: string;
    slug: string;
    name: string;
    disqualification_overrides: Record<string, number> | null;
  } | null;
  submission: { id: string; data: Record<string, unknown> | null } | null;
}

/** Who is acting (GLOSSARY: Actor). */
export type Actor =
  | { kind: "partner"; partnerId: string; source: Exclude<ActionSource, "admin"> }
  | { kind: "admin" }
  | { kind: "system" };

export type Intent =
  /** Partner: forward, close, swap or reopen. Admin: any stage, as a correction. */
  | { type: "move"; stage: string; lostReason?: string; lostNote?: string; note?: string }
  | { type: "disqualify"; reason: string; note?: string }
  /** Admin only. */
  | { type: "requalify"; note?: string }
  /** System only: the nightly billing lock. */
  | { type: "lock_if_accepted" };

export interface LifecycleContext {
  billing: BillingConfig;
  /** Per-stage allowed disqualification reasons; a missing stage allows all. */
  reasonsByStage: Record<string, string[]>;
  now: Date;
}

/** The lifecycle columns of `partner_dispatches` a decision may write. */
export type DispatchPatch = Partial<{
  stage: DispatchStage;
  stage_entered_at: string;
  stage_history: Array<{ stage: string; at: string; by?: string }>;
  billable: boolean;
  billable_locked_at: string | null;
  lost_reason: string | null;
  lost_note: string | null;
  disqualified: boolean;
  disqualification_reason: DisqualificationReason | null;
  disqualification_note: string | null;
  disqualified_at: string | null;
}>;

export interface LifecycleEvent {
  name: DispatchEventName;
  payload: Record<string, unknown>;
}

export type Decision =
  | { ok: true; patch: DispatchPatch | null; events: LifecycleEvent[]; billable: boolean }
  | {
      ok: false;
      error: string;
      /** Written despite the refusal (a late disqualification locks billing). */
      patch?: DispatchPatch;
      /** The live invoice that blocks an admin override. */
      invoice?: { number: string; status: string };
    };

const refuse = (error: string): Decision => ({ ok: false, error });

const MAX_NOTE_LENGTH = 2000;

const isClosed = (stage: DispatchStage) => stage === "won" || stage === "lost";

/** Lost is a sales outcome from first contact on; won needs an appointment. */
const CLOSE_FROM: Record<"won" | "lost", DispatchStage> = { lost: "contacted", won: "appointment" };

/**
 * The stage a closed lead goes back to when reopened: the last open stage in
 * its history, quote_sent when the history names none.
 */
export function reopenStage(d: Pick<LifecycleDispatch, "stage_history">): DispatchStage {
  const h = d.stage_history ?? [];
  for (let i = h.length - 1; i >= 0; i--) {
    const s = h[i].stage as DispatchStage;
    if (DISPATCH_STAGES.includes(s) && !isClosed(s)) return s;
  }
  return "quote_sent";
}

/**
 * What a Lifecycle event may carry: no customer name, e-mail, phone or
 * free-text note — Make posts it to Slack. Postal code and locality locate
 * the lead well enough to recognise it.
 */
function eventContext(d: LifecycleDispatch, source: ActionSource) {
  const data = d.submission?.data ?? {};
  return {
    source,
    dispatch_id: d.id,
    submission_id: d.submission?.id ?? null,
    partner: d.partner ? { slug: d.partner.slug, name: d.partner.name } : null,
    canton: d.canton,
    product: d.product,
    postal_code: typeof data.postalCode === "string" ? data.postalCode : null,
    locality: typeof data.locality === "string" ? data.locality : null,
  };
}

function acceptanceExpired(d: LifecycleDispatch, ctx: LifecycleContext): boolean {
  return isAcceptanceExpired(
    d.dispatched_at,
    ctx.billing,
    d.partner?.disqualification_overrides ?? null,
    ctx.now,
  );
}

/**
 * Billing lock on a move: gifts and disqualified leads never bill; a lock
 * holds once taken; quote_sent and closing lock; so does the end of the
 * acceptance window.
 */
function locksOnMove(d: LifecycleDispatch, to: DispatchStage, ctx: LifecycleContext): boolean {
  if (d.disqualified === true || d.gift === true) return false;
  if (d.billable === true) return true;
  if (to === "quote_sent" || isClosed(to)) return true;
  return acceptanceExpired(d, ctx);
}

function decideMove(
  d: LifecycleDispatch,
  actor: Extract<Actor, { kind: "partner" }>,
  intent: Extract<Intent, { type: "move" }>,
  ctx: LifecycleContext,
): Decision {
  const to = intent.stage as DispatchStage;
  if (!DISPATCH_STAGES.includes(to)) return refuse("invalid_stage");
  if (d.disqualified === true) return refuse("already_disqualified");

  const fromEmail = actor.source !== "kanban";
  // An e-mail link is a one-shot nudge forward: once the lead has moved on
  // (or closed), a late click is "already done", never a rewrite.
  if (fromEmail && (isClosed(d.stage) || STAGE_RANK[to] <= STAGE_RANK[d.stage])) {
    return refuse("already_done");
  }
  if (to === d.stage) return { ok: true, patch: null, events: [], billable: d.billable === true };

  const reopening = isClosed(d.stage) && !isClosed(to);
  if (reopening) {
    if (to !== reopenStage(d)) return refuse("backward_stage");
  } else if (!isClosed(d.stage)) {
    if (STAGE_RANK[to] < STAGE_RANK[d.stage]) return refuse("backward_stage");
    if (isClosed(to) && STAGE_RANK[d.stage] < STAGE_RANK[CLOSE_FROM[to as "won" | "lost"]]) {
      return refuse("close_not_allowed");
    }
  }

  let lostReason: LostReason | null = null;
  let lostNote: string | null = null;
  if (to === "lost") {
    const reason = intent.lostReason;
    if (!reason || !LOST_REASONS.includes(reason as LostReason)) return refuse("lost_reason_required");
    const note = intent.lostNote?.trim() ?? "";
    if (reason === "other" && !note) return refuse("lost_note_required_for_other");
    lostReason = reason as LostReason;
    lostNote = note || null;
  }

  const now = ctx.now.toISOString();
  // Reopening never un-bills a lead that was already worked.
  const billable = reopening ? d.billable === true : locksOnMove(d, to, ctx);
  const patch: DispatchPatch = {
    stage: to,
    stage_entered_at: now,
    stage_history: [...(d.stage_history ?? []), { stage: to, at: now }],
    billable,
    billable_locked_at: billable && !d.billable_locked_at ? now : d.billable_locked_at,
    ...(to === "lost"
      ? { lost_reason: lostReason, lost_note: lostNote }
      : d.stage === "lost"
        ? { lost_reason: null, lost_note: null }
        : {}),
  };
  return {
    ok: true,
    patch,
    billable,
    events: [
      {
        name: "stage_changed",
        payload: {
          ...eventContext(d, actor.source),
          from_stage: d.stage,
          to_stage: to,
          lost_reason: lostReason,
        },
      },
    ],
  };
}

/** `[admin 2026-09-09] <reason>: <note>` — the only trace that an override was forced. */
function adminNote(label: string, note: string | null, now: Date): string {
  return `[admin ${now.toISOString().slice(0, 10)}] ${label}${note ? `: ${note}` : ""}`;
}

function cleanNote(note: string | undefined): string | null {
  const n = typeof note === "string" ? note.trim().slice(0, MAX_NOTE_LENGTH) : "";
  return n || null;
}

/**
 * Admin overrides may not touch a dispatch on an invoice that still stands:
 * the invoice would contradict its own ledger. Cancelling it releases the
 * dispatch.
 */
function liveInvoice(d: LifecycleDispatch): Decision | null {
  if (!d.invoice || d.invoice.status === "cancelled") return null;
  return { ok: false, error: "attached_to_live_invoice", invoice: d.invoice };
}

function decideDisqualify(
  d: LifecycleDispatch,
  actor: Exclude<Actor, { kind: "system" }>,
  intent: Extract<Intent, { type: "disqualify" }>,
  ctx: LifecycleContext,
): Decision {
  const reason = intent.reason as DisqualificationReason;
  if (!DISQUALIFICATION_REASONS.includes(reason)) return refuse("invalid_reason");
  const note = cleanNote(intent.note);
  // `other` is the escape hatch at every stage, but it must say why.
  if (reason === "other" && !note) return refuse("note_required_for_other");
  const now = ctx.now.toISOString();
  const source: ActionSource = actor.kind === "admin" ? "admin" : actor.source;
  const event: LifecycleEvent = {
    name: "disqualified",
    payload: { ...eventContext(d, source), stage: d.stage, reason },
  };

  if (actor.kind === "admin") {
    // The operator's override: past the lock, the window and the stage list —
    // a partner disputing an invoice after their window is the normal case.
    const blocked = liveInvoice(d);
    if (blocked) return blocked;
    return {
      ok: true,
      billable: false,
      events: [event],
      patch: {
        disqualified: true,
        disqualification_reason: reason,
        disqualification_note: adminNote(reason, note, ctx.now),
        disqualified_at: now,
        billable: false,
        // Released, so no later invoice picks the row up again.
        billable_locked_at: null,
      },
    };
  }

  if (d.disqualified === true) return refuse("already_disqualified");
  if (d.billable_locked_at) return refuse("billing_locked");
  const stageReasons = ctx.reasonsByStage[d.stage];
  if (Array.isArray(stageReasons) && stageReasons.length > 0 && !stageReasons.includes(reason)) {
    return refuse("reason_not_allowed_for_stage");
  }
  if (acceptanceExpired(d, ctx)) {
    // Too late: the lead counts as accepted. Lock it now rather than at the
    // next reconcile, so the board shows why.
    return {
      ok: false,
      error: "window_expired",
      patch: { billable: d.gift !== true, billable_locked_at: now },
    };
  }
  return {
    ok: true,
    billable: false,
    events: [event],
    patch: {
      disqualified: true,
      disqualification_reason: reason,
      disqualification_note: note,
      disqualified_at: now,
      billable: false,
      billable_locked_at: now,
    },
  };
}

function decideRequalify(
  d: LifecycleDispatch,
  intent: Extract<Intent, { type: "requalify" }>,
  ctx: LifecycleContext,
): Decision {
  const blocked = liveInvoice(d);
  if (blocked) return blocked;
  return {
    ok: true,
    billable: false,
    events: [{ name: "requalified", payload: { ...eventContext(d, "admin"), stage: d.stage } }],
    patch: {
      disqualified: false,
      disqualification_reason: null,
      disqualification_note: adminNote("requalified", cleanNote(intent.note), ctx.now),
      disqualified_at: null,
      // Left unlocked on purpose: the next reconcile decides whether the
      // acceptance window has ended, rather than this call asserting it.
      billable: false,
      billable_locked_at: null,
    },
  };
}

/**
 * An operator's column fix: any stage, disqualified or backward. The stage is
 * a CRM fact here, so billing is never touched and no event goes out.
 */
function decideAdminMove(
  d: LifecycleDispatch,
  intent: Extract<Intent, { type: "move" }>,
  ctx: LifecycleContext,
): Decision {
  const to = intent.stage as DispatchStage;
  if (!DISPATCH_STAGES.includes(to)) return refuse("invalid_stage");
  const now = ctx.now.toISOString();
  const note = cleanNote(intent.note);
  return {
    ok: true,
    billable: d.billable === true,
    events: [],
    patch: {
      stage: to,
      stage_entered_at: now,
      stage_history: [...(d.stage_history ?? []), { stage: to, at: now, by: "admin" }],
      ...(d.stage === "lost" && to !== "lost" ? { lost_reason: null, lost_note: null } : {}),
      ...(note ? { disqualification_note: adminNote(`stage:${to}`, note, ctx.now) } : {}),
    },
  };
}

/** The nightly backstop: lock billing on leads whose acceptance window has ended. */
function decideLock(d: LifecycleDispatch, ctx: LifecycleContext): Decision {
  const untouched: Decision = { ok: true, patch: null, events: [], billable: d.billable === true };
  if (d.disqualified === true || d.gift === true || d.billable_locked_at) return untouched;
  if (!acceptanceExpired(d, ctx)) return untouched;
  return {
    ok: true,
    billable: true,
    events: [],
    patch: { billable: true, billable_locked_at: ctx.now.toISOString() },
  };
}

/** Decide what an Actor's Intent does to a dispatch: a patch and events, or a refusal. */
export function decide(
  d: LifecycleDispatch,
  actor: Actor,
  intent: Intent,
  ctx: LifecycleContext,
): Decision {
  // Another partner's lead is answered as if it did not exist.
  if (actor.kind === "partner" && d.partner?.id !== actor.partnerId) return refuse("not_found");
  switch (intent.type) {
    case "move":
      if (actor.kind === "partner") return decideMove(d, actor, intent, ctx);
      if (actor.kind === "admin") return decideAdminMove(d, intent, ctx);
      return refuse("not_allowed");
    case "disqualify":
      return actor.kind === "system" ? refuse("not_allowed") : decideDisqualify(d, actor, intent, ctx);
    case "requalify":
      return actor.kind === "admin" ? decideRequalify(d, intent, ctx) : refuse("not_allowed");
    case "lock_if_accepted":
      return actor.kind === "system" ? decideLock(d, ctx) : refuse("not_allowed");
  }
}

export type LifecycleAction = DispatchStage | "disqualify";

/**
 * What an Actor can do next, for drawing buttons and drop targets. Billing
 * settings are not needed: a disqualification the acceptance window has
 * overtaken is still offered, and `decide` refuses it with `window_expired`.
 */
export function allowedActions(
  d: Pick<LifecycleDispatch, "stage_history" | "disqualified" | "billable_locked_at"> & { stage: string },
  actor: Actor,
): LifecycleAction[] {
  const stage = d.stage as DispatchStage;
  if (actor.kind === "system") return [];
  if (actor.kind === "admin") {
    const moves = DISPATCH_STAGES.filter((s) => s !== stage);
    return d.disqualified === true ? moves : [...moves, "disqualify"];
  }
  if (d.disqualified === true) return [];
  if (!DISPATCH_STAGES.includes(stage)) return [];
  if (isClosed(stage)) {
    if (actor.source !== "kanban") return [];
    return [reopenStage(d), stage === "won" ? "lost" : "won"];
  }
  const moves = DISPATCH_STAGES.filter(
    (s) =>
      STAGE_RANK[s] > STAGE_RANK[stage] &&
      (!isClosed(s) || STAGE_RANK[stage] >= STAGE_RANK[CLOSE_FROM[s as "won" | "lost"]]),
  );
  return d.billable_locked_at ? moves : [...moves, "disqualify"];
}
