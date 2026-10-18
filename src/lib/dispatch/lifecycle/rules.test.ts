import { describe, expect, it } from "vitest";
import {
  allowedActions,
  decide,
  type Actor,
  type LifecycleContext,
  type LifecycleDispatch,
} from "./rules";

const NOW = new Date("2026-10-18T10:00:00.000Z");
const ISO = NOW.toISOString();

const ctx: LifecycleContext = {
  billing: { currency: "CHF", acceptance_window_days: 15, dedup_window_days: 30 },
  reasonsByStage: {},
  now: NOW,
};

function dispatch(over: Partial<LifecycleDispatch> = {}): LifecycleDispatch {
  return {
    id: "d1",
    stage: "new",
    stage_history: [{ stage: "new", at: "2026-10-15T00:00:00.000Z" }],
    // Three days ago: inside the 15-day acceptance window.
    dispatched_at: "2026-10-15T10:00:00.000Z",
    disqualified: null,
    gift: null,
    billable: null,
    billable_locked_at: null,
    lost_reason: null,
    invoice: null,
    canton: "VD",
    product: "ecp",
    partner: { id: "p1", slug: "acme", name: "Acme SA", disqualification_overrides: null },
    submission: { id: "s1", data: { postalCode: "1003", locality: "Lausanne", email: "x@y.ch" } },
    ...over,
  };
}

const kanban: Actor = { kind: "partner", partnerId: "p1", source: "kanban" };
const email: Actor = { kind: "partner", partnerId: "p1", source: "email" };
const admin: Actor = { kind: "admin" };
const system: Actor = { kind: "system" };

const move = (stage: string, extra: { lostReason?: string; lostNote?: string } = {}) =>
  ({ type: "move", stage, ...extra }) as const;

