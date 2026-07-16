import { NextResponse } from "next/server";
import { listDispatches } from "@/lib/dispatch/admin";

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
  const limitParam = searchParams.get("limit");
  const limit = limitParam !== null ? parseInt(limitParam, 10) : undefined;
  const canton = searchParams.get("canton");
  const status = searchParams.get("status");
  const envParam = searchParams.get("env");
  const partner = searchParams.get("partner");

  try {
    const result = await listDispatches({
      limit,
      canton,
      status,
      partner,
      env: envParam,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Debug Dispatches] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dispatches", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
