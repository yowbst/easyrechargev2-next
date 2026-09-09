import { directusFetch } from "@/lib/directus";
import { DISQUALIFICATION_REASONS, type DisqualificationReason } from "./types";

/**
 * Administrator overrides on the dispatch ledger.
 *
 * The partner-facing route at /api/partners/[uuid]/dispatches/[id]/disqualify
 * enforces three guards: the billing lock, the acceptance window, and the
 * per-stage reason list. Those exist to keep a partner from rewriting history
 * after they have been billed. An operator needs to be able to do exactly that
 * — a partner disputing an invoice by email is the normal case, not an abuse.
 *
 * One guard is NOT bypassed: a dispatch still attached to a live invoice is
 * refused. Disqualifying it would leave an issued invoice contradicting its own
 * ledger, with no way to reconcile the two. Cancel the invoice first — that
 * releases its dispatches — then disqualify, then re-issue.
 */

interface Row {
  id: string;
  stage: string;
  disqualified: boolean | null;
  disqualification_reason: string | null;
  disqualification_note: string | null;
  gift: boolean | null;
  billable: boolean | null;
  billable_locked_at: string | null;
  invoice: string | null;
}

const ROW_FIELDS =
  "id,stage,disqualified,disqualification_reason,disqualification_note," +
  "gift,billable,billable_locked_at,invoice";

async function fetchRow(dispatchId: string): Promise<Row> {
  const res = await directusFetch<{ data: Row | null }>(
    `/items/partner_dispatches/${dispatchId}?fields=${ROW_FIELDS}`,
    { next: { revalidate: 0 } },
  );
  const row = res?.data;
  if (!row) throw new Error("dispatch_not_found");
  return row;
}

/**
 * Refuse when the dispatch is on an invoice that has not been cancelled.
 * Returns the invoice number in the error so the caller knows what to cancel.
 */
async function assertNotOnLiveInvoice(row: Row): Promise<void> {
  if (!row.invoice) return;
  const res = await directusFetch<{ data: { number: string; status: string } | null }>(
    `/items/partner_invoices/${row.invoice}?fields=number,status`,
    { next: { revalidate: 0 } },
  );
  const inv = res?.data;
  if (!inv || inv.status === "cancelled") return;
  const err = new Error("attached_to_live_invoice");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (err as any).invoice = { number: inv.number, status: inv.status };
  throw err;
}

/** `[admin 2026-09-09] <reason>: <note>` — the only trace that this was forced. */
function adminNote(reason: string, note: string | null, now: Date): string {
  const stamp = now.toISOString().slice(0, 10);
  return `[admin ${stamp}] ${reason}${note ? `: ${note}` : ""}`;
}

export async function adminDisqualify(
  dispatchId: string,
  reason: DisqualificationReason,
  note: string | null,
  now: Date = new Date(),
): Promise<{ ok: true; reason: DisqualificationReason; wasLocked: boolean }> {
  if (!DISQUALIFICATION_REASONS.includes(reason)) throw new Error("invalid_reason");
  if (reason === "other" && !note?.trim()) throw new Error("note_required_for_other");

  const row = await fetchRow(dispatchId);
  await assertNotOnLiveInvoice(row);

  const wasLocked = Boolean(row.billable_locked_at);
  await directusFetch(`/items/partner_dispatches/${dispatchId}`, {
    method: "PATCH",
    body: JSON.stringify({
      disqualified: true,
      disqualification_reason: reason,
      disqualification_note: adminNote(reason, note, now),
      disqualified_at: now.toISOString(),
      // A disqualified lead is never billable, and the lock is released so the
      // row cannot be picked up by a later invoice.
      billable: false,
      billable_locked_at: null,
    }),
    next: { revalidate: 0 },
  });
  return { ok: true, reason, wasLocked };
}

/** Undo a disqualification — an operator's mistake, or a partner's retraction. */
export async function adminRequalify(
  dispatchId: string,
  note: string | null,
  now: Date = new Date(),
): Promise<{ ok: true; wasDisqualified: boolean }> {
  const row = await fetchRow(dispatchId);
  await assertNotOnLiveInvoice(row);

  const wasDisqualified = row.disqualified === true;
  await directusFetch(`/items/partner_dispatches/${dispatchId}`, {
    method: "PATCH",
    body: JSON.stringify({
      disqualified: false,
      disqualification_reason: null,
      disqualification_note: adminNote("requalified", note, now),
      disqualified_at: null,
      // Left unlocked on purpose: the next reconcile decides whether the
      // acceptance window has elapsed, rather than this call asserting it.
      billable: false,
      billable_locked_at: null,
    }),
    next: { revalidate: 0 },
  });
  return { ok: true, wasDisqualified };
}
