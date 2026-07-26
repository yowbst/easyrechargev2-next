// Quote-form draft persistence: the step number already survives reloads
// via the URL (?step=N), but form data lived only in React state — a
// refresh on step 4 landed the visitor on an empty step 4 with a blocked
// Continue and no explanation. Drafts live in sessionStorage (per-tab,
// cleared on browser exit) with a TTL as a second bound.

export const QUOTE_DRAFT_KEY = "er-quote-draft-v1";
export const QUOTE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const VERSION = 1;

export function serializeQuoteDraft(data: Record<string, unknown>, now: number): string {
  // Consent must be re-affirmed on every submission attempt.
  const rest = { ...data };
  delete rest.acceptTerms;
  return JSON.stringify({ v: VERSION, t: now, data: rest });
}

export function parseQuoteDraft(raw: string | null, now: number): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: number; t?: number; data?: unknown };
    if (parsed.v !== VERSION) return null;
    if (typeof parsed.t !== "number" || now - parsed.t > QUOTE_DRAFT_TTL_MS) return null;
    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) return null;
    return parsed.data as Record<string, unknown>;
  } catch {
    return null;
  }
}
