import { beforeEach, describe, expect, it, vi } from "vitest";

interface Call { path: string; method: string; body: Record<string, unknown> | undefined }

interface LineRow { kind: string; amount_chf: string | number; label?: string }

const calls: Call[] = [];
const state = {
  invoice: {
    id: "inv-1",
    status: "issued" as string,
    events: [] as unknown[],
    subtotal_chf: 100 as string | number,
    adjustment_chf: 0 as string | number,
  },
  // The invoice's actual lines. Ten CHF 10 leads = the stored subtotal of 100,
  // so a correct implementation may read either and agree — until a test makes
  // them disagree on purpose.
  lines: [] as LineRow[],
  /** Dispatches currently stamped with inv-1. */
  stamped: ["d1", "d2", "d3"] as string[],
};

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ path, method, body });

    if (path.startsWith("/items/partner_invoices/") && method === "GET") {
      return { data: { ...state.invoice } };
    }
    if (path.startsWith("/items/partner_invoices/") && method === "PATCH") {
      Object.assign(state.invoice, body);
      return { data: {} };
    }
    if (path.startsWith("/items/partner_invoice_lines") && method === "POST") {
      state.lines.push({
        kind: String(body!.kind),
        amount_chf: body!.amount_chf as number,
        label: body!.label as string,
      });
      return { data: { id: `line-${state.lines.length}` } };
    }
    if (path.startsWith("/items/partner_invoice_lines") && method === "GET") {
      return { data: state.lines.map((l) => ({ kind: l.kind, amount_chf: l.amount_chf })) };
    }
    if (path.startsWith("/items/partner_dispatches") && method === "GET") {
      return { data: state.stamped.map((id) => ({ id })) };
    }
    if (path.startsWith("/items/partner_dispatches") && method === "PATCH") {
      const keys = (body!.keys ?? []) as string[];
      const patch = (body!.data ?? {}) as { invoice?: string | null };
      if (patch.invoice === null) state.stamped = state.stamped.filter((id) => !keys.includes(id));
      return { data: {} };
    }
    return { data: [] };
  }),
}));

function resetState() {
  calls.length = 0;
  state.invoice = { id: "inv-1", status: "issued", events: [], subtotal_chf: 100, adjustment_chf: 0 };
  state.lines = Array.from({ length: 10 }, () => ({ kind: "lead", amount_chf: "10.00" }));
  state.stamped = ["d1", "d2", "d3"];
}

