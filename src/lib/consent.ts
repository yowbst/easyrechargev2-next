export type ConsentDecision = "accepted" | "rejected";
export type ConsentState = ConsentDecision | null;

export const CONSENT_STORAGE_KEY = "cookie-consent";

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return null;
  try {
    const val = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (val === "accepted" || val === "rejected") return val;
  } catch { /* private browsing */ }
  return null;
}
