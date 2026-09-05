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
  /** Which issuance of this period the number above belongs to (1 = first). */
  issuanceRank: number;
  /**
   * A non-cancelled invoice already covering this period, if any. Its presence
   * means `issueInvoice` would refuse with `duplicate_number` — preview is the
   * only pre-flight check before an irreversible operation, so it has to say so.
   */
  existingLiveInvoice: { id: string; number: string; status: InvoiceStatus } | null;
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
): Promise<{ id: string; number: string; status: InvoiceStatus }[]> {
  const params = new URLSearchParams();
  params.set("fields", "id,number,status");
  params.set("filter[partner][_eq]", partnerId);
  params.set("filter[period_month][_eq]", month);
  params.set("limit", "-1");
  const res = await directusFetch<{
    data: { id: string; number: string; status: InvoiceStatus }[];
  }>(
    `/items/partner_invoices?${params}`, { next: { revalidate: 0 } },
  );
  return res?.data ?? [];
}

export async function previewInvoice(
  partnerSlug: string, month: string, now: Date = new Date(),
): Promise<InvoicePreview> {
  // The month is validated as early as it can be: computePeriod throws
  // `invalid_month` synchronously, and the only thing that must precede it is
  // the single config fetch it depends on. Doing it before the partner lookup
  // means a malformed month is never masked by a partner lookup failure, and is
  // rejected after one round trip instead of two. The period is computed once
  // and reused below.
  const config = await fetchDispatchConfig();
  const period = computePeriod(month, config.billing.acceptance_window_days);
  const partner = await fetchPartner(partnerSlug);
  const scope = await collectBillableDispatches(partner.id, month);
  const total = Number((scope.subtotalChf).toFixed(2));

  // Preview must promise the number issuance would actually mint. During a
  // re-issuance period that is `-R2`, not the bare number the default rank
  // would produce, so the rank is computed here exactly as issueInvoice does.
  const existingForPeriod = await findInvoicesForPeriod(partner.id, month);
  const issuanceRank = existingForPeriod.length + 1;
  const live = existingForPeriod.find((inv) => inv.status !== "cancelled") ?? null;

  return {
    period,
    issuable: isPeriodIssuable(period, now),
    number: buildInvoiceNumber(partner.invoice_code ?? "", month, issuanceRank),
    issuanceRank,
    existingLiveInvoice: live,
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
  // Same ordering rationale as previewInvoice: the month is validated as early
  // as it can be — right after the single config fetch computePeriod depends on,
  // and before the partner/company lookups — so a malformed month can't be
  // masked by one of those failing first, and the period is computed exactly
  // once and reused below.
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
      // Money-critical, non-idempotent POST: a retried 502 whose first attempt
      // actually landed would mint a second invoice for the same period.
      retry: false,
    },
  );
  const invoiceId = created?.data?.id;
  // Without this guard an unexpected response shape writes every line with
  // `invoice: undefined`, turns every dispatch PATCH into a no-op, and still
  // returns success — an invoice that exists nowhere but in the return value.
  if (!invoiceId) throw new Error("invoice_create_failed");

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
      // Non-idempotent: a retried line POST bills the same lead twice.
      retry: false,
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

/**
 * Clear `partner_dispatches.invoice` on every dispatch stamped with this
 * invoice, putting those leads back into the billable scope.
 *
 * Returns the ids released, so callers (and tests) can see what moved.
 */
async function releaseDispatches(invoiceId: string): Promise<string[]> {
  const params = new URLSearchParams();
  params.set("fields", "id");
  params.set("filter[invoice][_eq]", invoiceId);
  params.set("limit", "-1");
  const res = await directusFetch<{ data: { id: string }[] }>(
    `/items/partner_dispatches?${params}`, { next: { revalidate: 0 } },
  );
  const ids = (res?.data ?? []).map((r) => r.id);
  if (ids.length === 0) return [];

  // One bulk PATCH rather than N single ones: fewer round trips, and Directus
  // applies it as a single update, so there is no half-released state to
  // recover from. PATCH is idempotent, so the default retry is safe here.
  await directusFetch("/items/partner_dispatches", {
    method: "PATCH",
    body: JSON.stringify({ keys: ids, data: { invoice: null } }),
    next: { revalidate: 0 },
  });
  return ids;
}

