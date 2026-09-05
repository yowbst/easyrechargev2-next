export const DIRECTUS_URL = process.env.DIRECTUS_URL!;
export const DIRECTUS_DEFAULT_LOCALE =
  process.env.DIRECTUS_DEFAULT_LOCALE || "fr-FR";

interface DirectusFetchOptions extends RequestInit {
  next?: NextFetchRequestConfig;
  /**
   * Set `false` to disable the transient-error retry for this call only.
   *
   * The retry is safe for reads and for idempotent writes, and every existing
   * caller relies on it. It is NOT safe for a non-idempotent POST: a 502 from a
   * restarting Directus can be returned *after* the row was created, so retrying
   * writes a second row. Money-critical POSTs (invoice + invoice lines) opt out
   * and fail loudly instead of risking a duplicate. Defaults to `true`.
   */
  retry?: boolean;
}

/**
 * Fetch from Directus with bearer token, timeout, and retry on transient errors.
 * Accepts Next.js `next` cache options for ISR (revalidate, tags).
 */
export async function directusFetch<T = Record<string, unknown>>(
  path: string,
  init: DirectusFetchOptions = {},
): Promise<T> {
  const url = `${DIRECTUS_URL}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const { next: nextOptions, retry, ...fetchInit } = init;

  const maxAttempts = retry === false ? 1 : 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...fetchInit,
        headers,
        signal: AbortSignal.timeout(30_000),
        next: nextOptions,
      });
      if (!res.ok) {
        const text = await res.text();
        const status = res.status;
        // 404, 502, 503 are transient during Directus restarts — retry before failing
        const isTransientStatus = status === 404 || status === 502 || status === 503;
        if (isTransientStatus && attempt < maxAttempts) {
          console.warn(
            `[Directus] ${status} on attempt ${attempt}, retrying in ${attempt}s: ${path}`,
          );
          await new Promise((r) => setTimeout(r, attempt * 1000));
          continue;
        }
        throw new Error(`Directus ${status}: ${text}`);
      }
      return res.json() as Promise<T>;
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      const isTimeout =
        error.name === "TimeoutError" || error.code === "UND_ERR_CONNECT_TIMEOUT";
      const isRetryable =
        isTimeout ||
        error.message?.includes("fetch failed") ||
        error.message?.includes("pressure");
      if (isRetryable && attempt < maxAttempts) {
        console.warn(
          `[Directus] ${isTimeout ? "Timeout" : "Connection error"} on attempt ${attempt}, retrying in ${attempt}s: ${path}`,
        );
        await new Promise((r) => setTimeout(r, attempt * 1000));
        continue;
      }
      throw err;
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("[Directus] Max attempts reached");
}
