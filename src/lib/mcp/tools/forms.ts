import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { run } from "./helpers";

function appOrigin(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.MCP_SELF_ORIGIN ?? "http://localhost:3000";
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${appOrigin()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "easyrecharge-mcp" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} responded ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const submitAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

export function registerFormTools(server: McpServer) {
  server.registerTool(
    "submit_quote",
    {
      title: "Submit quote request",
      description:
        "Create a real quote submission (persists to Directus, may dispatch to partners per DISPATCH_MODE, and fires the Make webhook → customer/partner emails). Use test-flagged emails for testing.",
      inputSchema: {
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
        phone: z.string().optional(),
        phoneCountry: z.string().optional(),
        lang: z.enum(["fr", "de"]).optional(),
        acceptTerms: z.boolean().optional(),
        extra: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Additional quote fields stored in submission data: canton, postalCode, locality, housingStatus, solarEquipment, …"),
      },
      annotations: submitAnnotations,
    },
    async ({ extra, ...fields }) => run(() => post("/api/quote", { ...(extra ?? {}), ...fields })),
  );

  server.registerTool(
    "submit_contact",
    {
      title: "Submit contact message",
      description: "Create a real contact submission (persists to Directus and fires the contact webhook).",
      inputSchema: {
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
        message: z.string(),
        phone: z.string().optional(),
        phoneCountry: z.string().optional(),
        lang: z.enum(["fr", "de"]).optional(),
        extra: z.record(z.string(), z.unknown()).optional().describe("subject, company, address fields, …"),
      },
      annotations: submitAnnotations,
    },
    async ({ extra, ...fields }) => run(() => post("/api/contact", { ...(extra ?? {}), ...fields })),
  );

  server.registerTool(
    "submit_mini_quote",
    {
      title: "Submit mini-quote",
      description: "Create a mini-quote session (no user record, no webhook). Returns the session token.",
      inputSchema: {
        housingStatus: z.string(),
        postalCode: z.string(),
        locality: z.string().optional(),
        canton: z.string().optional(),
        formType: z.string().optional(),
        pageId: z.string().optional(),
        locale: z.enum(["fr", "de"]).optional(),
      },
      annotations: submitAnnotations,
    },
    async (args) => run(() => post("/api/mini-quote", args)),
  );
}
