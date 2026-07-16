import { NextResponse } from "next/server";
import { manualDispatch } from "@/lib/dispatch/manual-dispatch";

/**
 * Manually dispatch an existing submission that was never dispatched.
 * Token-gated. Resolves as `live`, writes the ledger, always fires the Make
 * webhook (which also drives the customer confirmation email).
 *
 *   curl -X POST -H "x-admin-token: $DIRECTUS_STATIC_TOKEN" \
 *     "https://.../api/admin/dispatch/<submissionId>"
 *   curl -X POST -H "x-admin-token: $DIRECTUS_STATIC_TOKEN" \
 *     "https://.../api/admin/dispatch/<submissionId>?force=1"
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const adminToken = process.env.DIRECTUS_STATIC_TOKEN;
  const header = req.headers.get("x-admin-token");
  if (!adminToken || header !== adminToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { submissionId } = await params;
  const force = new URL(req.url).searchParams.get("force") === "1";

  const result = await manualDispatch(submissionId, { force });

  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "already_dispatched", existing: result.existing },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    submissionId: result.submissionId,
    mode: result.mode,
    isTest: result.isTest,
    targetCount: result.targetCount,
    webhookFired: result.webhookFired,
    dispatch: result.dispatch,
  });
}
