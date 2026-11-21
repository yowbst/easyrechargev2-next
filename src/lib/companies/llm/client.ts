import * as dataforseo from "dataforseo-client";
import { LIVE_PRICE_USD, LOCATION_CODE_SWITZERLAND } from "./config";

export interface LlmReply {
  text: string;
  cost: number;
  model: string | null;
}

/** One prompt in, one answer out. Tests pass a stub; the CLI passes {@link createDataForSeoLlm}. */
export type LlmCall = (prompt: string) => Promise<LlmReply>;

/** Account or payment problem: retrying cannot help, so the run stops. */
export class LlmFatalError extends Error {}

const OK = 20000;

/**
 * The SDK throws on any non-2xx HTTP status with a generic message ("An unexpected
 * server error occurred."); the status and body say what really happened. 401, 402
 * and 403 are about the account (bad login, no funds, not verified): retrying cannot
 * help, so they stop the run.
 */
export function describeSdkError(err: unknown): { message: string; fatal: boolean } {
  const e = err as { message?: string; status?: number; response?: string };
  if (typeof e?.status !== "number") return { message: e?.message ?? String(err), fatal: false };
  let detail = (e.response ?? "").slice(0, 300);
  try {
    detail = (JSON.parse(e.response ?? "") as { status_message?: string }).status_message ?? detail;
  } catch {
    // Not JSON: keep the raw text.
  }
  return { message: `HTTP ${e.status}: ${detail}`, fatal: e.status === 401 || e.status === 402 || e.status === 403 };
}

function authenticatedFetch(login: string, password: string): typeof fetch {
  const token = btoa(`${login}:${password}`);
  return (url, init) =>
    fetch(url, {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), Authorization: `Basic ${token}` },
      signal: AbortSignal.timeout(180_000),
    });
}

/**
 * DataForSEO sometimes answers HTTP 402 under parallel load although the balance is
 * fine (measured 2026-11-20: about 1 call in 8 with 8 in flight, balance $49.92).
 * A rejected call is not charged, so retry it after a pause. A 402 that survives every
 * attempt is treated as a real account problem.
 */
export async function withPaymentRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const delayMs = opts.delayMs ?? 5000;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status !== 402 || attempt >= attempts) throw err;
      await sleep(delayMs * attempt);
    }
  }
}

export function createDataForSeoLlm(
  env: Record<string, string | undefined> = process.env,
  languageCode = "fr",
): LlmCall {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required (the API Access password, not the account one).");
  }
  const api = new dataforseo.AiOptimizationApi("https://api.dataforseo.com", {
    fetch: authenticatedFetch(env.DATAFORSEO_LOGIN, env.DATAFORSEO_PASSWORD),
  });

  return async (prompt) => {
    let res;
    try {
      res = await withPaymentRetry(() =>
        api.geminiLlmScraperLiveAdvanced([
          new dataforseo.AiOptimizationGeminiLlmScraperLiveAdvancedRequestInfo({
            keyword: prompt,
            location_code: LOCATION_CODE_SWITZERLAND,
            language_code: languageCode,
          }),
        ]),
      );
    } catch (err) {
      const { message, fatal } = describeSdkError(err);
      throw fatal ? new LlmFatalError(message) : new Error(message);
    }
    const code = res?.status_code ?? 0;
    // 401xx auth/account, 402xx payment (e.g. insufficient funds).
    if (code >= 40100 && code < 40300) throw new LlmFatalError(`${code} ${res?.status_message}`);
    if (code !== OK) throw new Error(`${code} ${res?.status_message}`);
    const task = res?.tasks?.[0];
    if (task?.status_code !== OK) throw new Error(`${task?.status_code} ${task?.status_message}`);
    const result = task.result?.[0];
    return { text: result?.markdown ?? "", cost: res?.cost ?? LIVE_PRICE_USD, model: result?.model ?? null };
  };
}
