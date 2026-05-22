import { directusFetch } from "@/lib/directus";
import type {
  Environment,
  PartnerArea,
  DispatchStatus,
  AreaMode,
} from "./types";

const PARTNER_AREA_FIELDS = [
  "id",
  "mode",
  "priority_override",
  "quota_override",
  "canton.id",
  "canton.code",
  "canton.is_active",
  "partner.id",
  "partner.status",
  "partner.name",
  "partner.slug",
  "partner.notification_email",
  "partner.monthly_quota",
  "partner.priority",
  "partner.language",
  "partner.billable_rate",
  "partner.environment",
  // Business identification (sent in dispatch.targets[]).
  "partner.business_name",
  "partner.legal_form",
  "partner.uid",
  "partner.street_name",
  "partner.street_number",
  "partner.postal_code",
  "partner.locality",
  "partner.canton.id",
  "partner.canton.code",
].join(",");

/**
 * Fetch partner_areas for a canton, joined with their partner and the canton row.
 * Filters out paused partners, partners outside the current environment, and
 * inactive cantons (canton.is_active = false treats the canton as not-dispatchable,
 * matching the existing convention used by fetchCantonCoats for LI).
 */
export async function fetchPartnerAreasForCanton(
  cantonCode: string,
  environment: Environment,
): Promise<PartnerArea[]> {
  const params = new URLSearchParams();
  params.set("fields", PARTNER_AREA_FIELDS);
  params.set("filter[canton][code][_eq]", cantonCode);
  params.set("filter[canton][is_active][_eq]", "true");
  params.set("filter[partner][status][_eq]", "active");
  params.set("filter[partner][environment][_eq]", environment);
  params.set("filter[status][_eq]", "published");
  params.set("limit", "100");

  const res = await directusFetch<{ data: PartnerArea[] }>(
    `/items/partner_areas?${params}`,
    { next: { revalidate: 0 } },
  );
  return res?.data ?? [];
}

/**
 * Count `dispatched` ledger rows for the given partners in the current UTC month.
 * One Directus call, grouped by partner.
 */
export async function countDispatchesThisMonth(
  partnerIds: string[],
  environment: Environment,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (partnerIds.length === 0) return counts;

  const params = new URLSearchParams();
  params.set("aggregate[count]", "id");
  params.set("groupBy", "partner");
  params.set("filter[month_bucket][_eq]", currentMonthBucket());
  params.set("filter[status][_eq]", "dispatched");
  params.set("filter[environment][_eq]", environment);
  params.set("filter[partner][_in]", partnerIds.join(","));

  type Row = { partner: string; count: { id: string | number } };
  const res = await directusFetch<{ data: Row[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );
  for (const row of res?.data ?? []) {
    const n = typeof row.count?.id === "string" ? parseInt(row.count.id, 10) : (row.count?.id ?? 0);
    if (row.partner) counts.set(row.partner, n);
  }
  return counts;
}

export interface RecordDispatchInput {
  submission: string;
  partner: string;
  canton: string;
  mode_used: AreaMode;
  status: DispatchStatus;
  environment: Environment;
}

/** Insert one `partner_dispatches` row. */
export async function recordDispatch(input: RecordDispatchInput): Promise<void> {
  await directusFetch(`/items/partner_dispatches`, {
    method: "POST",
    body: JSON.stringify({
      ...input,
      month_bucket: currentMonthBucket(),
      dispatched_at: new Date().toISOString(),
    }),
    next: { revalidate: 0 },
  });
}

/** Fetch `site_settings.global_config.dispatch` config (singleton). */
export async function fetchDispatchConfig(): Promise<{
  max_shared_targets: number;
  test_email_patterns: string[];
}> {
  type Resp = {
    data:
      | {
          global_config?: {
            dispatch?: { max_shared_targets?: number; test_email_patterns?: string[] };
          };
        }
      | null;
  };
  try {
    const res = await directusFetch<Resp>(
      `/items/site_settings?fields=global_config.dispatch`,
      { next: { revalidate: 60 } },
    );
    const cfg = res?.data?.global_config?.dispatch ?? {};
    return {
      max_shared_targets: cfg.max_shared_targets ?? 1,
      test_email_patterns: cfg.test_email_patterns ?? [],
    };
  } catch {
    return { max_shared_targets: 1, test_email_patterns: [] };
  }
}

export function currentMonthBucket(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
