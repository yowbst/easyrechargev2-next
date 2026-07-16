import { NextResponse } from "next/server";
import { encodeClientId } from "@/lib/mcp/auth";

function isAcceptableRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }
  const uris = Array.isArray(body?.redirect_uris)
    ? (body.redirect_uris as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  if (uris.length === 0 || !uris.every(isAcceptableRedirect)) {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }
  return NextResponse.json(
    {
      client_id: encodeClientId({ redirect_uris: uris }),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      ...(typeof body.client_name === "string" ? { client_name: body.client_name } : {}),
    },
    { status: 201 },
  );
}
