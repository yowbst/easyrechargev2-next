import { NextResponse } from "next/server";
import { decodeClientId, requestBaseUrl, signState } from "@/lib/mcp/auth";
import { googleAuthUrl } from "@/lib/mcp/google";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri") ?? "";
  const state = q.get("state") ?? "";

  const client = decodeClientId(clientId);
  if (!client) return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  if (!client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  // redirect_uri is trusted from here on — protocol errors go back to the client
  if (q.get("response_type") !== "code" || !q.get("code_challenge") || q.get("code_challenge_method") !== "S256") {
    const u = new URL(redirectUri);
    u.searchParams.set("error", "invalid_request");
    if (state) u.searchParams.set("state", state);
    return NextResponse.redirect(u);
  }

  const googleState = signState({ cid: clientId, uri: redirectUri, cch: q.get("code_challenge")!, st: state });
  const callback = `${requestBaseUrl(req)}/api/mcp-auth/callback`;
  return NextResponse.redirect(googleAuthUrl(googleState, callback));
}