describe("setInvoiceStatus", () => {
  beforeEach(() => { resetState(); vi.resetModules(); });

  it("patches the status, appends one event, and stamps sent_at for issued -> sent", async () => {
    const { setInvoiceStatus } = await import("./invoice");
    await setInvoiceStatus("inv-1", "sent", undefined, new Date("2026-09-05T00:00:00.000Z"));

    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch).toBeDefined();
    const body = patch!.body!;
    expect(body.status).toBe("sent");
    expect(body.events).toHaveLength(1);
    expect((body.events as { type: string }[])[0].type).toBe("sent");
    expect(body.sent_at).toBe("2026-09-05T00:00:00.000Z");
    expect(body.paid_at).toBeUndefined();
  });

  it("stamps paid_at for sent -> paid", async () => {
    state.invoice.status = "sent";
    const { setInvoiceStatus } = await import("./invoice");
    await setInvoiceStatus("inv-1", "paid", undefined, new Date("2026-09-05T00:00:00.000Z"));

    const patch = calls.find((c) => c.method === "PATCH");
    const body = patch!.body!;
    expect(body.status).toBe("paid");
    expect(body.paid_at).toBe("2026-09-05T00:00:00.000Z");
    expect(body.sent_at).toBeUndefined();
  });

  it("records event type revision_requested for sent -> disputed", async () => {
    state.invoice.status = "sent";
    const { setInvoiceStatus } = await import("./invoice");
    await setInvoiceStatus("inv-1", "disputed", "partner disagrees", new Date("2026-09-05T00:00:00.000Z"));

    const patch = calls.find((c) => c.method === "PATCH");
    const body = patch!.body!;
    const event = (body.events as { type: string; note?: string }[])[0];
    expect(event.type).toBe("revision_requested");
    expect(event.note).toBe("partner disagrees");
  });

  it("throws invalid_transition and performs no write for an illegal transition", async () => {
    state.invoice.status = "paid"; // terminal
    const { setInvoiceStatus } = await import("./invoice");
    await expect(setInvoiceStatus("inv-1", "sent")).rejects.toThrow("invalid_transition");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("releases every stamped dispatch when cancelling (Critical 1)", async () => {
    const { setInvoiceStatus } = await import("./invoice");
    await setInvoiceStatus("inv-1", "cancelled", "partner disputes the scope");

    const release = calls.find(
      (c) => c.path === "/items/partner_dispatches" && c.method === "PATCH",
    );
    expect(release).toBeDefined();
    expect(release!.body!.keys).toEqual(["d1", "d2", "d3"]);
    expect(release!.body!.data).toEqual({ invoice: null });
    // The stamps are actually gone — the period is billable again.
    expect(state.stamped).toEqual([]);
    expect(state.invoice.status).toBe("cancelled");
  });

  it("releases the dispatches BEFORE patching the status, so a crash in between leaves the invoice live", async () => {
    const { setInvoiceStatus } = await import("./invoice");
    await setInvoiceStatus("inv-1", "cancelled");

    const releaseIndex = calls.findIndex(
      (c) => c.path === "/items/partner_dispatches" && c.method === "PATCH",
    );
    const statusIndex = calls.findIndex(
      (c) => c.path.startsWith("/items/partner_invoices/") && c.method === "PATCH",
    );
    expect(releaseIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(releaseIndex).toBeLessThan(statusIndex);
  });

  it("does not touch dispatches for a non-cancelling transition", async () => {
    const { setInvoiceStatus } = await import("./invoice");
    await setInvoiceStatus("inv-1", "sent");
    expect(calls.some((c) => c.path.startsWith("/items/partner_dispatches"))).toBe(false);
    expect(state.stamped).toEqual(["d1", "d2", "d3"]);
  });

  it("cancels cleanly when the invoice has no stamped dispatches left (idempotent retry)", async () => {
    state.stamped = [];
    const { setInvoiceStatus } = await import("./invoice");
    await setInvoiceStatus("inv-1", "cancelled");
    expect(calls.some((c) => c.path === "/items/partner_dispatches" && c.method === "PATCH")).toBe(false);
    expect(state.invoice.status).toBe("cancelled");
  });
});

describe("addInvoiceNote", () => {
  beforeEach(() => { resetState(); vi.resetModules(); });

  it("appends a comment event, preserving existing events, with the actor passed through", async () => {
    state.invoice.events = [{ at: "2026-01-01T00:00:00.000Z", actor: "system", type: "issued" }];
    const { addInvoiceNote } = await import("./invoice");
    await addInvoiceNote("inv-1", "partner", "please resend the PDF", new Date("2026-09-05T00:00:00.000Z"));

    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch).toBeDefined();
    const events = patch!.body!.events as { at: string; actor: string; type: string; note?: string }[];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "issued" });
    expect(events[1]).toMatchObject({ actor: "partner", type: "comment", note: "please resend the PDF" });
  });
});

