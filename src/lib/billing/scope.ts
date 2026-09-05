import { directusFetch } from "@/lib/directus";
import type { ScopeLine, ScopeResult } from "./types";

const FIELDS = [
  "id", "dispatched_at", "canton", "price_chf", "lead_category", "product",
  "billable", "gift", "disqualified", "invoice",
  "submission.user.last_name", "submission.data",
].join(",");

interface Row {
  id: string;
  dispatched_at: string;
  canton: string | null;
  price_chf: string | number | null | undefined;
  lead_category: string | null;
  product: string | null;
  billable: boolean | null;
  gift: boolean | null;
  disqualified: boolean | null;
  invoice: string | null;
  submission: {
    user?: { last_name?: string | null } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
  } | null;
}

/** `P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04` — the June annex format. */
export function buildLeadLabel(
  lastName: string | null | undefined,
  postalCode: string | null | undefined,
  locality: string | null | undefined,
  dispatchedAt: string,
): string {
  const name = (lastName ?? "").trim().toUpperCase() || "—";
  const place = [postalCode, locality].filter(Boolean).join(" ").trim() || "—";
  return `P / ${name} / ${place} / ${dispatchedAt.slice(0, 10)}`;
}

function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const parsed = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The billable set for a partner+month, plus everything that kept a row out.
 *
 * `unsettled` is what blocks issuance: a dispatched, non-gift, non-disqualified
 * row that is not yet billable is still inside its acceptance window, so the
 * scope is not final.
 */
export async function collectBillableDispatches(
  partnerId: string,
  month: string,
): Promise<ScopeResult> {
  const params = new URLSearchParams();
  params.set("fields", FIELDS);
  params.set("filter[partner][_eq]", partnerId);
  params.set("filter[month_bucket][_eq]", month);
  params.set("filter[status][_eq]", "dispatched");
  params.set("sort", "dispatched_at");
  params.set("limit", "500");

  const res = await directusFetch<{ data: Row[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );

  const lines: ScopeLine[] = [];
  const unsettled: string[] = [];
  const excluded: { id: string; reason: string }[] = [];

  for (const r of res?.data ?? []) {
    if (r.invoice) { excluded.push({ id: r.id, reason: "already_invoiced" }); continue; }
    if (r.gift === true) { excluded.push({ id: r.id, reason: "gift" }); continue; }
    if (r.disqualified === true) { excluded.push({ id: r.id, reason: "disqualified" }); continue; }
    if (r.billable !== true) { unsettled.push(r.id); continue; }

    const data = r.submission?.data ?? {};
    lines.push({
      dispatchId: r.id,
      label: buildLeadLabel(
        r.submission?.user?.last_name, data.postalCode, data.locality, r.dispatched_at,
      ),
      dispatchedAt: r.dispatched_at,
      canton: r.canton,
      postalCode: data.postalCode ?? null,
      locality: data.locality ?? null,
      lastName: r.submission?.user?.last_name ?? null,
      leadCategory: r.lead_category,
      product: r.product,
      unitPriceChf: toNumber(r.price_chf),
    });
  }

  const subtotalChf = Number(
    lines.reduce((s, l) => s + l.unitPriceChf, 0).toFixed(2),
  );

  return { lines, subtotalChf, unsettled, excluded };
}
