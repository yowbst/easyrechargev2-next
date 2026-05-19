import { NextResponse } from "next/server";
import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";

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

/**
 * Read-only view of the partner_dispatches ledger. Filters to current
 * environment by default. Useful for spot-checking shadow vs. live behavior
 * without opening Directus admin.
 *
 *   GET /api/debug/dispatches?limit=20
 *   GET /api/debug/dispatches?canton=VD
 *   GET /api/debug/dispatches?status=skipped_quota
 *   GET /api/debug/dispatches?env=all   (skip environment filter)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 200);
  const canton = searchParams.get("canton");
  const status = searchParams.get("status");
  const envParam = searchParams.get("env");
  const partner = searchParams.get("partner");

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

  try {
    const res = await directusFetch<{ data: unknown[] }>(
      `/items/partner_dispatches?${params}`,
      { next: { revalidate: 0 } },
    );
    return NextResponse.json({
      count: res?.data?.length ?? 0,
      environment: envParam ?? getEnvironment(),
      rows: res?.data ?? [],
    });
  } catch (error) {
    console.error("[Debug Dispatches] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dispatches", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
