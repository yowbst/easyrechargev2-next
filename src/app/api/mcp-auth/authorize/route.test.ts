import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.MCP_JWT_SECRET = "test-jwt-secret-0123456789abcdef";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client.apps.googleusercontent.com";
});

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

async function authorize(overrides: Record<string, string | null> = {}) {
  const { encodeClientId } = await import("@/lib/mcp/auth");
  const { GET } = await import("./route");
  const params: Record<string, string> = {
    client_id: encodeClientId({ redirect_uris: [CALLBACK] }),
    redirect_uri: CALLBACK,
    response_type: "code",
    code_challenge: "fake-challenge-value",
    code_challenge_method: "S256",
    state: "client-state-1",
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) delete params[k];
    else params[k] = v;
  }
  const url = `http://localhost:3000/api/mcp-auth/authorize?${new URLSearchParams(params)}`;
  return GET(new Request(url, { headers: { host: "localhost:3000" } }));
}

describe("GET /api/mcp-auth/authorize", () => {
  it("redirects a valid request to Google with a signed state", async () => {
    const res = await authorize();
    expect(res.status).toBeGreaterThanOrEqual(302);
    expect(res.status).toBeLessThan(400);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(loc.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/mcp-auth/callback");
    const { readState } = await import("@/lib/mcp/auth");
    const st = readState(loc.searchParams.get("state")!);
    expect(st?.uri).toBe(CALLBACK);
    expect(st?.cch).toBe("fake-challenge-value");
    expect(st?.st).toBe("client-state-1");
  });

  it("400s on an invalid client_id", async () => {
    expect((await authorize({ client_id: "forged" })).status).toBe(400);
  });

  it("400s on a redirect_uri not registered in the client_id", async () => {
    expect((await authorize({ redirect_uri: "https://evil.com/cb" })).status).toBe(400);
  });

  it("redirects back with error=invalid_request when PKCE is missing or not S256", async () => {
    const badPkce: Array<Record<string, string | null>> = [
      { code_challenge: null },
      { code_challenge_method: "plain" },
    ];
    for (const bad of badPkce) {
      const res = await authorize(bad);
      const loc = new URL(res.headers.get("location")!);
      expect(loc.origin).toBe("https://claude.ai");
      expect(loc.searchParams.get("error")).toBe("invalid_request");
      expect(loc.searchParams.get("state")).toBe("client-state-1");
    }
  });
});