describe("addAdjustmentLine", () => {
  beforeEach(() => { resetState(); vi.resetModules(); });

  it("creates the adjustment line and sets adjustment_chf/total_chf for a first, negative adjustment", async () => {
    const { addAdjustmentLine } = await import("./invoice");
    await addAdjustmentLine("inv-1", "goodwill discount", -10);

    const linePost = calls.find(
      (c) => c.path.startsWith("/items/partner_invoice_lines") && c.method === "POST",
    );
    expect(linePost).toBeDefined();
    expect(linePost!.body).toMatchObject({ kind: "adjustment", label: "goodwill discount", amount_chf: -10 });

    const patch = calls.filter(
      (c) => c.path.startsWith("/items/partner_invoices/") && c.method === "PATCH",
    ).pop();
    const body = patch!.body!;
    expect(body.subtotal_chf).toBe(100);
    expect(body.adjustment_chf).toBe(-10);
    expect(body.total_chf).toBe(90);
  });

  it("accumulates a second adjustment into adjustment_chf rather than replacing it", async () => {
    state.lines.push({ kind: "adjustment", amount_chf: "-10.00", label: "first" });
    state.invoice.adjustment_chf = -10;
    const { addAdjustmentLine } = await import("./invoice");
    await addAdjustmentLine("inv-1", "second correction", -5);

    const patch = calls.filter(
      (c) => c.path.startsWith("/items/partner_invoices/") && c.method === "PATCH",
    ).pop();
    const body = patch!.body!;
    expect(body.adjustment_chf).toBe(-15);
    expect(body.total_chf).toBe(85); // subtotal 100 + adjustment -15
  });

  it("recomputes the subtotal from the LINES, correcting a stale stored subtotal (Important 4)", async () => {
    // 17 lead lines at CHF 40 = 680, while the header still claims 560/14 —
    // the state that hand-inserted lines leave behind.
    state.lines = Array.from({ length: 17 }, () => ({ kind: "lead", amount_chf: "40.00" }));
    state.invoice.subtotal_chf = 560;

    const { addAdjustmentLine } = await import("./invoice");
    await addAdjustmentLine("inv-1", "goodwill", -80);

    const patch = calls.filter(
      (c) => c.path.startsWith("/items/partner_invoices/") && c.method === "PATCH",
    ).pop();
    expect(patch!.body!.subtotal_chf).toBe(680);
    expect(patch!.body!.total_chf).toBe(600);
  });

  it("throws invoice_closed and does not write for a paid invoice", async () => {
    state.invoice.status = "paid";
    const { addAdjustmentLine } = await import("./invoice");
    await expect(addAdjustmentLine("inv-1", "too late", -1)).rejects.toThrow("invoice_closed");
    expect(calls.some((c) => c.method === "PATCH" || c.path.startsWith("/items/partner_invoice_lines"))).toBe(false);
  });

  it("throws invoice_closed and does not write for a cancelled invoice", async () => {
    state.invoice.status = "cancelled";
    const { addAdjustmentLine } = await import("./invoice");
    await expect(addAdjustmentLine("inv-1", "too late", -1)).rejects.toThrow("invoice_closed");
    expect(calls.some((c) => c.method === "PATCH" || c.path.startsWith("/items/partner_invoice_lines"))).toBe(false);
  });

  it("posts the line with retry disabled — a retried POST would double the discount", async () => {
    const { directusFetch } = await import("@/lib/directus");
    const { addAdjustmentLine } = await import("./invoice");
    await addAdjustmentLine("inv-1", "goodwill discount", -10);

    const post = vi.mocked(directusFetch).mock.calls.find(
      ([path, init]) => path.startsWith("/items/partner_invoice_lines")
        && (init as RequestInit | undefined)?.method === "POST",
    );
    expect((post![1] as { retry?: boolean }).retry).toBe(false);
  });
});

