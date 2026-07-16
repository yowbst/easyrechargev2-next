import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOpenApiSpec } from "@/app/api/docs/openapi";
import { storage } from "@/lib/directus-storage";
import { listSiteUrls } from "@/lib/sitemap/list-urls";
import { run } from "./helpers";

export function registerAppTools(server: McpServer) {
  server.registerTool(
    "get_form_submission",
    {
      title: "Get form submission",
      description: "One form submission by id, with user and session expanded. Contains client PII.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => run(async () => (await storage.getSubmissionById(id)) ?? { notFound: id }),
  );

  server.registerTool(
    "list_site_urls",
    {
      title: "List site URLs",
      description: "All generated site URLs by type (cms | blog | vehicles | all) with fr/de counts.",
      inputSchema: {
        type: z.enum(["cms", "blog", "vehicles", "all"]).default("all"),
        lang: z.enum(["fr", "de"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ type, lang }) => run(() => listSiteUrls({ type, lang })),
  );

  server.registerTool(
    "get_api_docs",
    {
      title: "Get API docs",
      description: "The app's OpenAPI 3.0 specification (all public API endpoints).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(async () => getOpenApiSpec()),
  );
}
