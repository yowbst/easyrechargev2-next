import { directusFetch } from "./directus";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { FormSession, FormUser, FormSubmission } from "@shared/types";
import { normalizeName } from "@/lib/form-hygiene";
import { serverLog } from "@/lib/posthog-server";

/** Truncate a string to fit Directus VARCHAR columns (default 255). */
function truncate(value: string | null | undefined, max = 255): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

const TRUNCATION_MARKER = "…[truncated]";

/**
 * Directus rejects an oversized value with a 400 whose message contains
 * "too long" (the `form_submissions.data` column is a bounded string rather
 * than a text/json column). Detect that specific failure so we can degrade
 * gracefully instead of dropping the whole submission.
 */
export function isValueTooLongError(err: unknown): boolean {
  const message = (err as Error)?.message ?? "";
  return message.includes("400") && /too long/i.test(message);
}

/**
 * Produce a size-capped copy of a submission `data` object that serializes to
 * at most `maxLen` characters, so it fits a bounded Directus column. String
 * values are shrunk longest-first (marked as truncated); the result is flagged
 * with `_truncated` and the original size so nothing looks complete when it
 * isn't. Guaranteed to return a small object even in the worst case.
 */
export function capSubmissionData(
  data: Record<string, unknown>,
  maxLen: number,
): Record<string, unknown> {
  const originalSize = JSON.stringify(data).length;
  const out: Record<string, unknown> = {
    ...data,
    _truncated: true,
    _original_size: originalSize,
  };

  const asString = (v: unknown): string =>
    typeof v === "string" ? v : JSON.stringify(v ?? null);

  while (JSON.stringify(out).length > maxLen) {
    // Shrink the longest value-bearing field (never the bookkeeping keys).
    let longestKey: string | null = null;
    let longestLen = 0;
    for (const [k, v] of Object.entries(out)) {
      if (k === "_truncated" || k === "_original_size") continue;
      const len = asString(v).length;
      if (len > longestLen) {
        longestLen = len;
        longestKey = k;
      }
    }

    // Nothing left worth shrinking — fall back to a guaranteed-tiny payload.
    if (!longestKey || longestLen <= TRUNCATION_MARKER.length) {
      return {
        _truncated: true,
        _original_size: originalSize,
        _note: "Payload exceeded the Directus data column limit and could not be stored.",
      };
    }

    const current = asString(out[longestKey]);
    const target = Math.max(
      TRUNCATION_MARKER.length,
      Math.floor(current.length / 2),
    );
    out[longestKey] =
      current.slice(0, target - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
  }

  return out;
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(raw);
  if (parsed?.isValid()) return parsed.format("E.164");
  return raw;
}

/** Tag records with environment so dev/staging/prod submissions are distinguishable. */
export function getEnvironment(): "development" | "staging" | "production" {
  // VERCEL_ENV is set automatically by Vercel: "production" | "preview" | "development"
  const vercelEnv = process.env.VERCEL_ENV;
  // VERCEL_GIT_COMMIT_REF gives us the branch name
  const branch = process.env.VERCEL_GIT_COMMIT_REF;

  if (vercelEnv === "preview" || branch === "staging") return "staging";
  if (vercelEnv === "production") return "production";
  return "development";
}

interface CreateSessionData {
  session_token: string;
  form_type: string;
  locale?: string | null;
  user_agent?: string | null;
  location_path?: string | null;
  location_route?: string | null;
  location_params?: string | null;
  color_scheme?: string | null;
  ph_distinct_id?: string | null;
  ph_session_id?: string | null;
}

interface CreateUserData {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  language?: string | null;
  date_terms_accepted?: string | null;
}

interface CreateSubmissionData {
  session: string;
  user: string | null;
  form_type: string;
  location_route?: string | null;
  location_path?: string | null;
  location_params?: string | null;
  data: Record<string, unknown>;
  status?: string;
}

class DirectusStorage {
  async createOrGetFormSession(
    sessionToken: string,
    data: CreateSessionData,
  ): Promise<FormSession> {
    const params = new URLSearchParams();
    params.set("filter[session_token][_eq]", sessionToken);
    params.set("limit", "1");

    const existing = await directusFetch<{ data: FormSession[] }>(
      `/items/form_sessions?${params}`,
      { next: { revalidate: 0 } },
    );
    if (existing?.data?.length > 0) {
      return existing.data[0];
    }

    try {
      const result = await directusFetch<{ data: FormSession }>(
        "/items/form_sessions",
        {
          method: "POST",
          body: JSON.stringify({
            ...data,
            user_agent: truncate(data.user_agent),
            location_path: truncate(data.location_path),
            location_params: truncate(data.location_params),
            environment: getEnvironment(),
          }),
          next: { revalidate: 0 },
        },
      );
      return result.data;
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message?.includes("409")) {
        const retry = await directusFetch<{ data: FormSession[] }>(
          `/items/form_sessions?${params}`,
          { next: { revalidate: 0 } },
        );
        if (retry?.data?.length > 0) return retry.data[0];
      }
      throw err;
    }
  }

  async createOrUpdateFormUser(data: CreateUserData): Promise<FormUser> {
    const params = new URLSearchParams();
    params.set("filter[email][_eq]", data.email);
    params.set("limit", "1");

    const existing = await directusFetch<{ data: FormUser[] }>(
      `/items/form_users?${params}`,
      { next: { revalidate: 0 } },
    );
    if (existing?.data?.length > 0) {
      const user = existing.data[0];
      const result = await directusFetch<{ data: FormUser }>(
        `/items/form_users/${user.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            first_name: (data.first_name ? normalizeName(data.first_name) : "") || user.first_name,
            last_name: (data.last_name ? normalizeName(data.last_name) : "") || user.last_name,
            phone: normalizePhone(data.phone) || user.phone,
            language: data.language || user.language,
            submission_count: (user.submission_count || 0) + 1,
            ...(data.date_terms_accepted && { date_terms_accepted: data.date_terms_accepted }),
          }),
          next: { revalidate: 0 },
        },
      );
      return result.data;
    }

    const result = await directusFetch<{ data: FormUser }>(
      "/items/form_users",
      {
        method: "POST",
        body: JSON.stringify({
          email: data.email,
          first_name: data.first_name ? normalizeName(data.first_name) : data.first_name,
          last_name: data.last_name ? normalizeName(data.last_name) : data.last_name,
          phone: normalizePhone(data.phone),
          language: data.language || null,
          date_terms_accepted: data.date_terms_accepted || null,
          submission_count: 1,
          environment: getEnvironment(),
        }),
        next: { revalidate: 0 },
      },
    );
    return result.data;
  }

  async createFormSubmission(
    data: CreateSubmissionData,
  ): Promise<FormSubmission> {
    const post = (payload: Record<string, unknown>) =>
      directusFetch<{ data: FormSubmission }>("/items/form_submissions", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          data: payload,
          status: data.status ?? "success",
          environment: getEnvironment(),
        }),
        next: { revalidate: 0 },
      });

    // The real fix for oversized payloads is widening the Directus
    // `form_submissions.data` column to a text/json type (CMS-side schema
    // change). Until that lands, don't let an oversized `data` fail the whole
    // write: a thrown error here aborts the route before the lead webhook
    // fires, silently losing the lead on the core quote flow. Instead, retry
    // with a progressively size-capped copy so the row (and the downstream
    // webhook/dispatch, which still gets the full payload) survives. The
    // truncated copy is flagged and logged, so the loss is never silent.
    let payload = data.data;
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await post(payload);
        return result.data;
      } catch (err: unknown) {
        if (isValueTooLongError(err) && attempt < maxAttempts) {
          const target = Math.max(200, Math.floor(JSON.stringify(payload).length / 2));
          payload = capSubmissionData(data.data, target);
          serverLog("WARNING", "form_submission data truncated to fit Directus column", {
            form_type: data.form_type,
            session: data.session,
            original_size: JSON.stringify(data.data).length,
            target_size: target,
            attempt,
          });
          continue;
        }
        throw err;
      }
    }

    // Unreachable: the final attempt either returns or throws above.
    throw new Error("[DirectusStorage] createFormSubmission: max attempts reached");
  }

  async getSubmissionById(id: string): Promise<{
    submission: FormSubmission;
    user: FormUser | null;
    session: FormSession | null;
  } | null> {
    try {
      const result = await directusFetch<{ data: FormSubmission }>(
        `/items/form_submissions/${id}?fields=*,user.*,session.*`,
        { next: { revalidate: 0 } },
      );
      if (!result?.data) return null;

      const submission = result.data;
      return {
        submission,
        user:
          typeof submission.user === "object"
            ? (submission.user as FormUser)
            : null,
        session:
          typeof submission.session === "object"
            ? (submission.session as FormSession)
            : null,
      };
    } catch {
      return null;
    }
  }

  async listSubmissions(
    opts: { limit?: number; formType?: string; status?: string; environment?: string } = {},
  ): Promise<FormSubmission[]> {
    const params = new URLSearchParams();
    params.set("fields", "*,user.*,session.*");
    params.set("sort", "-date_created");
    params.set("limit", String(Math.min(Math.max(opts.limit ?? 20, 1), 200)));
    const env = opts.environment ?? getEnvironment();
    if (env !== "all") params.set("filter[environment][_eq]", env);
    if (opts.formType) params.set("filter[form_type][_eq]", opts.formType);
    if (opts.status) params.set("filter[status][_eq]", opts.status);
    const res = await directusFetch<{ data: FormSubmission[] }>(`/items/form_submissions?${params.toString()}`, {
      next: { revalidate: 0 },
    });
    return res?.data ?? [];
  }
}

export const storage = new DirectusStorage();
