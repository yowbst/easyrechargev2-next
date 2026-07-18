"use client";

import { useState, useCallback, useEffect } from "react";
import { CONSENT_STORAGE_KEY, getConsent } from "@/lib/consent";

export { getConsent };

export function useCookieConsent() {
  const [hasDecided, setHasDecided] = useState(true); // default true to avoid flash

  useEffect(() => {
    setHasDecided(getConsent() !== null);
  }, []);

  const accept = useCallback(() => {
    localStorage.setItem(CONSENT_STORAGE_KEY, "accepted");
    setHasDecided(true);
    // Same-tab listeners (e.g. GoogleAdsTag consent mode) — storage events
    // only fire in other tabs.
    window.dispatchEvent(new CustomEvent("er:consent", { detail: "accepted" }));
  }, []);

  const reject = useCallback(() => {
    localStorage.setItem(CONSENT_STORAGE_KEY, "rejected");
    setHasDecided(true);
    window.dispatchEvent(new CustomEvent("er:consent", { detail: "rejected" }));
  }, []);

  return { hasDecided, accept, reject };
}
