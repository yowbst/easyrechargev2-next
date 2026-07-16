import { beforeAll, describe, expect, it, vi } from "vitest";

const exchangeGoogleCode = vi.fn();
vi.mock("@/lib/mcp/google", () => ({
  exchangeGoogleCode: (...args: unknown[]) => exchangeGoogleCode(...args),
  googleAuthUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
}));

beforeAll(() => {
  process.env.MCP_JWT_SECRET = "test-jwt-secret-0123456789abcdef";
  delete process.env.MCP_ALLOWED_EMAILS;
});

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

async function hitCallback() {
  const { signState } = await import("@/lib/mcp/auth");
  const { GET } = await import("./route");
  const state = signState({ cid: "cid-1", uri: CALLBACK, cch: "cch-1", st: "client-state" });
  const url = `http://localhost:3000/api/mcp-auth/callback?code=googlecode&state=${encodeURIComponent(state)}`;
  return GET(new Request(url, { headers: { host: "localhost:3000" } }));
}

describe("GET /api/mcp-auth/callback", () => {
  it("issues an auth code and redirects for the allowlisted account", async () => {
    exchangeGoogleCode.mockResolvedValueOnce({ email: "yoan@easyrecharge.ch", emailVerified: true });
    const res = await hitCallback();
    expect(res.status).toBeGreaterThanOrEqual(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe(CALLBACK);
    expect(loc.searchParams.get("state")).toBe("client-state");
    const { readAuthCode } = await import("@/lib/mcp/auth");
    const code = readAuthCode(loc.searchParams.get("code")!);
    expect(code).toEqual({
      email: "yoan@easyrecharge.ch",
      clientId: "cid-1",
      redirectUri: CALLBACK,
      codeChallenge: "cch-1",
    });
  });

  it("403s any other Google account", async () => {
    exchangeGoogleCode.mockResolvedValueOnce({ email: "intruder@gmail.com", emailVerified: true });
    expect((await hitCallback()).status).toBe(403);
  });

  it("403s unverified emails", async () => {
    exchangeGoogleCode.mockResolvedValueOnce({ email: "yoan@easyrecharge.ch", emailVerified: false });
    expect((await hitCallback()).status).toBe(403);
  });

  it("400s a bad state and 502s a failed Google exchange", async () => {
    const { GET } = await import("./route");
    const bad = await GET(new Request("http://localhost:3000/api/mcp-auth/callback?code=x&state=forged"));
    expect(bad.status).toBe(400);
    exchangeGoogleCode.mockRejectedValueOnce(new Error("boom"));
    expect((await hitCallback()).status).toBe(502);
  });
});
