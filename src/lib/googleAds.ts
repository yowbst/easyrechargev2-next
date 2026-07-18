// Client-side Google Ads conversion helpers. The tag itself is loaded by
// GoogleAdsTag (Consent Mode v2, idle-loaded); config comes from Directus
// site_settings.global_config.google_ads:
//   { tag_id, labels: { lead_submit, contact_submit, quote_start } }
// A conversion only fires when tag_id and the relevant label are set.

export interface GoogleAdsConfig {
  tag_id?: string | null;
  lead_conversion_label?: string | null; // legacy single-label field
  labels?: {
    lead_submit?: string | null;
    contact_submit?: string | null;
    quote_start?: string | null;
  } | null;
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
  label: keyof NonNullable<GoogleAdsConfig["labels"]>,
): string | null {
  const l =
    config?.labels?.[label] ??
    (label === "lead_submit" ? config?.lead_conversion_label : null);
  return config?.tag_id && l ? `${config.tag_id}/${l}` : null;
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
