import { after } from "next/server";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { directusFetch } from "@/lib/directus";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";
import type { DispatchResult } from "./types";

export type WebhookTrigger = "quote_submission" | "manual_dispatch";

export function parsePhone(raw: string | null | undefined, defaultCountry: string = "CH") {
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

export async function getQuoteWebhookUrl(): Promise<string | null> {
  try {
    const result = await directusFetch<{ data: { global_config?: { webhooks?: { quote?: string } } }[] }>(
      `/items/site_settings?fields=global_config&filter[status][_eq]=published`,
      { next: { revalidate: 3600 } },
    );
    const raw = result?.data;
    const record = Array.isArray(raw) ? raw[0] : raw;
    return record?.global_config?.webhooks?.quote ?? null;
  } catch {
    return null;
  }
}

export interface QuoteWebhookParts {
  submission: {
    id: string;
    locationHost: string | null;
    locationPath: string | null;
    submittedAt: string;
    environment: string;
    miniQuoteSessionToken: string | null;
    leadCategory: string;
    product: string;
    isRepeat: boolean;
    data: Record<string, unknown>;
  };
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: ReturnType<typeof parsePhone>;
    language: string | null;
  };
  session: {
    id: string;
    token: string | null;
    locale: string | null;
    userAgent: string | null;
    ip: string | null;
  };
  posthog: { distinctId: string | null; personUrl: string | null };
  attribution: Record<string, unknown>;
  dispatch: DispatchResult;
  trigger: WebhookTrigger;
}

/**
 * Human-readable reference shown in partner emails/SMS. Format:
 *   P / {UPPER(trim(lastName))} / {postalCode} {locality} / {YYYY-MM-DD}
 * Missing pieces render as empty segments; the skeleton is always present.
 */
export function buildQuoteRef(input: {
  lastName: string | null;
  postalCode: string | null;
  locality: string | null;
  submittedAt: string;
}): string {
  const last = (input.lastName ?? "").trim().toUpperCase();
  const postal = (input.postalCode ?? "").trim();
  const loc = (input.locality ?? "").trim();
  const date = (input.submittedAt ?? "").slice(0, 10);
  return `P / ${last} / ${postal} ${loc} / ${date}`;
}

export function buildQuoteWebhookPayload(parts: QuoteWebhookParts) {
  const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";
  const data = parts.submission.data;
  const postalCode = typeof data.postalCode === "string" ? data.postalCode : "";
  const locality = typeof data.locality === "string" ? data.locality : "";

  const ref = buildQuoteRef({
    lastName: parts.user.lastName,
    postalCode,
    locality,
    submittedAt: parts.submission.submittedAt,
  });

  const host = parts.submission.locationHost
    ? `https://${parts.submission.locationHost}`
    : SITE_URL;
  const path = (parts.submission.locationPath ?? "").replace(/\/+$/, "");
  const request_url = `${host}${path}/${parts.submission.id}`;

  const dispatch = {
    ...parts.dispatch,
    targets: parts.dispatch.targets.map((t) => ({
      ...t,
      crmUrl: t.dashboardToken
        ? `${SITE_URL}/${t.language}/partners/${t.dashboardToken}/leads`
        : null,
    })),
  };

  return {
    submission: {
      id: parts.submission.id,
      formType: "quote",
      locationRoute: "quote",
      locationHost: parts.submission.locationHost,
      locationPath: parts.submission.locationPath,
      submittedAt: parts.submission.submittedAt,
      environment: parts.submission.environment,
      miniQuoteSessionToken: parts.submission.miniQuoteSessionToken,
      product: parts.submission.product,
      leadCategory: parts.submission.leadCategory,
      isRepeat: parts.submission.isRepeat,
      trigger: parts.trigger,
      ref,
      request_url,
      data: parts.submission.data,
    },
    user: parts.user,
    session: parts.session,
    posthog: parts.posthog,
    attribution: parts.attribution,
    dispatch,
  };
}

export type QuoteWebhookPayload = ReturnType<typeof buildQuoteWebhookPayload>;

export async function fireQuoteWebhook(
  url: string,
  payload: QuoteWebhookPayload,
  ctx: { submissionId: string; distinctId: string | null },
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[Quote] Webhook returned:", res.status);
      serverLog("WARNING", "Webhook returned non-OK status", { route: "quote", status: res.status, submission_id: ctx.submissionId });
      const posthog = getPostHogServer();
      posthog.capture({
        distinctId: ctx.distinctId ?? "anonymous",
        event: "server_webhook_failed",
        properties: { form_type: "quote", submission_id: ctx.submissionId, status: res.status },
      });
      after(() => posthog.flush());
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.error("[Quote] Webhook failed:", err);
    serverLog("ERROR", "Webhook delivery failed", { route: "quote", submission_id: ctx.submissionId, error: err instanceof Error ? err.message : String(err) });
    const posthog = getPostHogServer();
    posthog.captureException(err, ctx.distinctId ?? "anonymous", {
      form_type: "quote",
      submission_id: ctx.submissionId,
      context: "webhook_delivery",
    });
    after(() => posthog.flush());
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