describe("addManualLeadLine", () => {
  beforeEach(() => { resetState(); vi.resetModules(); });

  it("writes a kind=lead, dispatch=null line and recomputes the totals from the lines", async () => {
    // The July rollout: 14 ledger leads at CHF 40 on the invoice, three
    // pre-go-live leads to add by hand.
    state.lines = Array.from({ length: 14 }, () => ({ kind: "lead", amount_chf: "40.00" }));
    state.invoice.subtotal_chf = 560;

    const { addManualLeadLine } = await import("./invoice");
    const totals = await addManualLeadLine(
      "inv-1", "P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04", 40,
      { dispatchedAt: "2026-07-04", canton: "VD", postalCode: "1052",
        locality: "Le Mont-sur-Lausanne", lastName: "Papeil", leadCategory: "owner_solar",
        product: "ecp" },
    );

    const linePost = calls.find(
      (c) => c.path.startsWith("/items/partner_invoice_lines") && c.method === "POST",
    );
    expect(linePost!.body).toMatchObject({
      invoice: "inv-1", kind: "lead", dispatch: null, quantity: 1,
      unit_price_chf: 40, amount_chf: 40, canton: "VD", last_name: "Papeil",
      sort: 14,
    });

    expect(totals).toEqual({ subtotal_chf: 600, adjustment_chf: 0, total_chf: 600 });
    const patch = calls.filter(
      (c) => c.path.startsWith("/items/partner_invoices/") && c.method === "PATCH",
    ).pop();
    expect(patch!.body!.subtotal_chf).toBe(600);
    expect(patch!.body!.total_chf).toBe(600);
  });

  it("reaches the spec's July figures after three manual leads: 17 lines, CHF 680", async () => {
    state.lines = Array.from({ length: 14 }, () => ({ kind: "lead", amount_chf: "40.00" }));
    const { addManualLeadLine } = await import("./invoice");
    await addManualLeadLine("inv-1", "P / PAPEIL / 1052 Le Mont / 2026-07-04", 40);
    await addManualLeadLine("inv-1", "P / CHAILLET / 1400 Yverdon / 2026-07-07", 40);
    const last = await addManualLeadLine("inv-1", "P / GOLAY / 1170 Aubonne / 2026-07-07", 40);

    expect(state.lines).toHaveLength(17);
    expect(last.total_chf).toBe(680);
  });

  it("keeps an existing adjustment out of the subtotal and folded into the total", async () => {
    state.lines = [
      { kind: "lead", amount_chf: "40.00" },
      { kind: "adjustment", amount_chf: "-15.00", label: "remise" },
    ];
    const { addManualLeadLine } = await import("./invoice");
    const totals = await addManualLeadLine("inv-1", "P / X / 1000 Lausanne / 2026-07-09", 60);

    expect(totals).toEqual({ subtotal_chf: 100, adjustment_chf: -15, total_chf: 85 });
    // Sorted after the lead lines, never after the 9999 adjustment.
    const linePost = calls.find(
      (c) => c.path.startsWith("/items/partner_invoice_lines") && c.method === "POST",
    );
    expect(linePost!.body!.sort).toBe(1);
  });

  it("refuses on a paid invoice and writes nothing", async () => {
    state.invoice.status = "paid";
    const { addManualLeadLine } = await import("./invoice");
    await expect(addManualLeadLine("inv-1", "too late", 40)).rejects.toThrow("invoice_closed");
    expect(calls.some((c) => c.method === "POST" || c.method === "PATCH")).toBe(false);
  });

  it("refuses on a cancelled invoice and writes nothing", async () => {
    state.invoice.status = "cancelled";
    const { addManualLeadLine } = await import("./invoice");
    await expect(addManualLeadLine("inv-1", "too late", 40)).rejects.toThrow("invoice_closed");
    expect(calls.some((c) => c.method === "POST" || c.method === "PATCH")).toBe(false);
  });

  it("refuses a non-finite price", async () => {
    const { addManualLeadLine } = await import("./invoice");
    await expect(addManualLeadLine("inv-1", "bad", Number.NaN)).rejects.toThrow("invalid_amount");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("posts the line with retry disabled — a retried POST would bill the lead twice", async () => {
    const { directusFetch } = await import("@/lib/directus");
    const { addManualLeadLine } = await import("./invoice");
    await addManualLeadLine("inv-1", "P / X / 1000 Lausanne / 2026-07-09", 40);

    const post = vi.mocked(directusFetch).mock.calls.find(
      ([path, init]) => path.startsWith("/items/partner_invoice_lines")
        && (init as RequestInit | undefined)?.method === "POST",
    );
    expect((post![1] as { retry?: boolean }).retry).toBe(false);
  });
});
