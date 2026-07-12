import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { serverLog } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATAMANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager";

// Lazily-created, cached per warm instance. google-auth-library caches the
// access token and refreshes it internally, so per-request calls are cheap.
let auth: GoogleAuth | null = null;
function getAuth(): GoogleAuth {
  if (auth) return auth;
  const raw = process.env.DATAMANAGER_SA_JSON;
  if (!raw) throw new Error("DATAMANAGER_SA_JSON is not set");
  auth = new GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: [DATAMANAGER_SCOPE],
  });
  return auth;
}

/**
 * Mints a short-lived datamanager-scoped access token for Make to Bearer-auth
 * the Data Manager events:ingest call. Gated by DATAMANAGER_ENDPOINT_SECRET.
 *
 *   curl -H "x-datamanager-secret: $DATAMANAGER_ENDPOINT_SECRET" \
 *     "https://easyrecharge.ch/api/datamanager-token"
 */
export async function GET(req: Request) {
  const secret = process.env.DATAMANAGER_ENDPOINT_SECRET;
  const header = req.headers.get("x-datamanager-secret");
  if (!secret || header !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const client = await getAuth().getClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("no access token returned");
    const creds = (client as { credentials?: { expiry_date?: number | null } })
      .credentials;
    const expiryMs = creds?.expiry_date ?? null;
    const expires_at =
      typeof expiryMs === "number" ? new Date(expiryMs).toISOString() : null;
    return NextResponse.json(
      { access_token: token, expires_at },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    serverLog("ERROR", "datamanager-token mint failed", {
      route: "datamanager-token",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
