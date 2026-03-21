export type ConsentDecision = "accepted" | "rejected";
export type ConsentState = ConsentDecision | null;

const LS_KEY = "cookie_consent";

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return null;
  try {
    const val = localStorage.getItem(LS_KEY);
    if (val === "accepted" || val === "rejected") return val;
  } catch { /* private browsing */ }
  return null;
}
