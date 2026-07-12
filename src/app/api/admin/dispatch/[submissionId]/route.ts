import { NextResponse } from "next/server";
import { storage, getEnvironment } from "@/lib/directus-storage";
import { directusFetch } from "@/lib/directus";
import { runDispatch } from "@/lib/dispatch";
import { deriveLeadCategory } from "@/lib/dispatch/categorize";
import {
  getQuoteWebhookUrl,
  parsePhone,
  buildQuoteWebhookPayload,
  fireQuoteWebhook,
} from "@/lib/dispatch/webhook";
import { serverLog } from "@/lib/posthog-server";

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

  // Load the stored submission + linked user/session.
  const record = await storage.getSubmissionById(submissionId);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { submission, user, session } = record;

  // Guard: refuse if already dispatched, unless forced. Single-hop M2O filter.
  const guardParams = new URLSearchParams();
  guardParams.set("fields", "id");
  guardParams.set("filter[submission][_eq]", submissionId);
  guardParams.set("filter[status][_eq]", "dispatched");
  guardParams.set("limit", "1");
  const guard = await directusFetch<{ data: { id: string }[] }>(
    `/items/partner_dispatches?${guardParams}`,
    { next: { revalidate: 0 } },
  );
  const existing = guard?.data?.length ?? 0;
  if (existing > 0 && !force) {
    return NextResponse.json({ error: "already_dispatched", existing }, { status: 409 });
  }

  // Reconstruct dispatch inputs from stored data.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (submission.data ?? {}) as Record<string, any>;
  const email = user?.email ?? null;
  const locale = user?.language === "de" ? "de" : "fr";
  const leadCategory = deriveLeadCategory(data);
  const rawCanton = typeof data.canton === "string" ? data.canton : null;

  const dispatchResult = await runDispatch({
    submissionId,
    rawCanton,
    email,
    locale,
    leadCategory,
    product: "ecp",
    modeOverride: "live",
  });

  // Always fire the webhook (customer confirmation + partner notification).
  let webhookFired = false;
  const webhookUrl = await getQuoteWebhookUrl();
  if (webhookUrl && email) {
    const phDistinctId = session?.ph_distinct_id ?? null;
    const posthogDashboard = "https://eu.posthog.com/project/103083";
    const payload = buildQuoteWebhookPayload({
      submission: {
        id: submission.id,
        locationHost: null,
        locationPath: submission.location_path ?? null,
        submittedAt: new Date().toISOString(),
        // FormSubmission (src/shared/types.ts) doesn't carry an `environment`
        // field on the typed record, even though the Directus row does — use
        // the runtime environment (matches what runDispatch itself resolves).
        environment: getEnvironment(),
        miniQuoteSessionToken: null,
        leadCategory,
        isRepeat: (dispatchResult.dedup?.skippedPartnerSlugs?.length ?? 0) > 0,
        data,
      },
      user: {
        id: user?.id ?? "",
        email,
        firstName: user?.first_name ?? null,
        lastName: user?.last_name ?? null,
        phone: parsePhone(user?.phone ?? null),
        language: user?.language ?? null,
      },
      session: {
        id: session?.id ?? "",
        token: session?.session_token ?? null,
        locale: session?.locale ?? locale,
        userAgent: session?.user_agent ?? null,
        ip: null,
      },
      posthog: {
        distinctId: phDistinctId,
        personUrl: phDistinctId ? `${posthogDashboard}/person/${phDistinctId}` : null,
      },
      attribution: {},
      dispatch: dispatchResult,
      trigger: "manual_dispatch",
    });
    const fired = await fireQuoteWebhook(webhookUrl, payload, {
      submissionId: submission.id,
      distinctId: phDistinctId,
    });
    webhookFired = fired.ok;
    if (!fired.ok) {
      serverLog("WARNING", "Manual dispatch webhook not delivered", {
        route: "admin/dispatch",
        submission_id: submission.id,
        status: fired.status,
        error: fired.error,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    submissionId: submission.id,
    mode: dispatchResult.mode,
    isTest: dispatchResult.isTest,
    targetCount: dispatchResult.targets.length,
    webhookFired,
    dispatch: dispatchResult,
  });
}
