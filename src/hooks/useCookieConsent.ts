"use client";

import { useState, useCallback, useEffect } from "react";

const CONSENT_KEY = "cookie-consent";
type ConsentState = "accepted" | "rejected" | null;

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CONSENT_KEY) as ConsentState;
}

export function useCookieConsent() {
  const [hasDecided, setHasDecided] = useState(true); // default true to avoid flash

  useEffect(() => {
    setHasDecided(getConsent() !== null);
  }, []);

  const accept = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setHasDecided(true);
  }, []);

  const reject = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, "rejected");
    setHasDecided(true);
  }, []);

  return { hasDecided, accept, reject };
}
