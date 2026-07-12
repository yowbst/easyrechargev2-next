import { NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { storage } from "@/lib/directus-storage";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";
import { runDispatch, normalizeCanton, type DispatchResult } from "@/lib/dispatch";
import { deriveLeadCategory } from "@/lib/dispatch/categorize";
import { getQuoteWebhookUrl, parsePhone, buildQuoteWebhookPayload, fireQuoteWebhook } from "@/lib/dispatch/webhook";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, phone, phoneCountry, lang } = body;

    if (!firstName || !lastName || !email) {
      const posthog = getPostHogServer();
      const distinctId = body.posthog?.phDistinctId ?? "anonymous";
      posthog.capture({
        distinctId,
        event: "server_form_validation_failed",
        properties: {
          form_type: "quote",
          missing_fields: [!firstName && "firstName", !lastName && "lastName", !email && "email"].filter(Boolean),
        },
      });
      after(() => posthog.flush());
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 },
      );
    }

    // Persist to Directus
    // Reuse the mini-quote session if the user came from the mini-quote form,
    // so both submissions are linked under the same session.
    const miniQuoteToken = body.miniQuoteSessionToken;
    const sessionToken = miniQuoteToken || randomUUID();
    const phIds = body.posthog ?? {};
    const referer = req.headers.get("referer");
    const refererUrl = referer ? new URL(referer) : null;

    const session = await storage.createOrGetFormSession(sessionToken, {
      session_token: sessionToken,
      form_type: "quote",
      locale: lang ?? req.headers.get("accept-language")?.split(",")[0] ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
      location_path: refererUrl?.pathname ?? null,
      location_route: "quote",
      location_params: refererUrl?.search.slice(1) || null,
      ph_distinct_id: phIds.phDistinctId ?? null,
      ph_session_id: phIds.phSessionId ?? null,
    });

    const formUser = await storage.createOrUpdateFormUser({
      email,
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      phone: phone ?? null,
      language: lang ?? null,
      date_terms_accepted: body.acceptTerms ? new Date().toISOString() : null,
    });

    const { attribution: _a, posthog: _ph, firstName: _fn, lastName: _ln, email: _em, phone: _p, phoneCountry: _pc, miniQuoteSessionToken: _mqt, lang: _lang, ...quoteData } = body;

    // Normalize canton before persistence so downstream consumers (CRM, ledger,
    // Make payload) all see the 2-letter code. The form sometimes writes the
    // localized name (e.g. "Valais" instead of "VS").
    const normalizedCanton = normalizeCanton(typeof quoteData.canton === "string" ? quoteData.canton : null);
    if (normalizedCanton && quoteData.canton !== normalizedCanton) {
      quoteData.canton = normalizedCanton;
    }

    const submission = await storage.createFormSubmission({
      session: session.id,
      user: formUser.id,
      form_type: "quote",
      location_route: "quote",
      location_path: refererUrl?.pathname ?? null,
      location_params: refererUrl?.search.slice(1) || null,
      data: quoteData,
      status: "success",
    });

    // Resolve partner dispatch. Gated by DISPATCH_MODE env var (off|shadow|live).
    // Returns a payload-ready object embedded in the Make webhook below.
    // runDispatch never throws — failures are logged and surface as an empty result.
    const leadCategory = deriveLeadCategory(quoteData);

    const dispatchResult: DispatchResult = await runDispatch({
      submissionId: submission.id,
      rawCanton: normalizedCanton ?? (typeof quoteData.canton === "string" ? quoteData.canton : null),
      email,
      locale: (lang === "de" ? "de" : "fr"),
      leadCategory,
      product: "ecp",
    });

    // Identify user in PostHog server-side (client may not have loaded yet)
    try {
      const posthog = getPostHogServer();
      const distinctId = phIds.phDistinctId;
      if (distinctId) {
        posthog.identify({
          distinctId,
          properties: {
            email,
            first_name: firstName,
            last_name: lastName,
            locale: lang ?? req.headers.get("accept-language")?.split(",")[0] ?? null,
          },
        });
        after(() => posthog.flush());
      }
    } catch { /* don't block submission */ }

    // Fire webhook
    const webhookUrl = await getQuoteWebhookUrl();
    if (webhookUrl) {
      const phDistinctId = phIds.phDistinctId ?? null;
      const posthogDashboard = "https://eu.posthog.com/project/103083";
      const isRepeat = (dispatchResult.dedup?.skippedPartnerSlugs?.length ?? 0) > 0;

      const payload = buildQuoteWebhookPayload({
        submission: {
          id: submission.id,
          locationHost: refererUrl?.host ?? req.headers.get("host") ?? null,
          locationPath: refererUrl?.pathname ?? null,
          submittedAt: new Date().toISOString(),
          environment: process.env.VERCEL_ENV || "development",
          miniQuoteSessionToken: miniQuoteToken || null,
          leadCategory,
          isRepeat,
          data: quoteData,
        },
        user: {
          id: formUser.id,
          email,
          firstName,
          lastName,
          phone: parsePhone(phone, phoneCountry),
          language: lang ?? null,
        },
        session: {
          id: session.id,
          token: session.session_token ?? null,
          locale: lang ?? req.headers.get("accept-language")?.split(",")[0] ?? null,
          userAgent: req.headers.get("user-agent") ?? null,
          ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        },
        posthog: {
          distinctId: phDistinctId,
          personUrl: phDistinctId ? `${posthogDashboard}/person/${phDistinctId}` : null,
        },
        attribution: body.attribution ?? {},
        dispatch: dispatchResult,
        trigger: "quote_submission",
      });

      await fireQuoteWebhook(webhookUrl, payload, { submissionId: submission.id, distinctId: phDistinctId });
    }

    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (error) {
    console.error("[Quote] Submission error:", error);
    serverLog("ERROR", "Quote submission failed", { route: "quote", error: error instanceof Error ? error.message : String(error) });
    try {
      const posthog = getPostHogServer();
      posthog.captureException(error, "anonymous", {
        form_type: "quote",
        context: "form_submission",
      });
      after(() => posthog.flush());
    } catch { /* don't let PostHog break the error response */ }
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}
