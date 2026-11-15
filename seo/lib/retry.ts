import type { Logger } from "./logger";

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  logger?: Logger;
}

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: number; code?: number | string; response?: { status?: number } };
  const status = e?.status ?? e?.response?.status ?? e?.code;
  return typeof status === "number" ? status : undefined;
}

/** Retries 429 and 5xx with exponential backoff; anything else throws immediately. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, baseDelay = 1000, logger }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = statusOf(err);
      const transient = status === 429 || (status !== undefined && status >= 500 && status < 600);
      if (!transient || attempt > maxRetries) throw err;

      const delay = baseDelay * 2 ** (attempt - 1);
      logger?.warn(`Transient error (${status}), retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`, {
        status,
        error: (err as Error).message,
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
