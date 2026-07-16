import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.MCP_JWT_SECRET = "test-jwt-secret-0123456789abcdef";
  process.env.MCP_STATIC_TOKEN = "test-static-token-0123456789abcdef";
  delete process.env.MCP_ALLOWED_EMAILS;
});

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "verifier-string-that-is-long-enough-for-pkce-42";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

async function postToken(params: Record<string, string>) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost:3000/api/mcp-auth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    }),
  );
}

async function freshCode() {
  const { issueAuthCode } = await import("@/lib/mcp/auth");
  return issueAuthCode({
    email: "yoan@easyrecharge.ch",
    clientId: "cid-1",
    redirectUri: CALLBACK,
    codeChallenge: CHALLENGE,
  });
}

describe("POST /api/mcp-auth/token", () => {
  it("exchanges a valid code + PKCE verifier for tokens usable against the MCP endpoint", async () => {
    const res = await postToken({
      grant_type: "authorization_code",
      code: await freshCode(),
      code_verifier: VERIFIER,
      client_id: "cid-1",
      redirect_uri: CALLBACK,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token_type).toBe("bearer");
    const { verifyMcpToken } = await import("@/lib/mcp/auth");
    const info = await verifyMcpToken(new Request("http://x"), json.access_token);
    expect(info?.clientId).toBe("yoan@easyrecharge.ch");
    expect(typeof json.refresh_token).toBe("string");
  });

  it("rejects a wrong PKCE verifier", async () => {
    const res = await postToken({
      grant_type: "authorization_code",
      code: await freshCode(),
      code_verifier: "wrong-verifier",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("rejects mismatched client_id / redirect_uri when supplied", async () => {
    const base = { grant_type: "authorization_code", code: await freshCode(), code_verifier: VERIFIER };
    expect((await postToken({ ...base, client_id: "other" })).status).toBe(401);
    expect((await postToken({ ...base, redirect_uri: "https://evil.com/cb" })).status).toBe(400);
  });

  it("refresh_token grant rotates tokens", async () => {
    const first = await (
      await postToken({ grant_type: "authorization_code", code: await freshCode(), code_verifier: VERIFIER })
    ).json();
    const res = await postToken({ grant_type: "refresh_token", refresh_token: first.refresh_token });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.access_token).toBe("string");
  });

  it("rejects unknown grants and garbage codes", async () => {
    expect((await postToken({ grant_type: "password" })).status).toBe(400);
    expect(
      (await postToken({ grant_type: "authorization_code", code: "junk", code_verifier: VERIFIER })).status,
    ).toBe(400);
  });
});
