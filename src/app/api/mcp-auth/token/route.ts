import { NextResponse } from "next/server";
import { isAllowedEmail, issueTokens, readAuthCode, readRefreshToken, verifyPkceS256 } from "@/lib/mcp/auth";

function oauthError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function readParams(req: Request): Promise<URLSearchParams | null> {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await req.json()) as Record<string, unknown>;
      return new URLSearchParams(
        Object.entries(j).filter((e): e is [string, string] => typeof e[1] === "string"),
      );
    }
    return new URLSearchParams(await req.text());
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const p = await readParams(req);
  if (!p) return oauthError("invalid_request");

  const grant = p.get("grant_type");

  if (grant === "authorization_code") {
    const code = readAuthCode(p.get("code") ?? "");
    if (!code) {
      console.warn(`[mcp-auth/token] authorization_code invalid_grant reason=bad_code hasCode=${!!p.get("code")}`);
      return oauthError("invalid_grant");
    }
    if (!verifyPkceS256(p.get("code_verifier") ?? "", code.codeChallenge)) {
      console.warn(`[mcp-auth/token] authorization_code invalid_grant reason=pkce_mismatch hasVerifier=${!!p.get("code_verifier")}`);
      return oauthError("invalid_grant");
    }
    const clientId = p.get("client_id");
    if (clientId && clientId !== code.clientId) {
      console.warn(`[mcp-auth/token] authorization_code invalid_client reason=client_id_mismatch sent=${clientId} expected=${code.clientId}`);
      return oauthError("invalid_client", 401);
    }
    const redirectUri = p.get("redirect_uri");
    if (redirectUri && redirectUri !== code.redirectUri) {
      console.warn(`[mcp-auth/token] authorization_code invalid_grant reason=redirect_uri_mismatch sent=${redirectUri} expected=${code.redirectUri}`);
      return oauthError("invalid_grant");
    }
    console.log(`[mcp-auth/token] authorization_code success email=${code.email}`);
    return NextResponse.json(issueTokens(code.email, code.clientId));
  }

  if (grant === "refresh_token") {
    const r = readRefreshToken(p.get("refresh_token") ?? "");
    if (!r || !isAllowedEmail(r.email)) {
      console.warn(`[mcp-auth/token] refresh_token invalid_grant valid=${!!r} allowed=${r ? isAllowedEmail(r.email) : false}`);
      return oauthError("invalid_grant");
    }
    console.log(`[mcp-auth/token] refresh_token success email=${r.email}`);
    return NextResponse.json(issueTokens(r.email, r.clientId));
  }

  console.warn(`[mcp-auth/token] unsupported_grant_type grant=${grant ?? "none"}`);
  return oauthError("unsupported_grant_type");
}
