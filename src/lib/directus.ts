export const DIRECTUS_URL = process.env.DIRECTUS_URL!;
export const DIRECTUS_DEFAULT_LOCALE =
  process.env.DIRECTUS_DEFAULT_LOCALE || "fr-FR";

interface DirectusFetchOptions extends RequestInit {
  next?: NextFetchRequestConfig;
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

  const { next: nextOptions, ...fetchInit } = init;

  const maxAttempts = 2;
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
        throw new Error(`Directus ${res.status}: ${text}`);
      }
      return res.json() as Promise<T>;
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      const isTimeout =
        error.name === "TimeoutError" || error.code === "UND_ERR_CONNECT_TIMEOUT";
      const isRetryable =
        isTimeout ||
        error.message?.includes("503") ||
        error.message?.includes("pressure");
      if (isRetryable && attempt < maxAttempts) {
        console.warn(
          `[Directus] ${isTimeout ? "Timeout" : "Server error"} on attempt ${attempt}, retrying: ${path}`,
        );
        continue;
      }
      throw err;
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("[Directus] Max attempts reached");
}
