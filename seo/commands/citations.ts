import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as client from "dataforseo-client";
import { didSearch, parsePrompts, summarizeSources } from "../lib/citations";
import { dataDir, requireEnv, site } from "../lib/config";
import { createLogger } from "../lib/logger";
import { appendRows, ensureTab } from "../lib/sheets";
import { AI_CITATIONS_HEADERS } from "../lib/tab-schemas";

const log = createLogger("citations");
const PROMPTS_FILE = resolve(__dirname, "../prompts/ai-citations-2026.md");
const BASE_URL = "https://api.dataforseo.com";
// Observed 2026-11-15: ~$0.008 per ChatGPT Live answer (balance $1.000 -> $0.984 after two). The vendor lists $0.004 per result page.
const LIVE_PRICE_USD = 0.008;
const OK = 20000;
type Engine = "chatgpt" | "gemini";

const arg = (name: string) => {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => process.argv.slice(2).includes(`--${name}`);

/** The SDK's exception message is generic; the vendor's status and body say what actually went wrong. */
function describeError(err: unknown): { text: string; fatal: boolean } {
  const e = err as { message?: string; status?: number; response?: string };
  if (typeof e.status === "number") {
    let detail = (e.response ?? "").slice(0, 300);
    try {
      detail = (JSON.parse(e.response ?? "") as { status_message?: string }).status_message ?? detail;
    } catch {
      // Not JSON: keep the raw text.
    }
    // 401/403 are about the credentials or the account (e.g. "verify your account"): retrying cannot help.
    return { text: `HTTP ${e.status}: ${detail}`, fatal: e.status === 401 || e.status === 403 };
  }
  return { text: e.message ?? String(err), fatal: false };
}

/** HTTP Basic auth for the SDK, from DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD (the "API Access" password, not the account one). */
function authenticatedFetch(login: string, password: string): typeof fetch {
  const token = btoa(`${login}:${password}`);
  return (url, init) =>
    fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), Authorization: `Basic ${token}` } });
}

/**
 * Asks ChatGPT and Gemini the frozen prompts through DataForSEO's LLM scraper
 * and logs which domains each answer cites. Replaces the manual monthly check
 * (docs/seo.md); keep a quarterly manual spot-check to calibrate.
 *
 *   npm run seo -- citations --dry-run            # what would run and what it would cost; no network
 *   npm run seo -- citations --limit 3            # trial: first 3 prompts, both engines
 *   npm run seo -- citations [--repeats 3] [--engine chatgpt|gemini] [--max-cost usd] [--location 2756] [--language fr] [--no-sheet]
 *
 * ChatGPT is asked with force_web_search on, so every answer carries sources; Gemini has no such switch.
 * Each prompt runs `--repeats` times (default 3) because one answer is noisy: read the share of runs that cite us.
 */
