/**
 * What each kind of invoice line means. Pure, so the partner page, the
 * totals and the Google Doc all read the same table — a kind added to
 * `LineKind` without its row here does not build.
 *
 * - lead: a billed request.
 * - gift: a request delivered free; frozen on the invoice at CHF 0.
 * - disqualified: a refused request; listed at CHF 0, not billed.
 * - adjustment: a discount or correction, summed apart from the subtotal.
 */
export type LineKind = "lead" | "gift" | "disqualified" | "adjustment";

interface KindRule {
  /** Counted in "N demandes facturées" and in the Doc's lead quantity. */
  billedLead: boolean;
  /** What the partner page says on the line; null = no status (an adjustment). */
  partnerStatus: "billed" | "notBilled" | null;
  /** Summed in `adjustment_chf` rather than `subtotal_chf`. */
  adjustment: boolean;
  /** `sort` band: leads first, then gifts, refused, adjustments last. */
  sortBand: number;
}

const RULES: Record<LineKind, KindRule> = {
  lead: { billedLead: true, partnerStatus: "billed", adjustment: false, sortBand: 0 },
  gift: { billedLead: false, partnerStatus: "notBilled", adjustment: false, sortBand: 1000 },
  disqualified: { billedLead: false, partnerStatus: "notBilled", adjustment: false, sortBand: 2000 },
  adjustment: { billedLead: false, partnerStatus: null, adjustment: true, sortBand: 9999 },
};

/** An unknown kind (a row typed by hand in Directus) keeps its money on the invoice but is not a request. */
const UNKNOWN: KindRule = { billedLead: false, partnerStatus: null, adjustment: false, sortBand: 0 };

const rule = (kind: string): KindRule => RULES[kind as LineKind] ?? UNKNOWN;

export const isBilledLead = (kind: string) => rule(kind).billedLead;
export const isAdjustment = (kind: string) => rule(kind).adjustment;
export const partnerStatus = (kind: string) => rule(kind).partnerStatus;
export const sortBand = (kind: string) => rule(kind).sortBand;

export function countBilledLeads(lines: { kind: string }[]): number {
  return lines.filter((l) => isBilledLead(l.kind)).length;
}

function toAmount(v: string | number | null | undefined): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Subtotal, adjustment and total from the lines, rounded at each aggregation. */
export function splitTotals(
  lines: { kind: string; amount_chf: string | number | null | undefined }[],
): { subtotal: number; adjustment: number; total: number } {
  const sum = (adj: boolean) =>
    Number(
      lines
        .filter((l) => isAdjustment(l.kind) === adj)
        .reduce((s, l) => s + toAmount(l.amount_chf), 0)
        .toFixed(2),
    );
  const subtotal = sum(false);
  const adjustment = sum(true);
  return { subtotal, adjustment, total: Number((subtotal + adjustment).toFixed(2)) };
}
