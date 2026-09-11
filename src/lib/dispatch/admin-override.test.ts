import { beforeEach, describe, expect, it, vi } from "vitest";

interface Call { path: string; method: string; body: Record<string, unknown> | undefined }
const calls: Call[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const state: { row: any; invoice: any } = { row: null, invoice: null };

function baseRow() {
  return {
    id: "d1", stage: "new", stage_history: [{ stage: "new", at: "2026-07-12T00:00:00.000Z" }],
    disqualified: false,
    disqualification_reason: null, disqualification_note: null,
    gift: false, billable: true,
    // Locked: the partner-facing route would refuse outright from here.
    billable_locked_at: "2026-09-05T00:00:00.000Z",
    invoice: null as string | null,
  };
}

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ path, method, body });
    if (path.startsWith("/items/partner_dispatches/") && method === "GET") {
      return { data: state.row ? { ...state.row } : null };
    }
    if (path.startsWith("/items/partner_invoices/") && method === "GET") {
      return { data: state.invoice };
    }
    return { data: {} };
  }),
}));

beforeEach(() => {
  calls.length = 0;
  state.row = baseRow();
  state.invoice = null;
  vi.resetModules();
});

const patch = () => calls.find((c) => c.method === "PATCH" && c.path.startsWith("/items/partner_dispatches/"));

describe("adminDisqualify", () => {
  it("overrides a locked row, which the partner route refuses", async () => {
    const { adminDisqualify } = await import("./admin-override");
    const r = await adminDisqualify("d1", "unreachable", "jamais joignable", new Date("2026-09-09T00:00:00Z"));

    expect(r).toEqual({ ok: true, reason: "unreachable", wasLocked: true });
    const b = patch()!.body!;
    expect(b.disqualified).toBe(true);
    expect(b.disqualification_reason).toBe("unreachable");
    expect(b.billable).toBe(false);
    // The lock is released so no later invoice can pick the row up again.
    expect(b.billable_locked_at).toBeNull();
  });

  it("stamps the note so a forced disqualification is recognisable afterwards", async () => {
    const { adminDisqualify } = await import("./admin-override");
    await adminDisqualify("d1", "unreachable", "jamais joignable", new Date("2026-09-09T00:00:00Z"));
    expect(patch()!.body!.disqualification_note).toBe("[admin 2026-09-09] unreachable: jamais joignable");
  });

  it("accepts a reason the stage list would forbid — the override is the point", async () => {
    // `technically_infeasible` is not offered at quote_sent for a partner.
    state.row = { ...baseRow(), stage: "quote_sent" };
    const { adminDisqualify } = await import("./admin-override");
    await expect(
      adminDisqualify("d1", "technically_infeasible", "irréalisable", new Date("2026-09-09T00:00:00Z")),
    ).resolves.toMatchObject({ ok: true });
  });

  it("refuses a dispatch still attached to a live invoice, naming it", async () => {
    state.row = { ...baseRow(), invoice: "inv-1" };
    state.invoice = { number: "EME-202607", status: "sent" };
    const { adminDisqualify } = await import("./admin-override");
    await expect(adminDisqualify("d1", "unreachable", null)).rejects.toThrow("attached_to_live_invoice");
    // Nothing written: an issued invoice must not end up contradicting its ledger.
    expect(patch()).toBeUndefined();
  });

  it("allows it once that invoice is cancelled", async () => {
    state.row = { ...baseRow(), invoice: "inv-1" };
    state.invoice = { number: "EME-202607", status: "cancelled" };
    const { adminDisqualify } = await import("./admin-override");
    await expect(adminDisqualify("d1", "unreachable", null)).resolves.toMatchObject({ ok: true });
  });

  it("rejects an unknown reason and a bare 'other'", async () => {
    const { adminDisqualify } = await import("./admin-override");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(adminDisqualify("d1", "made_up" as any, null)).rejects.toThrow("invalid_reason");
    await expect(adminDisqualify("d1", "other", "  ")).rejects.toThrow("note_required_for_other");
    expect(patch()).toBeUndefined();
  });

  it("404s on a missing dispatch", async () => {
    state.row = null;
    const { adminDisqualify } = await import("./admin-override");
    await expect(adminDisqualify("nope", "unreachable", null)).rejects.toThrow("dispatch_not_found");
  });
});

