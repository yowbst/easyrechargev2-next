import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import { lockAcceptedDispatches } from "./lifecycle";

/**
 * Backstop that locks billing on every dispatched lead whose acceptance
 * window has ended. The rule lives in the Dispatch lifecycle module.
 *
 * When `dryRun: true`, computes the candidate ids but performs ZERO PATCHes —
 * used by MCP tooling to preview what a reconcile run would lock.
 */
export const reconcileBilling = lockAcceptedDispatches;

const DISPATCH_FIELDS = [
  "id",
  "dispatched_at",
  "status",
  "product",
  "lead_category",
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
  product: string | null;
  lead_category: string | null;
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
    product?: string | null;
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
  if (opts.product) params.set("filter[product][_eq]", opts.product);

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
