import type { InvoicePeriod } from "./types";

const MONTH_RE = /^(\d{4})-(\d{2})$/;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Period bounds for an invoice month, plus the earliest date it may be issued.
 *
 * `issuableFrom` is period end + the acceptance window: the last dispatch of the
 * month only settles that many days after it was dispatched, so issuing earlier
 * would freeze a scope that can still change.
 */
export function computePeriod(month: string, acceptanceWindowDays: number): InvoicePeriod {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error("invalid_month");
  const year = Number(m[1]);
  const monthNo = Number(m[2]);
  if (monthNo < 1 || monthNo > 12) throw new Error("invalid_month");

  // Day 0 of the next month is the last day of this one — handles leap years.
  const end = new Date(Date.UTC(year, monthNo, 0));
  const start = new Date(Date.UTC(year, monthNo - 1, 1));
  const issuable = new Date(end.getTime());
  issuable.setUTCDate(issuable.getUTCDate() + Math.max(0, acceptanceWindowDays) + 1);

  return { month, start: iso(start), end: iso(end), issuableFrom: iso(issuable) };
}

export function isPeriodIssuable(period: InvoicePeriod, now: Date = new Date()): boolean {
  return iso(now) >= period.issuableFrom;
}
