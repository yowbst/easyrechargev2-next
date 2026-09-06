import { directusFetch } from "@/lib/directus";

export interface PartnerInvoiceLine {
  label: string;
  dispatched_at: string | null;
  lead_category: string | null;
  amount_chf: string;
  kind: string;
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
 * Invoices visible to a partner in their dashboard. Scoped to the partner id
 * (a privacy boundary — never omit this filter) and cancelled invoices are
 * never returned: a cancelled invoice's number stays taken internally (see
 * `invoice.ts`), but the partner should never see a document that was voided.
 */
export async function fetchPartnerInvoices(
  partnerId: string,
): Promise<PartnerInvoice[]> {
  const params = new URLSearchParams();
  params.set(
    "fields",
    "id,number,version,status,period_month,total_chf,issued_at,due_at,paid_at," +
      "lines.label,lines.dispatched_at,lines.lead_category,lines.amount_chf,lines.kind," +
      "lines.dispatch.submission",
  );
  params.set("filter[partner][_eq]", partnerId);
  params.set("filter[status][_neq]", "cancelled");
  params.set("sort", "-period_month");
  params.set("limit", "100");

  const res = await directusFetch<{ data: PartnerInvoice[] }>(
    `/items/partner_invoices?${params}`,
    { next: { revalidate: 0 } },
  );
  return res?.data ?? [];
}
