import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import { fetchDispatchConfig } from "./queries";
import { isAcceptanceExpired } from "./billing";

interface BillingRow {
  partner: string;
  count: { id: string | number };
  sum: { price_chf: string | number };
}

/**
 * Monthly billing report — sums `price_chf` per partner where billable=true
 * and the dispatch is neither a gift nor disqualified.
 *
 * NOTE: intentionally has no environment filter in the aggregate query —
 * matches today's route behavior (do not add one).
 */
export async function getMonthlyBilling(month: string): Promise<{
  month: string;
  rows: { partnerId: string; leadCount: number; totalChf: number }[];
  totalChf: number;
}> {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error("invalid_month");

  const params = new URLSearchParams();
  params.set("aggregate[count]", "id");
  params.set("aggregate[sum]", "price_chf");
  params.set("groupBy", "partner");
  params.set("filter[month_bucket][_eq]", month);
  params.set("filter[billable][_eq]", "true");
  params.set("filter[gift][_eq]", "false");
  params.set("filter[disqualified][_eq]", "false");
  params.set("limit", "500");

  const res = await directusFetch<{ data: BillingRow[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );

  const rows = (res?.data ?? []).map((r) => ({
    partnerId: r.partner,
    leadCount:
      typeof r.count?.id === "string" ? parseInt(r.count.id, 10) : (r.count?.id ?? 0),
    totalChf:
      typeof r.sum?.price_chf === "string"
        ? parseInt(r.sum.price_chf, 10)
        : (r.sum?.price_chf ?? 0),
  }));

  return {
    month,
    rows,
    totalChf: rows.reduce((s, r) => s + (r.totalChf ?? 0), 0),
  };
}

interface ReconcileRow {
  id: string;
  dispatched_at: string;
  disqualified: boolean;
  gift: boolean;
  billable: boolean;
  partner: { disqualification_overrides: Record<string, number> | null } | null;
}

/**
 * Backstop that flips billable=true on any non-gift, non-disqualified dispatch
 * whose current-stage window has elapsed without movement.
 *
 * When `dryRun: true`, computes the candidate ids but performs ZERO PATCHes —
 * used by MCP tooling to preview what a reconcile run would lock.
 */
export async function reconcileBilling(
  opts: { dryRun?: boolean; now?: Date } = {},
): Promise<{ locked: number; ids: string[]; dryRun: boolean }> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;

  const config = await fetchDispatchConfig();

  const params = new URLSearchParams();
  params.set(
    "fields",
    "id,dispatched_at,disqualified,gift,billable,partner.disqualification_overrides",
  );
  params.set("filter[status][_eq]", "dispatched");
  params.set("filter[billable][_eq]", "false");
  params.set("filter[disqualified][_eq]", "false");
  params.set("filter[gift][_eq]", "false");
  params.set("limit", "1000");

  const res = await directusFetch<{ data: ReconcileRow[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );

  const toLock: string[] = [];
  for (const r of res?.data ?? []) {
    if (
      isAcceptanceExpired(
        r.dispatched_at,
        config.billing,
        r.partner?.disqualification_overrides ?? null,
        now,
      )
    ) {
      toLock.push(r.id);
    }
  }

  if (!dryRun) {
    for (const id of toLock) {
      await directusFetch(`/items/partner_dispatches/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          billable: true,
          billable_locked_at: now.toISOString(),
        }),
        next: { revalidate: 0 },
      });
    }
  }

  return { locked: toLock.length, ids: toLock, dryRun };
}

const DISPATCH_FIELDS = [
  "id",
  "dispatched_at",
  "status",
  "canton",
  "mode_used",
  "month_bucket",
  "environment",
  "submission",
  "partner.id",
  "partner.slug",
  "partner.name",
  "partner.notification_email",
].join(",");

export interface DispatchRow {
  id: string;
  dispatched_at: string;
  status: string;
  canton: string;
  mode_used: string;
  month_bucket: string;
  environment: string;
  submission: string;
  partner: { id: string; slug: string; name: string; notification_email: string } | null;
}

/**
 * Read-only view of the partner_dispatches ledger. Filters to current
 * environment by default (pass `env: "all"` to skip the filter).
 */
export async function listDispatches(
  opts: {
    limit?: number;
    canton?: string | null;
    status?: string | null;
    partner?: string | null;
    env?: string | null;
  } = {},
): Promise<{ count: number; environment: string; rows: DispatchRow[] }> {
  const limit = Math.min(opts.limit || 20, 200);
  const canton = opts.canton;
  const status = opts.status;
  const envParam = opts.env;
  const partner = opts.partner;

  const params = new URLSearchParams();
  params.set("fields", DISPATCH_FIELDS);
  params.set("sort", "-dispatched_at");
  params.set("limit", String(limit));
  if (envParam !== "all") {
    params.set("filter[environment][_eq]", envParam ?? getEnvironment());
  }
  if (canton) params.set("filter[canton][_eq]", canton.toUpperCase());
  if (status) params.set("filter[status][_eq]", status);
  if (partner) params.set("filter[partner][slug][_eq]", partner);

  const res = await directusFetch<{ data: DispatchRow[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );

  return {
    count: res?.data?.length ?? 0,
    environment: envParam ?? getEnvironment(),
    rows: res?.data ?? [],
  };
}
