import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import { fetchDispatchConfig } from "@/lib/dispatch/queries";
import { computePeriod, isPeriodIssuable } from "./period";
import { buildInvoiceNumber } from "./numbering";
import { collectBillableDispatches } from "./scope";
import type { InvoicePeriod, PartySnapshot, ScopeResult } from "./types";

export interface InvoicePreview {
  period: InvoicePeriod;
  issuable: boolean;
  number: string;
  scope: ScopeResult;
  subtotalChf: number;
  totalChf: number;
}

interface PartnerRow {
  id: string; slug: string; invoice_code: string | null; name: string;
  business_name: string | null; uid: string | null; street_name: string | null;
  street_number: string | null; postal_code: string | null; locality: string | null;
  notification_email: string | null;
}

async function fetchPartner(slug: string): Promise<PartnerRow> {
  const params = new URLSearchParams();
  params.set("fields", "id,slug,invoice_code,name,business_name,uid,street_name,street_number,postal_code,locality,notification_email");
  params.set("filter[slug][_eq]", slug);
  params.set("filter[environment][_eq]", getEnvironment());
  params.set("limit", "1");
  const res = await directusFetch<{ data: PartnerRow[] }>(
    `/items/partners?${params}`, { next: { revalidate: 0 } },
  );
  const partner = res?.data?.[0];
  if (!partner) throw new Error("partner_not_found");
  return partner;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCompany(): Promise<{ company: any; paymentTermsDays: number }> {
  const res = await directusFetch<{ data: any }>( // eslint-disable-line @typescript-eslint/no-explicit-any
    "/items/site_settings?fields=global_config", { next: { revalidate: 0 } },
  );
  const raw = res?.data;
  const record = Array.isArray(raw) ? raw[0] : raw;
  const global = record?.global_config ?? {};
  return {
    company: global.company ?? {},
    paymentTermsDays: global.invoicing?.payment_terms_days ?? 21,
  };
}

function debtorSnapshot(p: PartnerRow): PartySnapshot {
  return {
    name: p.business_name ?? p.name,
    street: [p.street_name, p.street_number].filter(Boolean).join(" "),
    postal_code: p.postal_code ?? "",
    locality: p.locality ?? "",
    country: "CH",
    email: p.notification_email,
    uid: p.uid,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function issuerSnapshot(company: any): PartySnapshot {
  return {
    name: company.name ?? "easyRecharge",
    contact_name: company.contact_name ?? null,
    street: company.street ?? "",
    postal_code: company.postal_code ?? "",
    locality: company.locality ?? "",
    country: company.country ?? "CH",
    email: company.email ?? null,
    uid: company.vat_number ?? null,
  };
}

async function findByNumber(number: string): Promise<{ id: string }[]> {
  const params = new URLSearchParams();
  params.set("fields", "id,number");
  params.set("filter[number][_eq]", number);
  params.set("limit", "1");
  const res = await directusFetch<{ data: { id: string }[] }>(
    `/items/partner_invoices?${params}`, { next: { revalidate: 0 } },
  );
  return res?.data ?? [];
}

export async function previewInvoice(
  partnerSlug: string, month: string, now: Date = new Date(),
): Promise<InvoicePreview> {
  const [partner, config] = await Promise.all([fetchPartner(partnerSlug), fetchDispatchConfig()]);
  const period = computePeriod(month, config.billing.acceptance_window_days);
  const scope = await collectBillableDispatches(partner.id, month);
  const total = Number((scope.subtotalChf).toFixed(2));

  return {
    period,
    issuable: isPeriodIssuable(period, now),
    number: buildInvoiceNumber(partner.invoice_code ?? "", month),
    scope,
    subtotalChf: scope.subtotalChf,
    totalChf: total,
  };
}

/**
 * Freeze the period: assign the number, snapshot both parties, write the lines,
 * and stamp each dispatch with the invoice id so it can never be billed twice.
 *
 * Refuses rather than guesses — an invoice that silently drops or duplicates a
 * lead is worse than one that fails loudly.
 */
export async function issueInvoice(
  partnerSlug: string, month: string, opts: { now?: Date } = {},
): Promise<{ id: string; number: string; total_chf: number }> {
  const now = opts.now ?? new Date();
  const [partner, config, settings] = await Promise.all([
    fetchPartner(partnerSlug), fetchDispatchConfig(), fetchCompany(),
  ]);

  const period = computePeriod(month, config.billing.acceptance_window_days);
  if (!isPeriodIssuable(period, now)) throw new Error("period_not_issuable");

  const scope = await collectBillableDispatches(partner.id, month);
  if (scope.unsettled.length > 0) throw new Error("unsettled_dispatches");
  if (scope.lines.length === 0) throw new Error("empty_scope");

  const number = buildInvoiceNumber(partner.invoice_code ?? "", month);
  if ((await findByNumber(number)).length > 0) throw new Error("duplicate_number");

  const due = new Date(now.getTime());
  due.setUTCDate(due.getUTCDate() + settings.paymentTermsDays);
  const total = Number(scope.subtotalChf.toFixed(2));

  const created = await directusFetch<{ data: { id: string } }>(
    "/items/partner_invoices",
    {
      method: "POST",
      body: JSON.stringify({
        number, version: 1, status: "issued", partner: partner.id,
        period_month: month, period_start: period.start, period_end: period.end,
        issued_at: now.toISOString(), due_at: due.toISOString(),
        payment_terms_days: settings.paymentTermsDays, currency: "CHF",
        subtotal_chf: total, adjustment_chf: 0, total_chf: total,
        vat_rate: 0, vat_chf: 0,
        issuer_snapshot: issuerSnapshot(settings.company),
        debtor_snapshot: debtorSnapshot(partner),
        doc_versions: [], events: [{ at: now.toISOString(), actor: "system", type: "issued" }],
        environment: getEnvironment(),
      }),
      next: { revalidate: 0 },
    },
  );
  const invoiceId = created?.data?.id;

  for (const [i, line] of scope.lines.entries()) {
    await directusFetch("/items/partner_invoice_lines", {
      method: "POST",
      body: JSON.stringify({
        invoice: invoiceId, dispatch: line.dispatchId, kind: "lead",
        label: line.label, quantity: 1,
        unit_price_chf: line.unitPriceChf, amount_chf: line.unitPriceChf,
        sort: i, dispatched_at: line.dispatchedAt, canton: line.canton,
        postal_code: line.postalCode, locality: line.locality,
        last_name: line.lastName, lead_category: line.leadCategory, product: line.product,
      }),
      next: { revalidate: 0 },
    });
    if (line.dispatchId) {
      await directusFetch(`/items/partner_dispatches/${line.dispatchId}`, {
        method: "PATCH",
        body: JSON.stringify({ invoice: invoiceId }),
        next: { revalidate: 0 },
      });
    }
  }

  return { id: invoiceId, number, total_chf: total };
}
