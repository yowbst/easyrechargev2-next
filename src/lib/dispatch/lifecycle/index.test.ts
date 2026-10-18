import { beforeEach, describe, expect, it, vi } from "vitest";

interface Call { path: string; method: string; body: Record<string, unknown> | undefined }
const calls: Call[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const state: { rows: any[]; invoice: any } = { rows: [], invoice: null };

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ path, method, body });
    if (path.startsWith("/items/partner_invoices/")) return { data: state.invoice };
    if (path.startsWith("/items/partner_dispatches/") && method === "GET") {
      const id = path.split("/").pop()!.split("?")[0];
      return { data: state.rows.find((r) => r.id === id) ?? null };
    }
    if (path.startsWith("/items/partner_dispatches?")) return { data: state.rows };
    return { data: {} };
  }),
}));

vi.mock("@/lib/dispatch/queries", () => ({
  fetchDispatchConfig: vi.fn(async () => ({
    billing: { currency: "CHF", acceptance_window_days: 15, dedup_window_days: 30 },
  })),
}));

vi.mock("@/lib/dispatch/partner-dashboard-queries", () => ({
  fetchPartnerLeadsConfig: vi.fn(async () => ({ reasons_by_stage: {} })),
}));

const emitted: { name: string; payload: Record<string, unknown> }[] = [];
vi.mock("@/lib/dispatch/events", () => ({
  emitDispatchEvent: vi.fn((name: string, payload: Record<string, unknown>) => emitted.push({ name, payload })),
}));

import { act, lockAcceptedDispatches } from "./index";

const NOW = new Date("2026-10-18T10:00:00.000Z");

function row(over: Record<string, unknown> = {}) {
  return {
    id: "d1",
    stage: "new",
    stage_history: [],
    dispatched_at: "2026-10-15T10:00:00",
    disqualified: null,
    gift: null,
    billable: null,
    billable_locked_at: null,
    lost_reason: null,
    invoice: null,
    canton: "VD",
    product: "ecp",
    partner: { id: "p1", slug: "acme", name: "Acme SA", disqualification_overrides: null },
    submission: { id: "s1", data: {} },
    ...over,
  };
}

const partner = { kind: "partner", partnerId: "p1", source: "kanban" } as const;
const patches = () => calls.filter((c) => c.method === "PATCH");

beforeEach(() => {
  calls.length = 0;
  emitted.length = 0;
  state.rows = [row()];
  state.invoice = null;
});

describe("act", () => {
  it("writes the decided patch and sends the events", async () => {
    const r = await act("d1", partner, { type: "move", stage: "contacted" }, { now: NOW });

    expect(r).toMatchObject({ ok: true, stage: "contacted", billable: false });
    expect(patches()).toHaveLength(1);
    expect(patches()[0].path).toBe("/items/partner_dispatches/d1");
    expect(patches()[0].body).toMatchObject({ stage: "contacted", stage_entered_at: NOW.toISOString() });
    expect(emitted.map((e) => e.name)).toEqual(["stage_changed"]);
  });

  it("returns the row as it was, for callers that report what changed", async () => {
    state.rows = [row({ billable_locked_at: "2026-10-16T00:00:00.000Z", billable: true })];
    const r = await act("d1", { kind: "admin" }, { type: "disqualify", reason: "unreachable" }, { now: NOW });
    expect(r.ok && r.before.billable_locked_at).toBe("2026-10-16T00:00:00.000Z");
  });

  it("answers 404 for a dispatch that does not exist", async () => {
    state.rows = [];
    expect(await act("nope", partner, { type: "move", stage: "contacted" })).toEqual({
      ok: false,
      error: "not_found",
      status: 404,
    });
  });

  it("writes nothing for a no-op", async () => {
    state.rows = [row({ stage: "contacted" })];
    const r = await act("d1", partner, { type: "move", stage: "contacted" }, { now: NOW });
    expect(r.ok).toBe(true);
    expect(patches()).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it("writes the patch a refusal carries, sends nothing, and answers 409", async () => {
    state.rows = [row({ dispatched_at: "2026-09-01T00:00:00" })];
    const r = await act("d1", partner, { type: "disqualify", reason: "unreachable" }, { now: NOW });
    expect(r).toEqual({ ok: false, error: "window_expired", status: 409 });
    expect(patches()[0].body).toEqual({ billable: true, billable_locked_at: NOW.toISOString() });
    expect(emitted).toHaveLength(0);
  });

  it("looks up the invoice a dispatch sits on and names it in the refusal", async () => {
    state.rows = [row({ invoice: "inv-1" })];
    state.invoice = { number: "EME-202607", status: "sent" };
    const r = await act("d1", { kind: "admin" }, { type: "requalify" }, { now: NOW });
    expect(r).toEqual({
      ok: false,
      error: "attached_to_live_invoice",
      status: 409,
      invoice: { number: "EME-202607", status: "sent" },
    });
    expect(patches()).toHaveLength(0);
  });

  it("reads zone-less Directus datetimes as UTC", async () => {
    // 14 days 23 hours before NOW in UTC: still inside the window. Read as
    // local time east of UTC (CEST on a dev machine) it would look 2 h older
    // and lock.
    state.rows = [row({ dispatched_at: "2026-10-03T11:00:00" })];
    const r = await act("d1", { kind: "system" }, { type: "lock_if_accepted" }, { now: NOW });
    expect(r).toMatchObject({ ok: true, billable: false });
    expect(patches()).toHaveLength(0);
  });
});

describe("lockAcceptedDispatches", () => {
  beforeEach(() => {
    state.rows = [
      row({ id: "late", dispatched_at: "2026-09-01T00:00:00" }),
      row({ id: "late-null", dispatched_at: "2026-09-01T00:00:00", disqualified: null, gift: null }),
      row({ id: "fresh" }),
      row({ id: "gift", dispatched_at: "2026-09-01T00:00:00", gift: true }),
      row({ id: "disq", dispatched_at: "2026-09-01T00:00:00", disqualified: true }),
    ];
  });

  it("fetches unlocked dispatched rows without filtering on nullable flags", async () => {
    await lockAcceptedDispatches({ dryRun: true, now: NOW });
    const query = decodeURIComponent(calls[0].path);
    expect(query).toContain("filter[status][_eq]=dispatched");
    expect(query).toContain("filter[billable_locked_at][_null]=true");
    expect(query).not.toContain("_neq");
  });

  it("locks the leads whose window has ended, null flags included", async () => {
    const r = await lockAcceptedDispatches({ dryRun: false, now: NOW });
    expect(r).toEqual({ locked: 2, ids: ["late", "late-null"], dryRun: false });
    expect(patches().map((p) => p.path)).toEqual([
      "/items/partner_dispatches/late",
      "/items/partner_dispatches/late-null",
    ]);
  });

  it("writes nothing on a dry run", async () => {
    const r = await lockAcceptedDispatches({ dryRun: true, now: NOW });
    expect(r.ids).toEqual(["late", "late-null"]);
    expect(patches()).toHaveLength(0);
  });
});