export async function setInvoiceStatus(
  invoiceId: string, to: InvoiceStatus, note?: string, now: Date = new Date(),
): Promise<void> {
  const row = await fetchInvoiceState(invoiceId);
  if (!canTransition(row.status, to)) throw new Error("invalid_transition");

  // Cancelling must hand the leads back, or the period becomes permanently
  // un-invoiceable: `collectBillableDispatches` excludes every dispatch that
  // carries an invoice id, so a cancelled-but-still-stamped month re-issues as
  // `empty_scope` and the money is never billed.
  //
  // Ordering: release BEFORE the status patch. If the process dies between the
  // two, the invoice is still live (issued/sent/disputed) with some or all of
  // its dispatches released — and a live invoice for the period makes
  // `issueInvoice` refuse with `duplicate_number`, so nothing can be billed
  // twice; the operator simply retries the cancel, which is idempotent (the
  // second pass finds fewer, or zero, stamped rows). The reverse order fails
  // dangerously: status cancelled + dispatches still stamped is exactly the
  // state that re-issues as an under-billed or empty invoice, silently.
  if (to === "cancelled") await releaseDispatches(invoiceId);

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

interface InvoiceLineRow {
  kind: string;
  amount_chf: string | number | null;
}

async function fetchInvoiceLines(invoiceId: string): Promise<InvoiceLineRow[]> {
  const params = new URLSearchParams();
  params.set("fields", "kind,amount_chf");
  params.set("filter[invoice][_eq]", invoiceId);
  params.set("limit", "-1");
  const res = await directusFetch<{ data: InvoiceLineRow[] }>(
    `/items/partner_invoice_lines?${params}`, { next: { revalidate: 0 } },
  );
  return res?.data ?? [];
}

/**
 * Recompute `subtotal_chf` / `adjustment_chf` / `total_chf` from the invoice's
 * ACTUAL lines rather than from the stored subtotal.
 *
 * The stored figures are only ever right if every line was written by
 * `issueInvoice`. The spec's own rollout requires hand-added `lead` lines (the
 * three pre-go-live July leads), and a line inserted directly in Directus is a
 * legitimate correction path — either leaves the header claiming a total its
 * lines do not sum to, which is exactly the discrepancy an invoice must never
 * carry. Reading the lines back makes the header a derived value.
 *
 * Rounding is applied at each aggregation boundary, per the money convention.
 */
async function recomputeInvoiceTotals(
  invoiceId: string,
): Promise<{ subtotal: number; adjustment: number; total: number }> {
  const lines = await fetchInvoiceLines(invoiceId);
  const subtotal = Number(
    lines
      .filter((l) => l.kind !== "adjustment")
      .reduce((s, l) => s + toFiniteNumber(l.amount_chf), 0)
      .toFixed(2),
  );
  const adjustment = Number(
    lines
      .filter((l) => l.kind === "adjustment")
      .reduce((s, l) => s + toFiniteNumber(l.amount_chf), 0)
      .toFixed(2),
  );
  const total = Number((subtotal + adjustment).toFixed(2));

  await directusFetch(`/items/partner_invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      subtotal_chf: subtotal, adjustment_chf: adjustment, total_chf: total,
    }),
    next: { revalidate: 0 },
  });
  return { subtotal, adjustment, total };
}

/** Shared gate: a paid or cancelled invoice is closed to new lines. */
async function assertLineWritable(invoiceId: string): Promise<InvoiceStateRow> {
  const row = await fetchInvoiceState(invoiceId);
  if (row.status === "paid" || row.status === "cancelled") throw new Error("invoice_closed");
  return row;
}

/** A discount or correction. Negative amounts are the normal case. */
export async function addAdjustmentLine(
  invoiceId: string, description: string, amountChf: number,
): Promise<void> {
  await assertLineWritable(invoiceId);
  if (!Number.isFinite(amountChf)) throw new Error("invalid_amount");

  await directusFetch("/items/partner_invoice_lines", {
    method: "POST",
    body: JSON.stringify({
      invoice: invoiceId, kind: "adjustment", dispatch: null,
      label: description, description, quantity: 1,
      unit_price_chf: amountChf, amount_chf: amountChf, sort: 9999,
    }),
    next: { revalidate: 0 },
    // Money-critical, non-idempotent POST — a retry would double the discount.
    retry: false,
  });

  await recomputeInvoiceTotals(invoiceId);
}

export interface ManualLeadLineMeta {
  description?: string | null;
  dispatchedAt?: string | null;
  canton?: string | null;
  postalCode?: string | null;
  locality?: string | null;
  lastName?: string | null;
  leadCategory?: string | null;
  product?: string | null;
}

/**
 * A `lead` line with `dispatch: null` — a lead billed without a ledger row.
 *
 * The spec's rollout needs exactly this: the three July leads dispatched by
 * hand before the ledger went live on 12.07.2026 have no `partner_dispatches`
 * row to collect, yet they are billable. `kind` and `dispatch` are independent
 * axes (spec, Data model), and this is the `lead` + `null` cell — it is NOT an
 * adjustment, and must count towards the lead quantity on the document.
 *
 * Totals are recomputed from the lines afterwards, so the header always agrees
 * with what the lines sum to.
 */
export async function addManualLeadLine(
  invoiceId: string, label: string, unitPriceChf: number,
  meta: ManualLeadLineMeta = {},
): Promise<{ subtotal_chf: number; adjustment_chf: number; total_chf: number }> {
  await assertLineWritable(invoiceId);
  if (!Number.isFinite(unitPriceChf)) throw new Error("invalid_amount");

  // Sort after the lead lines already present; adjustments sit at 9999 and are
  // excluded so a manual lead never lands past them.
  const existing = await fetchInvoiceLines(invoiceId);
  const sort = existing.filter((l) => l.kind !== "adjustment").length;

  await directusFetch("/items/partner_invoice_lines", {
    method: "POST",
    body: JSON.stringify({
      invoice: invoiceId, kind: "lead", dispatch: null,
      label, description: meta.description ?? null, quantity: 1,
      unit_price_chf: unitPriceChf, amount_chf: unitPriceChf, sort,
      dispatched_at: meta.dispatchedAt ?? null,
      canton: meta.canton ?? null,
      postal_code: meta.postalCode ?? null,
      locality: meta.locality ?? null,
      last_name: meta.lastName ?? null,
      lead_category: meta.leadCategory ?? null,
      product: meta.product ?? null,
    }),
    next: { revalidate: 0 },
    // Money-critical, non-idempotent POST — a retry would bill the lead twice.
    retry: false,
  });

  const totals = await recomputeInvoiceTotals(invoiceId);
  return {
    subtotal_chf: totals.subtotal,
    adjustment_chf: totals.adjustment,
    total_chf: totals.total,
  };
}
