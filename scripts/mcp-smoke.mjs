/* Smoke test: initialize → tools/list → call a read tool. Also asserts 401 without a token.
   Usage: MCP_URL=http://localhost:3000/api/mcp MCP_STATIC_TOKEN=... node scripts/mcp-smoke.mjs */
const BASE = process.env.MCP_URL ?? "http://localhost:3000/api/mcp";
const TOKEN = process.env.MCP_STATIC_TOKEN;
if (!TOKEN) {
  console.error("Set MCP_STATIC_TOKEN");
  process.exit(1);
}

let sessionId = null;

async function rpc(method, params, id) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${TOKEN}`,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  sessionId = res.headers.get("mcp-session-id") ?? sessionId;
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (id === undefined) return null; // notification, no body expected
  const payload = text.startsWith("event:") || text.includes("\ndata:") || text.startsWith("data:")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("")
    : text;
  const json = JSON.parse(payload);
  if (json.error) throw new Error(`${method} → RPC error: ${JSON.stringify(json.error)}`);
  return json.result;
}

// 1. Unauthenticated request must 401
const unauth = await fetch(BASE, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }),
});
if (unauth.status !== 401) throw new Error(`Expected 401 without token, got ${unauth.status}`);
console.log("✓ 401 without token");

// 2. Initialize
const init = await rpc(
  "initialize",
  {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.0" },
  },
  1,
);
console.log(`✓ initialized: ${init.serverInfo.name} ${init.serverInfo.version}`);
await rpc("notifications/initialized", {});

// 3. List tools
const tools = await rpc("tools/list", {}, 2);
const names = tools.tools.map((t) => t.name).sort();
console.log(`✓ ${names.length} tools: ${names.join(", ")}`);
const expected = [
  "directus_collections", "directus_create_item", "directus_fields", "directus_get_item",
  "directus_query", "directus_update_item", "dispatch_submission", "get_api_docs",
  "get_billing", "get_blog_post", "get_form_submission", "get_locality_subsidies",
  "get_vehicle", "list_blog_posts", "list_dispatches", "list_form_submissions",
  "list_pages", "list_site_urls", "list_vehicle_brands", "list_vehicles",
  "reconcile_billing", "search_localities", "submit_contact", "submit_mini_quote", "submit_quote",
];
const missing = expected.filter((n) => !names.includes(n));
if (missing.length) throw new Error(`Missing tools: ${missing.join(", ")}`);
console.log("✓ all expected tools registered");

// 4. Call a read tool
const pages = await rpc("tools/call", { name: "list_pages", arguments: {} }, 3);
const parsed = JSON.parse(pages.content[0].text);
if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("list_pages returned no pages");
console.log(`✓ list_pages returned ${parsed.length} pages (e.g. ${parsed[0].id})`);

console.log("\nSmoke test passed.");
