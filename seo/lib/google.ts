import { google } from "googleapis";
import { requireEnv } from "./config";

/**
 * Service-account auth. Uses the dedicated `SEO_GOOGLE_SERVICE_ACCOUNT_*` pair
 * (seo-agent, read-only on Search Console) and falls back to the invoicing
 * account's `GOOGLE_SERVICE_ACCOUNT_*` (`src/lib/billing/google-docs.ts`).
 * The key is a PEM with literal `\n` escapes. The account must be a user on the
 * Search Console property and an Editor on the Sheet.
 */
export function googleAuth(scopes: string[]) {
  const dedicated = !!process.env.SEO_GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const prefix = dedicated ? "SEO_GOOGLE_SERVICE_ACCOUNT" : "GOOGLE_SERVICE_ACCOUNT";
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: requireEnv(`${prefix}_EMAIL`),
      private_key: requireEnv(`${prefix}_KEY`).replace(/\\n/g, "\n"),
    },
    scopes,
  });
}
