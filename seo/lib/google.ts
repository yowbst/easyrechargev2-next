import { google } from "googleapis";
import { requireEnv } from "./config";

/**
 * Service-account auth built from the same env vars as invoicing
 * (`src/lib/billing/google-docs.ts`): the key is a PEM with literal `\n` escapes.
 * The service account must be added to the Search Console property and the Sheet.
 */
export function googleAuth(scopes: string[]) {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      private_key: requireEnv("GOOGLE_SERVICE_ACCOUNT_KEY").replace(/\\n/g, "\n"),
    },
    scopes,
  });
}
