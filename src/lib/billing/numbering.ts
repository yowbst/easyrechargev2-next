const MONTH_RE = /^(\d{4})-(\d{2})$/;

/**
 * `EME-202607`. Partner code + period, per the 2026-09-05 design decision.
 *
 * Not a continuous sequence — accepted trade-off, documented in the spec. A
 * cancelled invoice keeps its number, so a re-issue for the same period is
 * suffixed with its issuance rank (the first carries no suffix).
 */
export function buildInvoiceNumber(
  invoiceCode: string,
  month: string,
  issuanceRank = 1,
): string {
  const code = (invoiceCode ?? "").trim().toUpperCase();
  if (!code) throw new Error("missing_invoice_code");
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error("invalid_month");

  const base = `${code}-${m[1]}${m[2]}`;
  return issuanceRank > 1 ? `${base}-R${issuanceRank}` : base;
}
