import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.MCP_JWT_SECRET = "test-jwt-secret-0123456789abcdef";
  process.env.MCP_STATIC_TOKEN = "test-static-token-0123456789abcdef";
  delete process.env.MCP_ALLOWED_EMAILS;
});

describe("auth", () => {
  it("client_id round-trips and rejects tampering", async () => {
    const { encodeClientId, decodeClientId } = await import("./auth");
    const cid = encodeClientId({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
    expect(decodeClientId(cid)?.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
    expect(decodeClientId(cid.slice(0, -2) + "xx")).toBeNull();
    expect(decodeClientId("garbage")).toBeNull();
  });

  it("verifies PKCE S256", async () => {
    const { verifyPkceS256 } = await import("./auth");
    const verifier = "some-verifier-string-that-is-long-enough-42";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256("wrong-verifier", challenge)).toBe(false);
  });

  it("allowlists only the configured email (default yoan@easyrecharge.ch)", async () => {
    const { isAllowedEmail } = await import("./auth");
    expect(isAllowedEmail("yoan@easyrecharge.ch")).toBe(true);
    expect(isAllowedEmail("YOAN@easyrecharge.ch")).toBe(true);
    expect(isAllowedEmail("someone@easyrecharge.ch")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
  });

  it("auth code round-trips its claims", async () => {
    const { issueAuthCode, readAuthCode } = await import("./auth");
    const code = issueAuthCode({
      email: "yoan@easyrecharge.ch",
      clientId: "cid",
      redirectUri: "https://claude.ai/cb",
      codeChallenge: "cch",
    });
    expect(readAuthCode(code)).toEqual({
      email: "yoan@easyrecharge.ch",
      clientId: "cid",
      redirectUri: "https://claude.ai/cb",
      codeChallenge: "cch",
    });
  });

  it("an access token is not accepted as a refresh token (typ confusion)", async () => {
    const { issueTokens, readRefreshToken } = await import("./auth");
    const t = issueTokens("yoan@easyrecharge.ch", "cid");
    expect(readRefreshToken(t.access_token)).toBeNull();
    expect(readRefreshToken(t.refresh_token)).toEqual({ email: "yoan@easyrecharge.ch", clientId: "cid" });
  });

  it("verifyMcpToken accepts static token, OAuth access token; rejects junk and refresh tokens", async () => {
    const { verifyMcpToken, issueTokens } = await import("./auth");
    const req = new Request("http://localhost/api/mcp");
    expect(await verifyMcpToken(req, process.env.MCP_STATIC_TOKEN)).toMatchObject({ clientId: "static-token" });
    const t = issueTokens("yoan@easyrecharge.ch", "cid");
    expect(await verifyMcpToken(req, t.access_token)).toMatchObject({ clientId: "yoan@easyrecharge.ch" });
    expect(await verifyMcpToken(req, t.refresh_token)).toBeUndefined();
    expect(await verifyMcpToken(req, "nonsense")).toBeUndefined();
    expect(await verifyMcpToken(req, undefined)).toBeUndefined();
  });

  it("requestBaseUrl honors forwarded headers and localhost", async () => {
    const { requestBaseUrl } = await import("./auth");
    expect(
      requestBaseUrl(
        new Request("http://internal/api/x", {
          headers: { "x-forwarded-host": "easyrecharge.ch", "x-forwarded-proto": "https" },
        }),
      ),
    ).toBe("https://easyrecharge.ch");
    expect(requestBaseUrl(new Request("http://localhost:3000/api/x", { headers: { host: "localhost:3000" } }))).toBe(
      "http://localhost:3000",
    );
  });
});
