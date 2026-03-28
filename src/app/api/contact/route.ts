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

async function getContactWebhookUrl(): Promise<string | null> {
  try {
    const result = await directusFetch<{ data: { global_config?: { webhooks?: { contact?: string } } }[] }>(
      `/items/site_settings?fields=global_config&filter[status][_eq]=published`,
      { next: { revalidate: 300 } },
    );
    const raw = result?.data;
    const record = Array.isArray(raw) ? raw[0] : raw;
    return record?.global_config?.webhooks?.contact ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, phone, phoneCountry, message } = body;

    if (!firstName || !lastName || !email || !message) {
      const posthog = getPostHogServer();
      posthog.capture({
        distinctId: "anonymous",
        event: "server_form_validation_failed",
        properties: {
          form_type: "contact",
          missing_fields: [!firstName && "firstName", !lastName && "lastName", !email && "email", !message && "message"].filter(Boolean),
        },
      });
      after(() => posthog.flush());
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 },
      );
    }

    // Persist to Directus
    const sessionToken = randomUUID();
    const referer = req.headers.get("referer");
    const refererUrl = referer ? new URL(referer) : null;

    const session = await storage.createOrGetFormSession(sessionToken, {
      session_token: sessionToken,
      form_type: "contact",
      locale: req.headers.get("accept-language")?.split(",")[0] ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
      location_path: refererUrl?.pathname ?? null,
      location_route: "contact",
      location_params: refererUrl?.search.slice(1) || null,
    });

    const formUser = await storage.createOrUpdateFormUser({
      email,
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      phone: phone ?? null,
    });

    const { attribution: _a, firstName: _fn, lastName: _ln, email: _em, phone: _p, phoneCountry: _pc, ...contactData } = body;

    await storage.createFormSubmission({
      session: session.id,
      user: formUser.id,
      form_type: "contact",
      location_route: "contact",
      location_path: refererUrl?.pathname ?? null,
      location_params: refererUrl?.search.slice(1) || null,
      data: contactData,
      status: "success",
    });

    // Fire webhook
    const webhookUrl = await getContactWebhookUrl();
    if (webhookUrl) {
      const webhookPayload = {
        submission: {
          formType: "contact",
          submittedAt: new Date().toISOString(),
          data: {
            company: body.company || null,
            address: body.address || null,
            streetName: body.streetName || null,
            streetNb: body.streetNb || null,
            postalCode: body.postalCode || null,
            locality: body.locality || null,
            canton: body.canton || null,
            country: body.country || null,
            subject: body.subject || null,
            message,
          },
        },
        user: {
          email,
          firstName,
          lastName,
          phone: parsePhone(phone, phoneCountry),
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
          console.error("[Contact] Webhook returned:", webhookRes.status);
          const posthog = getPostHogServer();
          posthog.capture({
            distinctId: "anonymous",
            event: "server_webhook_failed",
            properties: { form_type: "contact", status: webhookRes.status },
          });
          after(() => posthog.flush());
        }
      } catch (err) {
        console.error("[Contact] Webhook failed:", err);
        const posthog = getPostHogServer();
        posthog.captureException(err, "anonymous", {
          form_type: "contact",
          context: "webhook_delivery",
        });
        after(() => posthog.flush());
      }
    }

    return NextResponse.json({ success: true, message: "Message reçu avec succès" });
  } catch (error) {
    console.error("[Contact] Submission error:", error);
    try {
      const posthog = getPostHogServer();
      posthog.captureException(error, "anonymous", {
        form_type: "contact",
        context: "form_submission",
      });
      after(() => posthog.flush());
    } catch { /* don't let PostHog break the error response */ }
    return NextResponse.json(
      { message: "Erreur lors de l'envoi du message" },
      { status: 500 },
    );
  }
}
