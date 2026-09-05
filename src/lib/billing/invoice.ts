import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import { fetchDispatchConfig } from "@/lib/dispatch/queries";
import { computePeriod, isPeriodIssuable } from "./period";
import { buildInvoiceNumber } from "./numbering";
import { collectBillableDispatches } from "./scope";
import type {
  InvoiceEvent, InvoiceEventActor, InvoiceStatus,
  InvoicePeriod, PartySnapshot, ScopeResult,
} from "./types";

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

/**
 * Every invoice ever issued for this partner+period, cancelled included — a
 * cancelled invoice's number stays taken, it is never freed for reuse. The
 * count drives the issuance rank: first issuance is un-suffixed, a re-issue
 * after cancellation is `-R2`, the one after that `-R3`, and so on.
 */
async function findInvoicesForPeriod(
  partnerId: string, month: string,
): Promise<{ id: string; status: InvoiceStatus }[]> {
  const params = new URLSearchParams();
  params.set("fields", "id,status");
  params.set("filter[partner][_eq]", partnerId);
  params.set("filter[period_month][_eq]", month);
  params.set("limit", "-1");
  const res = await directusFetch<{ data: { id: string; status: InvoiceStatus }[] }>(
    `/items/partner_invoices?${params}`, { next: { revalidate: 0 } },
  );
  return res?.data ?? [];
}

export async function previewInvoice(
  partnerSlug: string, month: string, now: Date = new Date(),
): Promise<InvoicePreview> {
  // Validate the month before any other network call: computePeriod throws
  // `invalid_month` synchronously, and calling it first (right after the one
  // fetch it depends on) means a malformed month never gets masked by a
  // partner lookup failure, and is rejected after a single round trip
  // instead of two. The resulting period is computed once and reused below.
  const config = await fetchDispatchConfig();
  const period = computePeriod(month, config.billing.acceptance_window_days);
  const partner = await fetchPartner(partnerSlug);
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
  // Same ordering rationale as previewInvoice: validate the month (via the
  // one fetch computePeriod needs) before the partner/company lookups, so a
  // malformed month can't be masked by one of those failing first, and the
  // period is computed exactly once and reused below.
  const config = await fetchDispatchConfig();
  const period = computePeriod(month, config.billing.acceptance_window_days);
  if (!isPeriodIssuable(period, now)) throw new Error("period_not_issuable");

  const [partner, settings] = await Promise.all([fetchPartner(partnerSlug), fetchCompany()]);

  const scope = await collectBillableDispatches(partner.id, month);
  if (scope.unsettled.length > 0) throw new Error("unsettled_dispatches");
  if (scope.lines.length === 0) throw new Error("empty_scope");

  // A cancelled invoice for this period does not block a re-issue, but it does
  // not free its number either: any other status ("issued", "sent", "disputed",
  // "paid") is still live and blocks a second issuance outright.
  const existingForPeriod = await findInvoicesForPeriod(partner.id, month);
  if (existingForPeriod.some((inv) => inv.status !== "cancelled")) {
    throw new Error("duplicate_number");
  }
  const issuanceRank = existingForPeriod.length + 1;
  const number = buildInvoiceNumber(partner.invoice_code ?? "", month, issuanceRank);

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

  // Not transactional: if this loop dies partway through, the invoice's
  // total_chf reflects the full intended scope while only some lines exist
  // and only some dispatches are stamped, and this same run can never be
  // retried (its number is now taken). Recovery is cancel-then-reissue: set
  // this invoice to "cancelled" and call issueInvoice again — the next
  // number for the period is picked up as the next issuance rank (-R2, -R3, ...).
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

const ALLOWED: Record<InvoiceStatus, InvoiceStatus[]> = {
  issued: ["sent", "cancelled"],
  sent: ["paid", "disputed", "cancelled"],
  disputed: ["sent", "paid", "cancelled"],
  paid: [],
  cancelled: [],
};

/** `paid` and `cancelled` are terminal; `issued -> paid` must pass through `sent`. */
export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return false;
  return (ALLOWED[from] ?? []).includes(to);
}

interface InvoiceStateRow {
  id: string; status: InvoiceStatus; events: InvoiceEvent[] | null;
  subtotal_chf: string | number; adjustment_chf: string | number;
}

async function fetchInvoiceState(invoiceId: string): Promise<InvoiceStateRow> {
  const res = await directusFetch<{ data: InvoiceStateRow | null }>(
    `/items/partner_invoices/${invoiceId}?fields=id,status,events,subtotal_chf,adjustment_chf`,
    { next: { revalidate: 0 } },
  );
  const row = res?.data;
  if (!row) throw new Error("invoice_not_found");
  return row;
}

const STATUS_TIMESTAMP: Partial<Record<InvoiceStatus, string>> = {
  sent: "sent_at", paid: "paid_at",
};

/** Same guard as `scope.ts`'s `toNumber` — a non-finite value must not silently
 * become 0 via truthiness (0 is a legitimate subtotal/adjustment) nor leak
 * through as NaN, which `JSON.stringify` would serialise as `null`. */
function toFiniteNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const parsed = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function setInvoiceStatus(
  invoiceId: string, to: InvoiceStatus, note?: string, now: Date = new Date(),
): Promise<void> {
  const row = await fetchInvoiceState(invoiceId);
  if (!canTransition(row.status, to)) throw new Error("invalid_transition");

  const events = Array.isArray(row.events) ? row.events : [];
  const event: InvoiceEvent = {
    at: now.toISOString(),
    actor: "yoan",
    type: to === "disputed" ? "revision_requested" : (to as InvoiceEvent["type"]),
    ...(note ? { note } : {}),
  };
  const stamp = STATUS_TIMESTAMP[to];

  await directusFetch(`/items/partner_invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: to,
      events: [...events, event],
      ...(stamp ? { [stamp]: now.toISOString() } : {}),
    }),
    next: { revalidate: 0 },
  });
}

export async function addInvoiceNote(
  invoiceId: string, actor: InvoiceEventActor, note: string, now: Date = new Date(),
): Promise<void> {
  const row = await fetchInvoiceState(invoiceId);
  const events = Array.isArray(row.events) ? row.events : [];
  await directusFetch(`/items/partner_invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      events: [...events, { at: now.toISOString(), actor, type: "comment", note }],
    }),
    next: { revalidate: 0 },
  });
}

/** A discount or correction. Negative amounts are the normal case. */
export async function addAdjustmentLine(
  invoiceId: string, description: string, amountChf: number,
): Promise<void> {
  const row = await fetchInvoiceState(invoiceId);
  if (row.status === "paid" || row.status === "cancelled") throw new Error("invoice_closed");

  await directusFetch("/items/partner_invoice_lines", {
    method: "POST",
    body: JSON.stringify({
      invoice: invoiceId, kind: "adjustment", dispatch: null,
      label: description, description, quantity: 1,
      unit_price_chf: amountChf, amount_chf: amountChf, sort: 9999,
    }),
    next: { revalidate: 0 },
  });

  const subtotal = toFiniteNumber(row.subtotal_chf);
  const adjustment = toFiniteNumber(row.adjustment_chf) + amountChf;
  await directusFetch(`/items/partner_invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      adjustment_chf: Number(adjustment.toFixed(2)),
      total_chf: Number((subtotal + adjustment).toFixed(2)),
    }),
    next: { revalidate: 0 },
  });
}
