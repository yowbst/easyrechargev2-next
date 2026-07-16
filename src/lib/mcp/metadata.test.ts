import { describe, expect, it } from "vitest";
import { authorizationServerMetadata, protectedResourceMetadata } from "./metadata";

describe("oauth metadata", () => {
  it("authorization server metadata points at mcp-auth endpoints", () => {
    const m = authorizationServerMetadata("https://easyrecharge.ch");
    expect(m.issuer).toBe("https://easyrecharge.ch");
    expect(m.authorization_endpoint).toBe("https://easyrecharge.ch/api/mcp-auth/authorize");
    expect(m.token_endpoint).toBe("https://easyrecharge.ch/api/mcp-auth/token");
    expect(m.registration_endpoint).toBe("https://easyrecharge.ch/api/mcp-auth/register");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(m.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });

  it("protected resource metadata names /api/mcp and the AS", () => {
    const m = protectedResourceMetadata("https://easyrecharge.ch");
    expect(m.resource).toBe("https://easyrecharge.ch/api/mcp");
    expect(m.authorization_servers).toEqual(["https://easyrecharge.ch"]);
    expect(m.bearer_methods_supported).toEqual(["header"]);
  });
});