export async function citations(): Promise<void> {
  const prompts = parsePrompts(readFileSync(PROMPTS_FILE, "utf-8")).slice(0, Number(arg("limit") ?? Infinity));
  const engines: Engine[] = arg("engine") ? [arg("engine") as Engine] : ["chatgpt", "gemini"];
  if (engines.some((e) => e !== "chatgpt" && e !== "gemini")) throw new Error('--engine must be "chatgpt" or "gemini"');
  const locationCode = Number(arg("location") ?? 2756); // Switzerland
  const languageCode = arg("language") ?? "fr";
  const repeats = Number(arg("repeats") ?? 3);
  const requests = prompts.length * engines.length * repeats;
  const estimate = requests * LIVE_PRICE_USD;
  // Default cap: 50% above the estimate, so a price change stops the run instead of silently doubling it.
  const maxCost = Number(arg("max-cost") ?? Math.max(0.5, estimate * 1.5));

  console.log(`${prompts.length} prompts x ${engines.join(" + ")} x ${repeats} runs = ${requests} requests, location ${locationCode}, language ${languageCode}`);
  console.log(`Estimated cost: about $${estimate.toFixed(2)} (spending cap $${maxCost.toFixed(2)})`);
  if (has("dry-run")) return;

  const api = new client.AiOptimizationApi(BASE_URL, {
    fetch: authenticatedFetch(requireEnv("DATAFORSEO_LOGIN"), requireEnv("DATAFORSEO_PASSWORD")),
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const rows: Record<string, string | number>[] = [];
  const raw: unknown[] = [];
  let spent = 0;
  let failures = 0;
  /** Set instead of throwing, so the answers already paid for are still saved before we report the failure. */
  let stopped: Error | null = null;

  outer: for (let run = 1; run <= repeats; run++) {
    for (const prompt of prompts) {
    for (const engine of engines) {
      if (spent >= maxCost) {
        log.warn(`Spending cap $${maxCost} reached after $${spent.toFixed(4)}; stopping`);
        break outer;
      }
      const fields = { keyword: prompt.text, location_code: locationCode, language_code: languageCode };
      const label = `run ${run} P${prompt.id} ${engine}`;
      try {
        const res =
          engine === "chatgpt"
            ? await api.chatGptLlmScraperLiveAdvanced([new client.AiOptimizationChatGptLlmScraperLiveAdvancedRequestInfo({ ...fields, force_web_search: true })])
            : await api.geminiLlmScraperLiveAdvanced([new client.AiOptimizationGeminiLlmScraperLiveAdvancedRequestInfo(fields)]);
        spent += res?.cost ?? 0;
        // The account-level errors (e.g. 40104 "verify your account") come back on the root, with no task at all.
        if (res?.status_code !== OK) {
          const text = `${res?.status_code} ${res?.status_message}`;
          log.error(`${label}: ${text}`);
          // 401xx auth/account, 402xx payment (e.g. insufficient funds): retrying cannot help.
          if ((res?.status_code ?? 0) >= 40100 && (res?.status_code ?? 0) < 40300) {
            stopped = new Error(text);
            break outer;
          }
          failures++;
          if (failures >= 3) {
            stopped = new Error(`3 failed requests in a row; last: ${text}`);
            break outer;
          }
          continue;
        }
        const task = res?.tasks?.[0];
        if (task?.status_code !== OK) {
          failures++;
          log.error(`${label}: ${task?.status_code} ${task?.status_message}`);
          if (failures >= 3) {
            stopped = new Error(`3 failed requests in a row; last: ${task?.status_code} ${task?.status_message}`);
            break outer;
          }
          continue;
        }
        failures = 0;
        const result = task.result?.[0];
        raw.push({ run, prompt, engine, result });
        const summary = summarizeSources(result?.sources, new URL(site.siteUrl).hostname);
        const searched = didSearch(result);
        rows.push({ date: stamp, run, prompt: prompt.text, engine, searched, ...summary });
        log.info(`${label}: ${summary.easyrecharge_cited === "yes" ? `cited (rank ${summary.rank})` : searched === "yes" ? "not cited" : "no search"}`);
      } catch (err) {
        const { text, fatal } = describeError(err);
        log.error(`${label} failed: ${text}`);
        failures++;
        if (fatal || failures >= 3) {
          stopped = new Error(fatal ? text : `3 failed requests in a row; last: ${text}`);
          break outer;
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    }
  }

  mkdirSync(resolve(dataDir, "citations"), { recursive: true });
  // Time in the name: two runs on the same day must not overwrite each other.
  const rawFile = `${stamp}-${new Date().toISOString().slice(11, 19).replaceAll(":", "")}.json`;
  writeFileSync(resolve(dataDir, "citations", rawFile), JSON.stringify(raw, null, 2));

  if (!has("no-sheet") && rows.length) {
    await ensureTab(site.sheetsTabNames.aiCitations, AI_CITATIONS_HEADERS);
    const res = await appendRows(site.sheetsTabNames.aiCitations, rows);
    log.info(`AI Citations tab: appended ${res.appended} rows`);
  }

  const cited = rows.filter((r) => r.easyrecharge_cited === "yes").length;
  console.log(`\n--- AI citations${has("no-sheet") ? " (Sheet untouched)" : ""} ---`);
  console.log(`Answers: ${rows.length} | easyrecharge.ch cited in ${cited} | spent about $${spent.toFixed(4)}`);
  for (const engine of engines) {
    const mine = rows.filter((r) => r.engine === engine);
    const searched = mine.filter((r) => r.searched === "yes");
    const cited = searched.filter((r) => r.easyrecharge_cited === "yes").length;
    console.log(
      `  ${engine}: cited in ${cited}/${searched.length} answers that searched ` +
        `(${searched.length ? Math.round((cited / searched.length) * 100) : 0}%); ${mine.length - searched.length} answered without searching`,
    );
  }
  console.log(`Raw answers (incl. fan-out queries): seo/data/citations/${rawFile}`);
  if (stopped) {
    console.log(`\nStopped early: ${(stopped as Error).message}`);
    throw stopped;
  }
}
