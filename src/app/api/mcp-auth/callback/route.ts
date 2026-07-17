import { NextResponse } from "next/server";
import { isAllowedEmail, issueAuthCode, readState, requestBaseUrl } from "@/lib/mcp/auth";
import { exchangeGoogleCode } from "@/lib/mcp/google";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const code = q.get("code");
  const state = readState(q.get("state") ?? "");
  if (!state || !code) {
    console.warn(
      `[mcp-auth/callback] bad_request hasCode=${!!code} hasState=${!!q.get("state")} stateValid=${!!state} googleError=${q.get("error") ?? "none"}`,
    );
    return new NextResponse("Invalid or expired OAuth state. Please retry connecting.", { status: 400 });
  }

  let email: string | null;
  let emailVerified: boolean;
  try {
    ({ email, emailVerified } = await exchangeGoogleCode(code, `${requestBaseUrl(req)}/api/mcp-auth/callback`));
  } catch (err) {
    console.error("[mcp-auth/callback] google_exchange_failed", err instanceof Error ? err.message : err);
    return new NextResponse("Google sign-in failed. Please retry.", { status: 502 });
  }

  if (!email || !emailVerified || !isAllowedEmail(email)) {
    console.warn(
      `[mcp-auth/callback] denied email=${email ?? "null"} verified=${emailVerified} allowed=${email ? isAllowedEmail(email) : false}`,
    );
    return new NextResponse(
      `Access denied for ${email ?? "unknown account"}. This MCP server is restricted to authorized accounts.`,
      { status: 403 },
    );
  }
  console.log(`[mcp-auth/callback] success email=${email} redirect=${state.uri}`);

  const authCode = issueAuthCode({
    email,
    clientId: state.cid,
    redirectUri: state.uri,
    codeChallenge: state.cch,
  });
  const target = new URL(state.uri);
  target.searchParams.set("code", authCode);
  if (state.st) target.searchParams.set("state", state.st);
  return NextResponse.redirect(target);
}
