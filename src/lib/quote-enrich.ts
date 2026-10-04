import { createHmac, timingSafeEqual } from "node:crypto";
import { ENRICH_FIELDS, ENRICH_FIELD_KEYS, type EnrichField, type EnrichRule } from "./quote-enrich-fields";

export { ENRICH_FIELDS, ENRICH_FIELD_KEYS, type EnrichField };

/**
 * Post-submit enrichment of a charger quote (funnel v2, flag `quote-enrich`):
 * the six questions removed from the funnel come back as optional answers
 * written onto the submission already sent. Server-side rules live here.
 */

/** How long after the submission the visitor may still add answers. */
export const ENRICH_WINDOW_MS = 2 * 60 * 60 * 1000;

function valid(rule: EnrichRule, v: unknown): boolean {
  if (rule.kind === "choice") return typeof v === "string" && rule.values.includes(v);
  // Numeric buckets also accept "don't know".
  return v === "na" || (typeof v === "number" && Number.isFinite(v) && v >= rule.min && v <= rule.max);
}

/** Keeps the known fields with an accepted value; anything else is dropped. */
export function sanitizeEnrichAnswers(input: unknown): Partial<Record<EnrichField, string | number>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Partial<Record<EnrichField, string | number>> = {};
  for (const key of ENRICH_FIELD_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (valid(ENRICH_FIELDS[key].rule, v)) out[key] = v as string | number;
  }
  return out;
}

/**
 * Merge onto the stored data. Never overwrites: an answer already there (an
 * old draft, an admin edit) wins. Returns the merged data and what was added.
 */
export function mergeEnrichAnswers(data: Record<string, unknown>, answers: Partial<Record<EnrichField, string | number>>) {
  const merged = { ...data };
  const added: EnrichField[] = [];
  for (const [key, value] of Object.entries(answers) as [EnrichField, string | number][]) {
    const current = merged[key];
    if (current !== null && current !== undefined && current !== "") continue;
    merged[key] = value;
    added.push(key);
  }
  return { merged, added };
}

// A dedicated secret when set; otherwise an existing server-only one. No secret, no enrichment.
const secret = () => process.env.QUOTE_ENRICH_SECRET || process.env.MCP_JWT_SECRET || process.env.CRON_SECRET || null;

/** Proof that the caller is the browser that just sent this submission. */
export function enrichToken(submissionId: string, key = secret()): string | null {
  if (!key) return null;
  return createHmac("sha256", key).update(`quote-enrich:${submissionId}`).digest("base64url");
}

export function verifyEnrichToken(submissionId: string, token: unknown, key = secret()): boolean {
  if (typeof token !== "string" || !key) return false;
  const expected = Buffer.from(enrichToken(submissionId, key) ?? "");
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
