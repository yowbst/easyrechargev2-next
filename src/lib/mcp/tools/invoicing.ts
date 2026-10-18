import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addAdjustmentLine, addInvoiceNote, addManualLeadLine, issueInvoice, listInvoices, previewInvoice,
  setInvoiceStatus,
} from "@/lib/billing/invoice";
import { generateInvoiceDocument } from "@/lib/billing/google-docs";
import { errorBody } from "@/lib/billing/admin-guard";
import { INVOICE_STATUSES } from "@/lib/billing/types";
import { act, type Intent } from "@/lib/dispatch/lifecycle";
import { DISQUALIFICATION_REASONS } from "@/lib/dispatch/types";
import { err, ok, type ToolResult } from "./helpers";

/** A refusal the caller should see as is (a lifecycle rule said no). */
class Refused extends Error {
  constructor(code: string, readonly hint?: string) {
    super(code);
  }
}

/**
 * Same error contract as the admin routes: domain errors and refusals come
 * back verbatim, anything else (a raw Directus or Google error) is logged and
 * collapsed to `internal_error` so internals never reach the MCP client.
 */
async function runBilling(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof Refused) return err(e.message, e.hint);
    return err(errorBody(e).error);
  }
}

/** An admin override through the Dispatch lifecycle. */
async function adminAct(dispatchId: string, intent: Intent) {
  const r = await act(dispatchId, { kind: "admin" }, intent);
  if (!r.ok) {
    throw new Refused(r.error, r.invoice ? `cancel invoice ${r.invoice.number} (${r.invoice.status}) first` : undefined);
  }
  return r;
}

