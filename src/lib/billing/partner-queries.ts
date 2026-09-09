import { directusFetch } from "@/lib/directus";

export interface PartnerInvoiceLine {
  label: string;
  dispatched_at: string | null;
  lead_category: string | null;
  amount_chf: string;
  unit_price_chf?: string | null;
  kind: string;
  /** Present on a `disqualified` line — the reason the partner gave. */
  disqualification_reason?: string | null;
  /** Present on a `gift` line — why the lead was free. */
  gift_reason?: string | null;
  /**
   * The dispatch behind this line, when there is one. Manual lead lines and
   * adjustments carry none, so the "open the request" link is simply absent
   * for them rather than pointing nowhere.
   */
  dispatch?: { submission?: string | null } | null;
}

export interface PartnerInvoice {
  id: string;
  number: string;
  version: number;
  status: string;
  period_month: string;
  total_chf: string;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  /**
   * Optional on purpose: this is a Directus O2M alias, so it is absent from the
   * response whenever the alias is named something else or the role lacks
   * nested read permission on partner_invoice_lines. A partner-facing page must
   * degrade to "no detail rows", never to a 500.
   */
  lines?: PartnerInvoiceLine[];
}

/**
 * Invoices visible to a partner in their dashboard. Scoped to the partner id —
 * a privacy boundary, never omit that filter.
 *
 * A cancelled invoice is shown only if it was sent. One cancelled before it
 * ever left the office is internal churn the partner has no reason to see; one
 * they actually received has to stay visible, or their dashboard contradicts
 * the document in their inbox.
 */
export async function fetchPartnerInvoices(
  partnerId: string,
): Promise<PartnerInvoice[]> {
  const params = new URLSearchParams();
  params.set(
    "fields",
    "id,number,version,status,period_month,total_chf,issued_at,due_at,paid_at," +
      "lines.label,lines.dispatched_at,lines.lead_category,lines.amount_chf,lines.kind," +
      "lines.dispatch.submission,lines.disqualification_reason,lines.gift_reason,lines.unit_price_chf",
  );
  // Directus returns a nested O2M in arbitrary order, and `sort` would not help:
  // manual lead lines are appended, so the pre-go-live leads (the earliest dates)
  // carry the highest sort values. Order by the date the lead was dispatched.
  params.set("deep[lines][_sort]", "dispatched_at");
  params.set("filter[partner][_eq]", partnerId);
  // A cancelled invoice the partner never received is internal noise. One they
  // DID receive is part of their history: hiding it leaves them holding a
  // document their dashboard denies exists. So: not cancelled, OR sent at
  // some point.
  params.set("filter[_or][0][status][_neq]", "cancelled");
  params.set("filter[_or][1][sent_at][_nnull]", "true");
  params.set("sort", "-period_month");
  params.set("limit", "100");

  const res = await directusFetch<{ data: PartnerInvoice[] }>(
    `/items/partner_invoices?${params}`,
    { next: { revalidate: 0 } },
  );
  return res?.data ?? [];
}
