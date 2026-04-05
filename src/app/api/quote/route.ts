import { NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { storage } from "@/lib/directus-storage";
import { directusFetch } from "@/lib/directus";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getPostHogServer } from "@/lib/posthog-server";

function parsePhone(raw: string | null | undefined, defaultCountry?: string) {
  if (!raw) return { raw: null, international: null, countryCode: null, countryCallingCode: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = parsePhoneNumberFromString(raw, (defaultCountry as any) ?? undefined);
  if (!parsed) return { raw, international: null, countryCode: null, countryCallingCode: null };
  return {
    raw,
    international: parsed.formatInternational(),
    countryCode: parsed.country ?? null,
    countryCallingCode: `+${parsed.countryCallingCode}`,
  };
}

async function getQuoteWebhookUrl(): Promise<string | null> {
  try {
    const result = await directusFetch<{ data: { global_config?: { webhooks?: { quote?: string } } }[] }>(
      `/items/site_settings?fields=global_config&filter[status][_eq]=published`,
      { next: { revalidate: 300 } },
    );
    const raw = result?.data;
    const record = Array.isArray(raw) ? raw[0] : raw;
    return record?.global_config?.webhooks?.quote ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, phone, phoneCountry } = body;

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
    const sessionToken = randomUUID();
    const phIds = body.posthog ?? {};
    const referer = req.headers.get("referer");
    const refererUrl = referer ? new URL(referer) : null;

    const session = await storage.createOrGetFormSession(sessionToken, {
      session_token: sessionToken,
      form_type: "quote",
      locale: req.headers.get("accept-language")?.split(",")[0] ?? null,
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
      date_terms_accepted: body.acceptTerms ? new Date().toISOString() : null,
    });

    const { attribution: _a, posthog: _ph, firstName: _fn, lastName: _ln, email: _em, phone: _p, phoneCountry: _pc, ...quoteData } = body;

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

    // Fire webhook
    const webhookUrl = await getQuoteWebhookUrl();
    if (webhookUrl) {
      const webhookPayload = {
        submission: {
          id: submission.id,
          sessionId: session.id,
          formType: "quote",
          locationRoute: "quote",
          locationHost: refererUrl?.host ?? req.headers.get("host") ?? null,
          locationPath: refererUrl?.pathname ?? null,
          submittedAt: new Date().toISOString(),
          data: quoteData,
        },
        user: {
          id: formUser.id,
          email,
          firstName,
          lastName,
          phone: parsePhone(phone, phoneCountry),
        },
        session: {
          locale: req.headers.get("accept-language")?.split(",")[0] ?? null,
          userAgent: req.headers.get("user-agent") ?? null,
          ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        },
        attribution: body.attribution ?? {},
      };

      try {
        const webhookRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
        });
        if (!webhookRes.ok) {
          console.error("[Quote] Webhook returned:", webhookRes.status);
          const posthog = getPostHogServer();
          posthog.capture({
            distinctId: phIds.phDistinctId ?? "anonymous",
            event: "server_webhook_failed",
            properties: { form_type: "quote", submission_id: submission.id, status: webhookRes.status },
          });
          after(() => posthog.flush());
        }
      } catch (err) {
        console.error("[Quote] Webhook failed:", err);
        const posthog = getPostHogServer();
        posthog.captureException(err, phIds.phDistinctId ?? "anonymous", {
          form_type: "quote",
          submission_id: submission.id,
          context: "webhook_delivery",
        });
        after(() => posthog.flush());
      }
    }

    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (error) {
    console.error("[Quote] Submission error:", error);
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
