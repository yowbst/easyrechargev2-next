"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Fires a Google Ads conversion event once per submission (quote success
// page). Renders nothing; inert unless the Directus google_ads config has
// both tag_id and lead_conversion_label. The transaction_id lets Google
// dedupe this browser signal against the offline Data Manager upload for
// the same lead.
//
// Waits for window.gtag: this child effect runs before the layout-level
// GoogleAdsTag effect, and events queued before the consent defaults
// would be dropped.
export function GoogleAdsConversion({ sendTo }: { sendTo?: string | null }) {
  const searchParams = useSearchParams();
  const submissionId = searchParams.get("submissionId") || undefined;

  useEffect(() => {
    if (!sendTo) return;
    const guardKey = `er-ads-conv-${submissionId || "unknown"}`;
    try {
      if (sessionStorage.getItem(guardKey)) return;
    } catch {
      /* private browsing — transaction_id still dedupes server-side */
    }

    let cancelled = false;
    let attempts = 0;
    const fire = () => {
      if (cancelled) return;
      if (window.gtag) {
        window.gtag("event", "conversion", {
          send_to: sendTo,
          transaction_id: submissionId,
        });
        try {
          sessionStorage.setItem(guardKey, "1");
        } catch { /* ignore */ }
      } else if (attempts++ < 100) {
        setTimeout(fire, 100);
      }
    };
    fire();
    return () => {
      cancelled = true;
    };
  }, [sendTo, submissionId]);

  return null;
}
