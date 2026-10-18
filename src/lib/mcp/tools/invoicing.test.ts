import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/invoice", () => ({
  addAdjustmentLine: vi.fn(),
  addInvoiceNote: vi.fn(),
  addManualLeadLine: vi.fn(),
  issueInvoice: vi.fn(),
  previewInvoice: vi.fn(),
  listInvoices: vi.fn(),
  setInvoiceStatus: vi.fn(),
}));
vi.mock("@/lib/billing/google-docs", () => ({ generateInvoiceDocument: vi.fn() }));
vi.mock("@/lib/dispatch/lifecycle", () => ({ act: vi.fn() }));

import { listInvoices, setInvoiceStatus } from "@/lib/billing/invoice";
import { act } from "@/lib/dispatch/lifecycle";
import { registerInvoicingTools } from "./invoicing";

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>;
const tools = new Map<string, Handler>();
registerInvoicingTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => tools.set(name, handler),
} as never);

const call = async (name: string, args: Record<string, unknown>) => {
  const r = await tools.get(name)!(args);
  return { isError: r.isError ?? false, body: JSON.parse(r.content[0].text) };
};

describe("MCP invoicing tools", () => {
  it("returns what the cancellation did to the documents, like the HTTP route", async () => {
    vi.mocked(setInvoiceStatus).mockResolvedValueOnce({
      status: "cancelled",
      documents: { renamed: ["ANNULÉE — EME-202607"], skipped: [] },
    });
    expect(await call("set_invoice_status", { invoiceId: "inv-1", status: "cancelled" })).toEqual({
      isError: false,
      body: { ok: true, status: "cancelled", documents: { renamed: ["ANNULÉE — EME-202607"], skipped: [] } },
    });
  });

  it("passes a known domain error through verbatim", async () => {
    vi.mocked(setInvoiceStatus).mockRejectedValueOnce(new Error("invalid_transition"));
    expect(await call("set_invoice_status", { invoiceId: "inv-1", status: "paid" })).toEqual({
      isError: true,
      body: { error: "invalid_transition" },
    });
  });

  it("never leaks a raw Directus or Google error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(listInvoices).mockRejectedValueOnce(new Error("Directus 403: forbidden on partner_invoices.secret"));
    expect(await call("list_invoices", {})).toEqual({ isError: true, body: { error: "internal_error" } });
  });

  it("reports a lifecycle refusal with what to do about it", async () => {
    vi.mocked(act).mockResolvedValueOnce({
      ok: false,
      error: "attached_to_live_invoice",
      status: 409,
      invoice: { number: "EME-202607", status: "sent" },
    });
    expect(await call("admin_requalify_dispatch", { dispatchId: "d1" })).toEqual({
      isError: true,
      body: { error: "attached_to_live_invoice", hint: "cancel invoice EME-202607 (sent) first" },
    });
  });
});
