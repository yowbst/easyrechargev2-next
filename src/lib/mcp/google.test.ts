import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client.apps.googleusercontent.com";
});

describe("googleAuthUrl", () => {
  it("builds the Google authorize URL with openid email scope and state", async () => {
    const { googleAuthUrl } = await import("./google");
    const url = new URL(googleAuthUrl("STATE123", "https://easyrecharge.ch/api/mcp-auth/callback"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-client.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe("https://easyrecharge.ch/api/mcp-auth/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("state")).toBe("STATE123");
  });
});