export function registerInvoicingTools(server: McpServer) {
  server.registerTool(
    "preview_invoice",
    {
      title: "Preview a partner invoice",
      description:
        "Dry-run the invoice for a partner and month: number, period bounds, whether it is issuable yet, the billable lines, unsettled dispatches and the total. Writes nothing.",
      inputSchema: {
        partner: z.string().min(1).describe("partner slug, e.g. eme-energies"),
        month: z.string().min(1).describe("YYYY-MM"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ partner, month }) => runBilling(() => previewInvoice(partner, month)),
  );

  server.registerTool(
    "issue_invoice",
    {
      title: "Issue a partner invoice",
      description:
        "IRREVERSIBLE. Freezes the period: assigns the number, snapshots issuer and debtor, writes the lines and stamps each dispatch so it can never be billed twice. Refuses if the acceptance window has not closed or any dispatch is unsettled. Run preview_invoice first.",
      inputSchema: {
        partner: z.string().min(1).describe("partner slug"),
        month: z.string().min(1).describe("YYYY-MM"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ partner, month }) => runBilling(() => issueInvoice(partner, month)),
  );

  server.registerTool(
    "generate_invoice_document",
    {
      title: "Generate the invoice Google Doc",
      description:
        "Copies the template, fills the placeholders and returns the Doc URL. Always creates a NEW document — never overwrites a previous one, which may carry hand edits (Yoan adds the QR payment part by hand).",
      inputSchema: { invoiceId: z.string().describe("partner_invoices id") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ invoiceId }) => runBilling(() => generateInvoiceDocument(invoiceId)),
  );

  server.registerTool(
    "set_invoice_status",
    {
      title: "Set invoice status",
      description:
        "Move an invoice through issued -> sent -> paid, or to disputed/cancelled. paid and cancelled are terminal; issued cannot jump straight to paid. Cancelling also releases the invoice's dispatches back into the billable pool and prefixes its Drive documents — the Doc and any exported PDF — with ANNULÉE so the file that was sent cannot be reused by mistake.",
      inputSchema: {
        invoiceId: z.string(),
        status: z.enum(INVOICE_STATUSES),
        note: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ invoiceId, status, note }) => runBilling(async () => ({
      ok: true,
      ...(await setInvoiceStatus(invoiceId, status, note)),
    })),
  );

  server.registerTool(
    "add_invoice_note",
    {
      title: "Log an invoice comment",
      description:
        "Append a comment to the invoice's event log — used to record the back-and-forth with the partner before payment.",
      inputSchema: {
        invoiceId: z.string(),
        actor: z.enum(["yoan", "partner", "system"]).optional(),
        note: z.string().min(1),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ invoiceId, actor, note }) => runBilling(async () => {
      await addInvoiceNote(invoiceId, actor ?? "yoan", note);
      return { ok: true };
    }),
  );

  server.registerTool(
    "add_invoice_adjustment",
    {
      title: "Add an adjustment line",
      description:
        "Append a discount or correction line and recompute the total. Negative amounts are the normal case — this is how an exceptional credit is granted on a later invoice instead of issuing a credit note. Refused on a paid or cancelled invoice.",
      inputSchema: {
        invoiceId: z.string(),
        description: z.string().min(1).describe("shown as the line label on the document"),
        amountChf: z.number().describe("negative for a discount"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ invoiceId, description, amountChf }) => runBilling(async () => {
      await addAdjustmentLine(invoiceId, description, amountChf);
      return { ok: true };
    }),
  );

  server.registerTool(
    "add_invoice_manual_lead",
    {
      title: "Add a manual lead line",
      description:
        "Append a `lead` line with no dispatch — a lead billed without a ledger row (e.g. the pre-go-live July leads). Counts towards the lead quantity on the document, unlike an adjustment, and recomputes the invoice totals from the actual lines. Refused on a paid or cancelled invoice.",
      inputSchema: {
        invoiceId: z.string(),
        label: z.string().min(1).describe("P / SURNAME / 1052 Locality / 2026-07-04"),
        unitPriceChf: z.number().describe("the lead price, e.g. 40"),
        description: z.string().optional(),
        dispatchedAt: z.string().optional().describe("ISO date of the original dispatch"),
        canton: z.string().optional(),
        postalCode: z.string().optional(),
        locality: z.string().optional(),
        lastName: z.string().optional(),
        leadCategory: z.string().optional(),
        product: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ invoiceId, label, unitPriceChf, ...meta }) => runBilling(
      () => addManualLeadLine(invoiceId, label, unitPriceChf, meta),
    ),
  );

  server.registerTool(
    "admin_disqualify_dispatch",
    {
      title: "Disqualify a dispatch (operator override)",
      description:
        "Disqualify a lead REGARDLESS of the billing lock, the acceptance window, or the per-stage reason list — the three guards the partner's own dashboard enforces. Use when a partner disputes an invoice after their window closed. Refused while the dispatch sits on a non-cancelled invoice: cancel that invoice first (which releases its dispatches), then disqualify, then re-issue. The note is stamped [admin <date>] so the override stays recognisable.",
      inputSchema: {
        dispatchId: z.string().min(1),
        reason: z.enum(DISQUALIFICATION_REASONS as unknown as [string, ...string[]]),
        note: z.string().optional().describe("required when reason is 'other'"),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ dispatchId, reason, note }: { dispatchId: string; reason: string; note?: string }) =>
      runBilling(async () => {
        const r = await adminAct(dispatchId, { type: "disqualify", reason, note });
        return { ok: true, reason, wasLocked: Boolean(r.before.billable_locked_at) };
      }),
  );

  server.registerTool(
    "admin_requalify_dispatch",
    {
      title: "Undo a disqualification (operator override)",
      description:
        "Clear a disqualification, putting the lead back in the billable pool. The billing lock is left off so the next reconcile decides whether the acceptance window has elapsed. Refused while the dispatch sits on a non-cancelled invoice.",
      inputSchema: { dispatchId: z.string().min(1), note: z.string().optional() },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ dispatchId, note }: { dispatchId: string; note?: string }) =>
      runBilling(async () => {
        const r = await adminAct(dispatchId, { type: "requalify", note });
        return { ok: true, wasDisqualified: r.before.disqualified === true };
      }),
  );

  server.registerTool(
    "list_invoices",
    {
      title: "List partner invoices",
      description: "Invoices newest first, optionally filtered by month or status.",
      inputSchema: {
        month: z.string().optional().describe("YYYY-MM"),
        status: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ month, status }) => runBilling(() => listInvoices({ month, status })),
  );
}
