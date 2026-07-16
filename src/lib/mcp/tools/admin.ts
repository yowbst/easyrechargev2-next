import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMonthlyBilling, listDispatches, reconcileBilling } from "@/lib/dispatch/admin";
import { manualDispatch } from "@/lib/dispatch/manual-dispatch";
import { run } from "./helpers";

export function registerAdminTools(server: McpServer) {
  server.registerTool(
    "get_billing",
    {
      title: "Get monthly billing",
      description: "Per-partner billable lead counts and CHF totals for a month (YYYY-MM). Read-only.",
      inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM") },
      annotations: { readOnlyHint: true },
    },
    async ({ month }) => run(() => getMonthlyBilling(month)),
  );

  server.registerTool(
    "reconcile_billing",
    {
      title: "Reconcile billing",
      description:
        "Lock billable=true on dispatches whose acceptance window elapsed. dryRun=true (default) only lists what WOULD lock; dryRun=false performs the irreversible billing lock.",
      inputSchema: { dryRun: z.boolean().default(true) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ dryRun }) => run(() => reconcileBilling({ dryRun })),
  );

  server.registerTool(
    "dispatch_submission",
    {
      title: "Dispatch submission to partners",
      description:
        "Manually dispatch a stored quote submission to partners in LIVE mode: writes billing ledger rows and sends real partner + customer emails via the Make webhook. force=true bypasses the already-dispatched guard (double-billing risk).",
      inputSchema: { submissionId: z.string(), force: z.boolean().default(false) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ submissionId, force }) => run(() => manualDispatch(submissionId, { force })),
  );

  server.registerTool(
    "list_dispatches",
    {
      title: "List partner dispatches",
      description:
        "Partner dispatch ledger, newest first. env defaults to the current deploy environment; pass 'all' to disable the filter.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(20),
        canton: z.string().optional(),
        status: z.string().optional().describe("dispatched | skipped_quota | skipped_no_partner | skipped_test | skipped_dedup"),
        partner: z.string().optional().describe("Partner slug"),
        env: z.enum(["development", "staging", "production", "all"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => run(() => listDispatches(args)),
  );
}
