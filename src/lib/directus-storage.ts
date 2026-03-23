import { directusFetch } from "./directus";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { FormSession, FormUser, FormSubmission } from "@shared/types";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(raw);
  if (parsed?.isValid()) return parsed.format("E.164");
  return raw;
}

/** Tag records with environment so dev/staging/prod submissions are distinguishable. */
function getEnvironment(): string {
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
          body: JSON.stringify({ ...data, environment: getEnvironment() }),
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
            first_name: data.first_name || user.first_name,
            last_name: data.last_name || user.last_name,
            phone: normalizePhone(data.phone) || user.phone,
            submission_count: (user.submission_count || 0) + 1,
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
          ...data,
          phone: normalizePhone(data.phone),
          submission_count: 1,
        }),
        next: { revalidate: 0 },
      },
    );
    return result.data;
  }

  async createFormSubmission(
    data: CreateSubmissionData,
  ): Promise<FormSubmission> {
    const result = await directusFetch<{ data: FormSubmission }>(
      "/items/form_submissions",
      {
        method: "POST",
        body: JSON.stringify({
          ...data,
          status: data.status ?? "success",
          environment: getEnvironment(),
        }),
        next: { revalidate: 0 },
      },
    );
    return result.data;
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
}

export const storage = new DirectusStorage();
