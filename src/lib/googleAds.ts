// Client-side Google Ads conversion helpers. The tag itself is loaded by
// GoogleAdsTag (Consent Mode v2, idle-loaded); config comes from Directus
// site_settings.global_config.google_ads:
//   { tag_id, conversions: { <product>: { <event>: { label, ...metadata } } } }
// Only `label` is functional — the other conversion fields document the
// Ads-side setup (action_name, category, optimization, enhanced_conversions).
// A conversion only fires when tag_id and the product+event label are set.

import { DEFAULT_PRODUCT, type Product } from "@/lib/products";

export type GoogleAdsEvent = "quote_submit" | "quote_start" | "contact_submit";

export interface GoogleAdsConversionEntry {
  label?: string | null;
  action_name?: string;
  category?: string;
  optimization?: "primary" | "secondary";
  enhanced_conversions?: boolean;
}

export interface GoogleAdsConfig {
  tag_id?: string | null;
  account_id?: string | null;
  conversions?: Partial<
    Record<Product, Partial<Record<GoogleAdsEvent, GoogleAdsConversionEntry | null>> | null>
  > | null;
}

/** User-provided data for enhanced conversions for leads. Passed RAW —
 * gtag.js normalizes and SHA-256 hashes it client-side before sending,
 * and drops it entirely while ad_user_data consent is denied. */
export interface AdsUserData {
  email?: string;
  phone_number?: string; // E.164 preferred
  address?: {
    first_name?: string;
    last_name?: string;
    postal_code?: string;
    country?: string;
  };
}

export function adsSendTo(
  config: GoogleAdsConfig | undefined | null,
  event: GoogleAdsEvent,
  product: Product = DEFAULT_PRODUCT,
): string | null {
  const label = config?.conversions?.[product]?.[event]?.label;
  return config?.tag_id && label ? `${config.tag_id}/${label}` : null;
}

/**
 * Fire a conversion, waiting for the gtag shim if needed. `onDone` is
 * called exactly once — after the hit is sent (event_callback) or after
 * `timeoutMs`, so callers can safely navigate away.
 */
export function fireAdsConversion(
  sendTo: string,
  opts: {
    transactionId?: string;
    userData?: AdsUserData;
    onDone?: () => void;
    timeoutMs?: number;
  } = {},
): void {
  const { transactionId, userData, onDone, timeoutMs = 600 } = opts;

  let done = false;
  const finish = () => {
    if (!done) {
      done = true;
      onDone?.();
    }
  };

  // Once per session per action+transaction (Google also dedupes same
  // transaction_id within a conversion action server-side).
  try {
    const key = `er-ads-${sendTo}-${transactionId || "na"}`;
    if (sessionStorage.getItem(key)) return finish();
    sessionStorage.setItem(key, "1");
  } catch {
    /* private browsing — server-side dedupe still applies */
  }

  const deadline = onDone ? setTimeout(finish, timeoutMs) : null;

  let attempts = 0;
  const attempt = () => {
    if (window.gtag) {
      if (userData) window.gtag("set", "user_data", userData);
      window.gtag("event", "conversion", {
        send_to: sendTo,
        ...(transactionId ? { transaction_id: transactionId } : {}),
        event_callback: () => {
          if (deadline) clearTimeout(deadline);
          finish();
        },
      });
    } else if (attempts++ < 100) {
      setTimeout(attempt, 100);
    } else {
      finish();
    }
  };
  attempt();
}
