"use client";

import { useEffect } from "react";
import { getConsent } from "@/lib/consent";

// Google Ads tag (gtag.js) with Consent Mode v2, loaded deferred so it never
// competes with the LCP/hydration path. Config lives in Directus
// site_settings.global_config.google_ads — no tag ID there, no tag loaded.
//
// This exists for remarketing audiences and a fast page-conversion signal;
// authoritative conversion REPORTING stays on the server-side path
// (attribution cookies → form webhook → Make → Data Manager API).

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function consentPayload(decision: string | null) {
  const granted = decision === "accepted";
  return {
    ad_storage: granted ? "granted" : "denied",
    ad_user_data: granted ? "granted" : "denied",
    ad_personalization: granted ? "granted" : "denied",
    // Analytics runs through PostHog, not Google — keep denied.
    analytics_storage: "denied",
  };
}

export function GoogleAdsTag({ tagId }: { tagId?: string | null }) {
  useEffect(() => {
    if (!tagId || window.gtag) return;

    window.dataLayer = window.dataLayer || [];
    // Canonical gtag shim: gtag.js expects Arguments objects in the queue,
    // so this must be a `function` pushing `arguments`, not an array.
    function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    }
    window.gtag = gtag as (...args: unknown[]) => void;

    // Consent defaults MUST be queued before config/events.
    window.gtag("consent", "default", consentPayload(getConsent()));
    window.gtag("js", new Date());
    window.gtag("config", tagId);

    const onConsent = (e: Event) => {
      window.gtag?.("consent", "update", consentPayload((e as CustomEvent).detail));
    };
    window.addEventListener("er:consent", onConsent);

    const load = () => {
      const s = document.createElement("script");
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
      s.async = true;
      document.head.appendChild(s);
    };
    if ("requestIdleCallback" in window) {
      requestIdleCallback(load, { timeout: 5000 });
    } else {
      setTimeout(load, 3000);
    }

    return () => window.removeEventListener("er:consent", onConsent);
  }, [tagId]);

  return null;
}