describe("adminRequalify", () => {
  it("clears the disqualification and leaves the lock to the next reconcile", async () => {
    state.row = { ...baseRow(), disqualified: true, disqualification_reason: "unreachable" };
    const { adminRequalify } = await import("./admin-override");
    const r = await adminRequalify("d1", "retour du partenaire", new Date("2026-09-09T00:00:00Z"));

    expect(r).toEqual({ ok: true, wasDisqualified: true });
    const b = patch()!.body!;
    expect(b.disqualified).toBe(false);
    expect(b.disqualification_reason).toBeNull();
    expect(b.disqualified_at).toBeNull();
    expect(b.billable_locked_at).toBeNull();
    expect(b.disqualification_note).toBe("[admin 2026-09-09] requalified: retour du partenaire");
  });

  it("refuses while the dispatch sits on a live invoice", async () => {
    state.row = { ...baseRow(), disqualified: true, invoice: "inv-1" };
    state.invoice = { number: "EME-202607", status: "sent" };
    const { adminRequalify } = await import("./admin-override");
    await expect(adminRequalify("d1", null)).rejects.toThrow("attached_to_live_invoice");
    expect(patch()).toBeUndefined();
  });
});

describe("adminSetStage", () => {
  const NOW = new Date("2026-09-11T00:00:00Z");

  it("moves a disqualified lead, which the partner route refuses outright", async () => {
    state.row = { ...baseRow(), disqualified: true, disqualification_reason: "long_timeframe" };
    const { adminSetStage } = await import("./admin-override");
    const r = await adminSetStage("d1", "contacted", null, NOW);

    expect(r).toEqual({ ok: true, from: "new", to: "contacted" });
    expect(patch()!.body!.stage).toBe("contacted");
    // Still disqualified — a column fix is not a requalification.
    expect(patch()!.body).not.toHaveProperty("disqualified");
  });

  it("moves backward, which the partner route rejects as backward_stage", async () => {
    state.row = { ...baseRow(), stage: "contacted", disqualified: true, disqualification_reason: "unreachable" };
    const { adminSetStage } = await import("./admin-override");
    const r = await adminSetStage("d1", "new", null, NOW);
    expect(r).toEqual({ ok: true, from: "contacted", to: "new" });
  });

  it("never touches billing — the partner route would re-lock it", async () => {
    state.row = { ...baseRow(), billable: false, billable_locked_at: null };
    const { adminSetStage } = await import("./admin-override");
    await adminSetStage("d1", "appointment", null, NOW);

    const b = patch()!.body!;
    expect(b).not.toHaveProperty("billable");
    expect(b).not.toHaveProperty("billable_locked_at");
  });

  it("appends to the history and marks the entry as forced", async () => {
    const { adminSetStage } = await import("./admin-override");
    await adminSetStage("d1", "appointment", null, NOW);

    expect(patch()!.body!.stage_history).toEqual([
      { stage: "new", at: "2026-07-12T00:00:00.000Z" },
      { stage: "appointment", at: NOW.toISOString(), by: "admin" },
    ]);
  });

  it("drops the lost reason when leaving the lost stage", async () => {
    state.row = { ...baseRow(), stage: "lost" };
    const { adminSetStage } = await import("./admin-override");
    await adminSetStage("d1", "quote_sent", null, NOW);

    expect(patch()!.body!.lost_reason).toBeNull();
    expect(patch()!.body!.lost_note).toBeNull();
  });

  it("keeps the lost reason when the target is still lost", async () => {
    state.row = { ...baseRow(), stage: "lost" };
    const { adminSetStage } = await import("./admin-override");
    await adminSetStage("d1", "lost", null, NOW);
    expect(patch()!.body).not.toHaveProperty("lost_reason");
  });

  it("refuses a stage that is not in the funnel", async () => {
    const { adminSetStage } = await import("./admin-override");
    await expect(adminSetStage("d1", "archived" as never, null, NOW)).rejects.toThrow("invalid_stage");
    expect(patch()).toBeUndefined();
  });

  it("stamps the note so the forced move is traceable", async () => {
    const { adminSetStage } = await import("./admin-override");
    await adminSetStage("d1", "contacted", "tri de juillet", NOW);
    expect(patch()!.body!.disqualification_note).toBe(
      "[admin 2026-09-11] stage:contacted: tri de juillet",
    );
  });
});
