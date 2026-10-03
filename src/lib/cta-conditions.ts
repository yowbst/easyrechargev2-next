/**
 * Conditions on a success-page CTA, evaluated against the submission data.
 * Stored in Directus as `show_when` on each CTA:
 *   - a list of conditions, all must hold;
 *   - `{ any: [list, list, …] }`, at least one list must hold.
 * A malformed condition hides the CTA: a cross-sell shown to the wrong lead
 * costs more than one not shown.
 */
export interface CtaCondition {
  field: string;
  in?: Array<string | number>;
  gte?: number;
}

type Data = Record<string, unknown>;

function isCondition(c: unknown): c is CtaCondition {
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  const o = c as Record<string, unknown>;
  if (typeof o.field !== "string" || !o.field) return false;
  return Array.isArray(o.in) || typeof o.gte === "number";
}

function holds(c: CtaCondition, data: Data): boolean {
  const v = data[c.field];
  if (c.in && !c.in.some((x) => x === v)) return false;
  if (typeof c.gte === "number" && !(typeof v === "number" && v >= c.gte)) return false;
  return true;
}

/** true / false for a well-formed list, null for a malformed one. */
function allHold(list: unknown, data: Data): boolean | null {
  if (!Array.isArray(list) || list.length === 0 || !list.every(isCondition)) return null;
  return list.every((c) => holds(c, data));
}

export function matchesShowWhen(showWhen: unknown, data: Data | null): boolean {
  if (showWhen === undefined || showWhen === null) return true;
  if (!data) return false;
  if (Array.isArray(showWhen)) return allHold(showWhen, data) === true;
  if (typeof showWhen === "object" && Array.isArray((showWhen as { any?: unknown }).any)) {
    const groups = (showWhen as { any: unknown[] }).any;
    if (groups.length === 0) return false;
    const results = groups.map((g) => allHold(g, data));
    if (results.some((r) => r === null)) return false;
    return results.some((r) => r === true);
  }
  return false;
}
