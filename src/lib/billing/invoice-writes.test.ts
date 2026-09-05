import { beforeEach, describe, expect, it, vi } from "vitest";

interface Call { path: string; method: string; body: Record<string, unknown> | undefined }

const calls: Call[] = [];
const state = {
  invoice: {
    id: "inv-1",
    status: "issued" as string,
    events: [] as unknown[],
    subtotal_chf: 100 as string | number,
    adjustment_chf: 0 as string | number,
  },
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
      return { data: {} };
    }
    if (path.startsWith("/items/partner_invoice_lines") && method === "POST") {
      return { data: {} };
    }
    return { data: [] };
  }),
}));

function resetState() {
  calls.length = 0;
  state.invoice = { id: "inv-1", status: "issued", events: [], subtotal_chf: 100, adjustment_chf: 0 };
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

    const linePost = calls.find((c) => c.path.startsWith("/items/partner_invoice_lines"));
    expect(linePost).toBeDefined();
    expect(linePost!.body).toMatchObject({ kind: "adjustment", label: "goodwill discount", amount_chf: -10 });

    const patch = calls.find((c) => c.path.startsWith("/items/partner_invoices/") && c.method === "PATCH");
    const body = patch!.body!;
    expect(body.adjustment_chf).toBe(-10);
    expect(body.total_chf).toBe(90);
  });

  it("accumulates a second adjustment into adjustment_chf rather than replacing it", async () => {
    state.invoice.adjustment_chf = -10;
    const { addAdjustmentLine } = await import("./invoice");
    await addAdjustmentLine("inv-1", "second correction", -5);

    const patch = calls.find((c) => c.path.startsWith("/items/partner_invoices/") && c.method === "PATCH");
    const body = patch!.body!;
    expect(body.adjustment_chf).toBe(-15);
    expect(body.total_chf).toBe(85); // subtotal 100 + adjustment -15
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
});
