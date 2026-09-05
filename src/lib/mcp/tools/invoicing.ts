import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import {
  addAdjustmentLine, addInvoiceNote, addManualLeadLine, issueInvoice, previewInvoice,
  setInvoiceStatus,
} from "@/lib/billing/invoice";
import { generateInvoiceDocument } from "@/lib/billing/google-docs";
import { INVOICE_STATUSES } from "@/lib/billing/types";
import { run } from "./helpers";

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
    async ({ partner, month }) => run(() => previewInvoice(partner, month)),
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
    async ({ partner, month }) => run(() => issueInvoice(partner, month)),
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
    async ({ invoiceId }) => run(() => generateInvoiceDocument(invoiceId)),
  );

  server.registerTool(
    "set_invoice_status",
    {
      title: "Set invoice status",
      description:
        "Move an invoice through issued -> sent -> paid, or to disputed/cancelled. paid and cancelled are terminal; issued cannot jump straight to paid.",
      inputSchema: {
        invoiceId: z.string(),
        status: z.enum(INVOICE_STATUSES),
        note: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ invoiceId, status, note }) => run(async () => {
      await setInvoiceStatus(invoiceId, status, note);
      return { ok: true, status };
    }),
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
    async ({ invoiceId, actor, note }) => run(async () => {
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
    async ({ invoiceId, description, amountChf }) => run(async () => {
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
    async ({ invoiceId, label, unitPriceChf, ...meta }) => run(
      () => addManualLeadLine(invoiceId, label, unitPriceChf, meta),
    ),
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
    async ({ month, status }) => run(async () => {
      const params = new URLSearchParams();
      params.set("fields", "id,number,version,status,period_month,total_chf,issued_at,due_at,paid_at,doc_url");
      params.set("sort", "-issued_at");
      params.set("limit", "100");
      // Same environment scoping as GET /api/admin/invoices — a staging invoice
      // must never appear in a production listing.
      params.set("filter[environment][_eq]", getEnvironment());
      if (month) params.set("filter[period_month][_eq]", month);
      if (status) params.set("filter[status][_eq]", status);
      const res = await directusFetch<{ data: unknown[] }>(
        `/items/partner_invoices?${params}`, { next: { revalidate: 0 } },
      );
      return res?.data ?? [];
    }),
  );
}
