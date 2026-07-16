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
    if (!code) return oauthError("invalid_grant");
    if (!verifyPkceS256(p.get("code_verifier") ?? "", code.codeChallenge)) return oauthError("invalid_grant");
    const clientId = p.get("client_id");
    if (clientId && clientId !== code.clientId) return oauthError("invalid_client", 401);
    const redirectUri = p.get("redirect_uri");
    if (redirectUri && redirectUri !== code.redirectUri) return oauthError("invalid_grant");
    return NextResponse.json(issueTokens(code.email, code.clientId));
  }

  if (grant === "refresh_token") {
    const r = readRefreshToken(p.get("refresh_token") ?? "");
    if (!r || !isAllowedEmail(r.email)) return oauthError("invalid_grant");
    return NextResponse.json(issueTokens(r.email, r.clientId));
  }

  return oauthError("unsupported_grant_type");
}
