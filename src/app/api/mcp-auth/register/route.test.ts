import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.MCP_JWT_SECRET = "test-jwt-secret-0123456789abcdef";
});

const post = async (body: unknown) => {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost:3000/api/mcp-auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
};

describe("POST /api/mcp-auth/register", () => {
  it("registers a client with https redirect uris", async () => {
    const res = await post({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], client_name: "Claude" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(typeof json.client_id).toBe("string");
    expect(json.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
    expect(json.token_endpoint_auth_method).toBe("none");
    const { decodeClientId } = await import("@/lib/mcp/auth");
    expect(decodeClientId(json.client_id)?.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
  });

  it("rejects non-https (non-localhost) redirect uris and empty lists", async () => {
    expect((await post({ redirect_uris: ["http://evil.com/cb"] })).status).toBe(400);
    expect((await post({ redirect_uris: [] })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it("accepts localhost http for dev clients", async () => {
    expect((await post({ redirect_uris: ["http://localhost:33418/cb"] })).status).toBe(201);
  });
});
