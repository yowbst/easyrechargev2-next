import { OAuth2Client } from "google-auth-library";

function clientId(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not set");
  return v;
}

export function googleAuthUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<{ email: string | null; emailVerified: boolean }> {
  const client = new OAuth2Client(clientId(), process.env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) return { email: null, emailVerified: false };
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId() });
  const payload = ticket.getPayload();
  return { email: payload?.email ?? null, emailVerified: payload?.email_verified ?? false };
}
