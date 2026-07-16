import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fetchBlogPost,
  fetchBlogPosts,
  fetchPageRegistry,
  fetchVehicle,
  fetchVehicleBrands,
  fetchVehicles,
  fetchVehiclesByBrand,
} from "@/lib/directus-queries";
import { storage } from "@/lib/directus-storage";
import { slugToDirectusLocale } from "@/lib/i18n/config";
import { hasChargingSubsidy, searchLocalitiesDirectus } from "@/lib/localities-server";
import { run } from "./helpers";

const locale = z.enum(["fr", "de"]).default("fr").describe("Content language");

export function registerCmsTools(server: McpServer) {
  server.registerTool(
    "list_blog_posts",
    {
      title: "List blog posts",
      description: "Published blog posts with translations, category, tags, author.",
      inputSchema: { locale, category: z.string().optional().describe("Category id filter") },
      annotations: { readOnlyHint: true },
    },
    async ({ locale: lang, category }) => run(() => fetchBlogPosts(slugToDirectusLocale(lang), category)),
  );

  server.registerTool(
    "get_blog_post",
    {
      title: "Get blog post",
      description: "One published blog post by slug (slug matches any language).",
      inputSchema: { slug: z.string(), locale },
      annotations: { readOnlyHint: true },
    },
    async ({ slug, locale: lang }) =>
      run(async () => (await fetchBlogPost(slug, slugToDirectusLocale(lang))) ?? { notFound: slug }),
  );

  server.registerTool(
    "list_vehicles",
    {
      title: "List vehicles",
      description: "All published EVs (list fields: model, battery, range, charging, brand). Optional brand filter.",
      inputSchema: { locale, brand: z.string().optional().describe("Brand slug, e.g. 'tesla'") },
      annotations: { readOnlyHint: true },
    },
    async ({ locale: lang, brand }) =>
      run(() =>
        brand ? fetchVehiclesByBrand(brand, slugToDirectusLocale(lang)) : fetchVehicles(slugToDirectusLocale(lang)),
      ),
  );

  server.registerTool(
    "get_vehicle",
    {
      title: "Get vehicle",
      description: "Full spec sheet of one published vehicle by slug.",
      inputSchema: { slug: z.string(), locale },
      annotations: { readOnlyHint: true },
    },
    async ({ slug, locale: lang }) =>
      run(async () => (await fetchVehicle(slug, slugToDirectusLocale(lang))) ?? { notFound: slug }),
  );

  server.registerTool(
    "list_vehicle_brands",
    {
      title: "List vehicle brands",
      description: "All published vehicle brands.",
      inputSchema: { locale },
      annotations: { readOnlyHint: true },
    },
    async ({ locale: lang }) => run(() => fetchVehicleBrands(slugToDirectusLocale(lang))),
  );

  server.registerTool(
    "list_pages",
    {
      title: "List CMS pages",
      description: "Page registry: route_id, page type, and fr/de slugs for every page.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => fetchPageRegistry()),
  );

  server.registerTool(
    "list_form_submissions",
    {
      title: "List form submissions",
      description:
        "Recent form submissions (quote/contact/mini-quote) with user + session expanded. Contains client PII — handle accordingly. environment defaults to the current deploy environment; pass 'all' to disable the filter.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(20),
        formType: z.enum(["quote", "contact", "mini-quote-card"]).optional(),
        status: z.string().optional(),
        environment: z.enum(["development", "staging", "production", "all"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => run(() => storage.listSubmissions(args)),
  );

  server.registerTool(
    "search_localities",
    {
      title: "Search Swiss localities",
      description: "Search localities by name or postal code (min 2 chars).",
      inputSchema: { query: z.string(), limit: z.number().int().min(1).max(50).default(8), locale },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit, locale: lang }) =>
      run(() => searchLocalitiesDirectus(query, { limit, locale: slugToDirectusLocale(lang) })),
  );

  server.registerTool(
    "get_locality_subsidies",
    {
      title: "Check locality charging subsidy",
      description: "Whether a locality (by Directus id) has a personal charging-infrastructure subsidy.",
      inputSchema: { localityId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ localityId }) =>
      run(async () => ({ localityId, hasChargingSubsidy: await hasChargingSubsidy(localityId) })),
  );
}