describe("partner moves a lead", () => {
  it("moves forward, stamps the stage and appends to the history", () => {
    const d = decide(dispatch(), kanban, move("contacted"), ctx);
    expect(d).toMatchObject({
      ok: true,
      patch: {
        stage: "contacted",
        stage_entered_at: ISO,
        stage_history: [
          { stage: "new", at: "2026-10-15T00:00:00.000Z" },
          { stage: "contacted", at: ISO },
        ],
      },
    });
  });

  it("emits stage_changed without any customer contact detail", () => {
    const d = decide(dispatch(), kanban, move("contacted"), ctx);
    expect(d.ok && d.events).toEqual([
      {
        name: "stage_changed",
        payload: {
          source: "kanban",
          dispatch_id: "d1",
          submission_id: "s1",
          partner: { slug: "acme", name: "Acme SA" },
          canton: "VD",
          product: "ecp",
          postal_code: "1003",
          locality: "Lausanne",
          from_stage: "new",
          to_stage: "contacted",
          lost_reason: null,
        },
      },
    ]);
  });

  it("treats a move to the current stage as a no-op: nothing written, nothing sent", () => {
    const d = decide(dispatch({ stage: "contacted" }), kanban, move("contacted"), ctx);
    expect(d).toEqual({ ok: true, patch: null, events: [], billable: false });
  });

  it("refuses a backward move on an open lead", () => {
    const d = decide(dispatch({ stage: "appointment" }), kanban, move("contacted"), ctx);
    expect(d).toMatchObject({ ok: false, error: "backward_stage" });
  });

  it("refuses an unknown stage", () => {
    expect(decide(dispatch(), kanban, move("archived"), ctx)).toMatchObject({ ok: false, error: "invalid_stage" });
  });

  it("refuses a lead that belongs to another partner, as if it did not exist", () => {
    const other: Actor = { kind: "partner", partnerId: "p2", source: "kanban" };
    expect(decide(dispatch(), other, move("contacted"), ctx)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("refuses any move on a disqualified lead", () => {
    const d = decide(dispatch({ disqualified: true }), kanban, move("contacted"), ctx);
    expect(d).toMatchObject({ ok: false, error: "already_disqualified" });
  });

  it.each([
    ["new", "won"],
    ["contacted", "won"],
    ["new", "lost"],
  ] as const)("refuses closing too early: %s → %s", (from, to) => {
    const d = decide(dispatch({ stage: from }), kanban, move(to, { lostReason: "price" }), ctx);
    expect(d).toMatchObject({ ok: false, error: "close_not_allowed" });
  });

  it.each([
    ["contacted", "lost"],
    ["appointment", "won"],
    ["appointment", "lost"],
    ["quote_sent", "won"],
  ] as const)("allows closing from an engaged stage: %s → %s", (from, to) => {
    const d = decide(dispatch({ stage: from }), kanban, move(to, { lostReason: "price" }), ctx);
    expect(d.ok).toBe(true);
  });

  it("requires a lost reason, and a note for 'other'", () => {
    const at = dispatch({ stage: "appointment" });
    expect(decide(at, kanban, move("lost"), ctx)).toMatchObject({ error: "lost_reason_required" });
    expect(decide(at, kanban, move("lost", { lostReason: "made_up" }), ctx)).toMatchObject({ error: "lost_reason_required" });
    expect(decide(at, kanban, move("lost", { lostReason: "other", lostNote: "  " }), ctx)).toMatchObject({
      error: "lost_note_required_for_other",
    });
  });

  it("records the lost reason and note when closing as lost", () => {
    const d = decide(dispatch({ stage: "appointment" }), kanban, move("lost", { lostReason: "other", lostNote: " trop cher " }), ctx);
    expect(d.ok && d.patch).toMatchObject({ lost_reason: "other", lost_note: "trop cher" });
  });
});

describe("billing lock on a move", () => {
  it.each(["quote_sent", "won", "lost"] as const)("locks billing on reaching %s", (stage) => {
    const d = decide(dispatch({ stage: "appointment" }), kanban, move(stage, { lostReason: "price" }), ctx);
    expect(d).toMatchObject({ ok: true, billable: true, patch: { billable: true, billable_locked_at: ISO } });
  });

  it("does not lock on an early move inside the acceptance window", () => {
    const d = decide(dispatch(), kanban, move("contacted"), ctx);
    expect(d).toMatchObject({ ok: true, billable: false, patch: { billable: false, billable_locked_at: null } });
  });

  it("locks on any move once the acceptance window has ended", () => {
    const d = decide(dispatch({ dispatched_at: "2026-09-01T00:00:00.000Z" }), kanban, move("contacted"), ctx);
    expect(d).toMatchObject({ ok: true, billable: true });
  });

  it("honours a partner's own acceptance window", () => {
    const partner = { id: "p1", slug: "acme", name: "Acme SA", disqualification_overrides: { acceptance: 2 } };
    const d = decide(dispatch({ partner }), kanban, move("contacted"), ctx);
    expect(d).toMatchObject({ ok: true, billable: true });
  });

  it("never bills a gift, even on reaching quote_sent", () => {
    const d = decide(dispatch({ stage: "appointment", gift: true }), kanban, move("quote_sent"), ctx);
    expect(d).toMatchObject({ ok: true, billable: false });
  });

  it("keeps the original lock date", () => {
    const d = decide(
      dispatch({ stage: "appointment", billable: true, billable_locked_at: "2026-10-16T00:00:00.000Z" }),
      kanban,
      move("quote_sent"),
      ctx,
    );
    expect(d.ok && d.patch).toMatchObject({ billable: true, billable_locked_at: "2026-10-16T00:00:00.000Z" });
  });
});

describe("closed leads: swap and reopen", () => {
  const closed = (stage: "won" | "lost", from = "appointment") =>
    dispatch({
      stage,
      billable: true,
      billable_locked_at: "2026-10-16T00:00:00.000Z",
      lost_reason: stage === "lost" ? "price" : null,
      stage_history: [
        { stage: "new", at: "2026-10-15T00:00:00.000Z" },
        { stage: from, at: "2026-10-16T00:00:00.000Z" },
        { stage, at: "2026-10-17T00:00:00.000Z" },
      ],
    });

  it("swaps won → lost from the board, with a reason", () => {
    const d = decide(closed("won"), kanban, move("lost", { lostReason: "competitor" }), ctx);
    expect(d).toMatchObject({ ok: true, patch: { stage: "lost", lost_reason: "competitor" } });
  });

  it("swaps lost → won from the board and drops the lost reason", () => {
    const d = decide(closed("lost"), kanban, move("won"), ctx);
    expect(d).toMatchObject({ ok: true, patch: { stage: "won", lost_reason: null, lost_note: null } });
  });

  it("reopens to the stage the lead was closed from, keeping billing and clearing the reason", () => {
    const d = decide(closed("lost"), kanban, move("appointment"), ctx);
    expect(d).toMatchObject({
      ok: true,
      billable: true,
      patch: {
        stage: "appointment",
        billable: true,
        billable_locked_at: "2026-10-16T00:00:00.000Z",
        lost_reason: null,
        lost_note: null,
      },
    });
  });

  it("refuses to reopen to any other stage", () => {
    const d = decide(closed("lost"), kanban, move("new"), ctx);
    expect(d).toMatchObject({ ok: false, error: "backward_stage" });
  });

  it("reopens to quote_sent when the history names no earlier stage", () => {
    const d = decide(dispatch({ stage: "won", stage_history: null }), kanban, move("quote_sent"), ctx);
    expect(d.ok).toBe(true);
  });
});

describe("moves from an e-mail link", () => {
  it("applies a forward move like the board", () => {
    expect(decide(dispatch(), email, move("contacted"), ctx)).toMatchObject({
      ok: true,
      events: [{ payload: { source: "email" } }],
    });
  });

  it("calls a repeated or overtaken move already done", () => {
    expect(decide(dispatch({ stage: "contacted" }), email, move("contacted"), ctx)).toMatchObject({ error: "already_done" });
    expect(decide(dispatch({ stage: "appointment" }), email, move("contacted"), ctx)).toMatchObject({ error: "already_done" });
  });

  it("never swaps the outcome of a closed lead", () => {
    const won = dispatch({ stage: "won", billable: true, billable_locked_at: "2026-10-16T00:00:00.000Z" });
    expect(decide(won, email, move("lost", { lostReason: "price" }), ctx)).toMatchObject({ error: "already_done" });
  });
});

const disqualify = (reason: string, note?: string) => ({ type: "disqualify", reason, note }) as const;

describe("partner disqualifies a lead", () => {
  it("disqualifies inside the window: never billable, lock stamped, event sent", () => {
    const d = decide(dispatch(), kanban, disqualify("already_known", " déjà client "), ctx);
    expect(d).toMatchObject({
      ok: true,
      billable: false,
      patch: {
        disqualified: true,
        disqualification_reason: "already_known",
        disqualification_note: "déjà client",
        disqualified_at: ISO,
        billable: false,
        billable_locked_at: ISO,
      },
      events: [{ name: "disqualified", payload: { source: "kanban", stage: "new", reason: "already_known" } }],
    });
  });

  it("works the same from an e-mail link", () => {
    expect(decide(dispatch(), email, disqualify("already_known"), ctx)).toMatchObject({
      ok: true,
      events: [{ payload: { source: "email" } }],
    });
  });

  it("refuses an unknown reason, and 'other' without a note", () => {
    expect(decide(dispatch(), kanban, disqualify("made_up"), ctx)).toMatchObject({ error: "invalid_reason" });
    expect(decide(dispatch(), kanban, disqualify("other", "  "), ctx)).toMatchObject({ error: "note_required_for_other" });
  });

  it("refuses a lead already disqualified, or whose billing is locked", () => {
    expect(decide(dispatch({ disqualified: true }), kanban, disqualify("unreachable"), ctx)).toMatchObject({
      error: "already_disqualified",
    });
    expect(
      decide(dispatch({ billable_locked_at: "2026-10-16T00:00:00.000Z" }), kanban, disqualify("unreachable"), ctx),
    ).toMatchObject({ error: "billing_locked" });
  });

  it("refuses a reason the stage does not offer; a stage without a list allows all", () => {
    const strict = { ...ctx, reasonsByStage: { quote_sent: ["competitor"] } };
    expect(decide(dispatch({ stage: "quote_sent" }), kanban, disqualify("already_known"), strict)).toMatchObject({
      error: "reason_not_allowed_for_stage",
    });
    expect(decide(dispatch({ stage: "new" }), kanban, disqualify("already_known"), strict).ok).toBe(true);
  });

  it("refuses once the acceptance window has ended, and locks billing on the way out", () => {
    const late = dispatch({ dispatched_at: "2026-09-01T00:00:00.000Z" });
    expect(decide(late, kanban, disqualify("unreachable"), ctx)).toEqual({
      ok: false,
      error: "window_expired",
      patch: { billable: true, billable_locked_at: ISO },
    });
  });

  it("locks a late gift without billing it", () => {
    const late = dispatch({ dispatched_at: "2026-09-01T00:00:00.000Z", gift: true });
    expect(decide(late, kanban, disqualify("unreachable"), ctx)).toMatchObject({
      patch: { billable: false, billable_locked_at: ISO },
    });
  });

  it("cannot requalify or use the cron's lock", () => {
    expect(decide(dispatch(), kanban, { type: "requalify" }, ctx)).toMatchObject({ error: "not_allowed" });
    expect(decide(dispatch(), kanban, { type: "lock_if_accepted" }, ctx)).toMatchObject({ error: "not_allowed" });
  });
});

describe("admin overrides", () => {
  const locked = (over: Partial<LifecycleDispatch> = {}) =>
    dispatch({
      billable: true,
      billable_locked_at: "2026-09-05T00:00:00.000Z",
      dispatched_at: "2026-08-01T00:00:00.000Z",
      ...over,
    });

  it("disqualifies past the lock, the window and the stage list, and releases the lock", () => {
    const strict = { ...ctx, reasonsByStage: { quote_sent: ["competitor"] } };
    const d = decide(locked({ stage: "quote_sent" }), admin, disqualify("technically_infeasible", "irréalisable"), strict);
    expect(d).toMatchObject({
      ok: true,
      patch: {
        disqualified: true,
        disqualification_reason: "technically_infeasible",
        disqualification_note: "[admin 2026-10-18] technically_infeasible: irréalisable",
        disqualified_at: ISO,
        billable: false,
        billable_locked_at: null,
      },
      events: [{ name: "disqualified", payload: { source: "admin", reason: "technically_infeasible" } }],
    });
  });

  it("still validates the reason", () => {
    expect(decide(locked(), admin, disqualify("made_up"), ctx)).toMatchObject({ error: "invalid_reason" });
    expect(decide(locked(), admin, disqualify("other"), ctx)).toMatchObject({ error: "note_required_for_other" });
  });

  it("refuses while the dispatch sits on a live invoice, naming it", () => {
    const onInvoice = locked({ invoice: { number: "EME-202607", status: "sent" } });
    expect(decide(onInvoice, admin, disqualify("unreachable"), ctx)).toEqual({
      ok: false,
      error: "attached_to_live_invoice",
      invoice: { number: "EME-202607", status: "sent" },
    });
    expect(decide(onInvoice, admin, { type: "requalify" }, ctx)).toMatchObject({ error: "attached_to_live_invoice" });
  });

  it("goes ahead once that invoice is cancelled", () => {
    const cancelled = locked({ invoice: { number: "EME-202607", status: "cancelled" } });
    expect(decide(cancelled, admin, disqualify("unreachable"), ctx).ok).toBe(true);
  });

  it("requalifies, leaving the lock to the next reconcile", () => {
    const d = decide(locked({ disqualified: true }), admin, { type: "requalify", note: "retour du partenaire" }, ctx);
    expect(d).toMatchObject({
      ok: true,
      patch: {
        disqualified: false,
        disqualification_reason: null,
        disqualification_note: "[admin 2026-10-18] requalified: retour du partenaire",
        disqualified_at: null,
        billable: false,
        billable_locked_at: null,
      },
      events: [{ name: "requalified", payload: { source: "admin", stage: "new" } }],
    });
  });

  it("moves any lead to any stage, disqualified or backward, without touching billing or sending events", () => {
    const d = decide(locked({ stage: "contacted", disqualified: true }), admin, { type: "move", stage: "new" }, ctx);
    expect(d).toMatchObject({ ok: true, events: [] });
    const patch = d.ok ? d.patch! : {};
    expect(patch).toMatchObject({ stage: "new", stage_entered_at: ISO });
    expect(patch.stage_history?.at(-1)).toEqual({ stage: "new", at: ISO, by: "admin" });
    expect(patch).not.toHaveProperty("billable");
    expect(patch).not.toHaveProperty("billable_locked_at");
    expect(patch).not.toHaveProperty("disqualified");
  });

  it("drops the lost reason when moving out of lost, and stamps an optional note", () => {
    const d = decide(locked({ stage: "lost" }), admin, { type: "move", stage: "quote_sent", note: "tri" }, ctx);
    expect(d).toMatchObject({
      ok: true,
      patch: { lost_reason: null, lost_note: null, disqualification_note: "[admin 2026-10-18] stage:quote_sent: tri" },
    });
  });

  it("refuses a stage that is not in the funnel", () => {
    expect(decide(locked(), admin, { type: "move", stage: "archived" }, ctx)).toMatchObject({ error: "invalid_stage" });
  });
});

describe("the system locks accepted leads", () => {
  const lock = { type: "lock_if_accepted" } as const;
  const late = (over: Partial<LifecycleDispatch> = {}) =>
    dispatch({ dispatched_at: "2026-09-01T00:00:00.000Z", ...over });

  it("locks billing once the acceptance window has ended, without an event", () => {
    expect(decide(late(), system, lock, ctx)).toEqual({
      ok: true,
      billable: true,
      events: [],
      patch: { billable: true, billable_locked_at: ISO },
    });
  });

  it("treats a missing disqualified flag as not disqualified", () => {
    expect(decide(late({ disqualified: null, gift: null }), system, lock, ctx)).toMatchObject({ patch: { billable: true } });
  });

  it.each([
    ["inside the window", dispatch()],
    ["a gift", late({ gift: true })],
    ["disqualified", late({ disqualified: true })],
    ["already locked", late({ billable: true, billable_locked_at: "2026-09-16T00:00:00.000Z" })],
  ])("leaves a lead %s alone", (_, d) => {
    expect(decide(d, system, lock, ctx)).toMatchObject({ ok: true, patch: null });
  });
});

describe("allowedActions", () => {
  it.each([
    ["new", ["contacted", "appointment", "quote_sent", "disqualify"]],
    ["contacted", ["appointment", "quote_sent", "lost", "disqualify"]],
    ["appointment", ["quote_sent", "won", "lost", "disqualify"]],
    ["quote_sent", ["won", "lost", "disqualify"]],
  ] as const)("offers the partner the moves forward from %s", (stage, expected) => {
    expect(allowedActions(dispatch({ stage }), kanban)).toEqual(expected);
  });

  it("drops disqualify once billing is locked", () => {
    const d = dispatch({ stage: "quote_sent", billable_locked_at: "2026-10-16T00:00:00.000Z" });
    expect(allowedActions(d, kanban)).toEqual(["won", "lost"]);
  });

  it("offers nothing on a disqualified lead", () => {
    expect(allowedActions(dispatch({ disqualified: true }), kanban)).toEqual([]);
  });

  it("offers reopen and the swap on the board, nothing by e-mail, once closed", () => {
    const won = dispatch({
      stage: "won",
      stage_history: [
        { stage: "appointment", at: "2026-10-16T00:00:00.000Z" },
        { stage: "won", at: "2026-10-17T00:00:00.000Z" },
      ],
    });
    expect(allowedActions(won, kanban)).toEqual(["appointment", "lost"]);
    expect(allowedActions(won, email)).toEqual([]);
  });

  it("offers the system nothing", () => {
    expect(allowedActions(dispatch(), system)).toEqual([]);
  });

  // The board and the e-mail page draw their buttons from allowedActions; the
  // server answers with decide. They must never disagree.
  const stages = ["new", "contacted", "appointment", "quote_sent", "won", "lost"] as const;
  const cases = stages.flatMap((stage) =>
    [kanban, email].flatMap((actor) =>
      [false, true].map((locked) => ({ stage, actor, locked })),
    ),
  );
  it.each(cases)("every offered action is accepted: $stage, $actor.source, locked=$locked", ({ stage, actor, locked }) => {
    const d = dispatch({
      stage,
      billable: locked,
      billable_locked_at: locked ? "2026-10-16T00:00:00.000Z" : null,
      stage_history: [{ stage: "contacted", at: "2026-10-16T00:00:00.000Z" }, { stage, at: "2026-10-17T00:00:00.000Z" }],
    });
    for (const action of allowedActions(d, actor)) {
      const intent =
        action === "disqualify" ? disqualify("already_known") : move(action, { lostReason: "price" });
      expect(decide(d, actor, intent, ctx), `${stage} → ${action}`).toMatchObject({ ok: true });
    }
  });
});
