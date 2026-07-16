import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { directusFetch } from "@/lib/directus";
import { run } from "./helpers";

const live = { next: { revalidate: 0 } };
const UNKNOWN_COLLECTION_HINT = "Unknown collection? Call directus_collections to list what exists.";

export function registerDirectusTools(server: McpServer) {
  server.registerTool(
    "directus_collections",
    {
      title: "List Directus collections",
      description: "All content collections in the CMS (system collections excluded). Start here for schema discovery.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      run(async () => {
        const res = await directusFetch<{
          data: Array<{ collection: string; meta?: { hidden?: boolean; note?: string | null } | null }>;
        }>("/collections", live);
        return res.data
          .filter((c) => !c.collection.startsWith("directus_"))
          .map((c) => ({ collection: c.collection, note: c.meta?.note ?? null, hidden: c.meta?.hidden ?? false }));
      }),
  );

  server.registerTool(
    "directus_fields",
    {
      title: "List collection fields",
      description: "Field names and types of one Directus collection.",
      inputSchema: { collection: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ collection }) =>
      run(async () => {
        const res = await directusFetch<{
          data: Array<{ field: string; type: string; meta?: { note?: string | null; required?: boolean } | null }>;
        }>(`/fields/${encodeURIComponent(collection)}`, live);
        return res.data.map((f) => ({
          field: f.field,
          type: f.type,
          note: f.meta?.note ?? null,
          required: f.meta?.required ?? false,
        }));
      }, UNKNOWN_COLLECTION_HINT),
  );

  server.registerTool(
    "directus_query",
    {
      title: "Query a Directus collection",
      description:
        "Read items from any collection with Directus filter/sort/search. filter uses Directus operator syntax, e.g. {\"status\":{\"_eq\":\"published\"}}.",
      inputSchema: {
        collection: z.string(),
        fields: z.string().default("*").describe("Comma-separated field list, supports dot-expansion like user.*"),
        filter: z.record(z.string(), z.unknown()).optional(),
        sort: z.string().optional().describe("e.g. -date_created"),
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
        search: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ collection, fields, filter, sort, limit, offset, search }) =>
      run(async () => {
        const params = new URLSearchParams();
        params.set("fields", fields);
        params.set("limit", String(limit));
        if (offset) params.set("offset", String(offset));
        if (sort) params.set("sort", sort);
        if (search) params.set("search", search);
        if (filter) params.set("filter", JSON.stringify(filter));
        const res = await directusFetch<{ data: unknown[] }>(
          `/items/${encodeURIComponent(collection)}?${params.toString()}`,
          live,
        );
        return res.data;
      }, UNKNOWN_COLLECTION_HINT),
  );

  server.registerTool(
    "directus_get_item",
    {
      title: "Get one Directus item",
      description: "Fetch a single item by collection and id.",
      inputSchema: { collection: z.string(), id: z.string(), fields: z.string().default("*") },
      annotations: { readOnlyHint: true },
    },
    async ({ collection, id, fields }) =>
      run(async () => {
        const res = await directusFetch<{ data: unknown }>(
          `/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`,
          live,
        );
        return res.data;
      }, UNKNOWN_COLLECTION_HINT),
  );

  server.registerTool(
    "directus_create_item",
    {
      title: "Create a Directus item",
      description: "Create one item in any collection. Writes production CMS data — check directus_fields first.",
      inputSchema: { collection: z.string(), data: z.record(z.string(), z.unknown()) },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ collection, data }) =>
      run(async () => {
        const res = await directusFetch<{ data: unknown }>(`/items/${encodeURIComponent(collection)}`, {
          ...live,
          method: "POST",
          body: JSON.stringify(data),
        });
        return res.data;
      }, UNKNOWN_COLLECTION_HINT),
  );

  server.registerTool(
    "directus_update_item",
    {
      title: "Update a Directus item",
      description: "Patch fields on one item. Writes production CMS data.",
      inputSchema: { collection: z.string(), id: z.string(), data: z.record(z.string(), z.unknown()) },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ collection, id, data }) =>
      run(async () => {
        const res = await directusFetch<{ data: unknown }>(
          `/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
          { ...live, method: "PATCH", body: JSON.stringify(data) },
        );
        return res.data;
      }, UNKNOWN_COLLECTION_HINT),
  );
}
