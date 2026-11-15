import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as client from "dataforseo-client";
import { parsePrompts, summarizeSources } from "../lib/citations";
import { dataDir, requireEnv, site } from "../lib/config";
import { createLogger } from "../lib/logger";
import { appendRows, ensureTab } from "../lib/sheets";
import { AI_CITATIONS_HEADERS } from "../lib/tab-schemas";

const log = createLogger("citations");
const PROMPTS_FILE = resolve(__dirname, "../prompts/ai-citations-2026.md");
const BASE_URL = "https://api.dataforseo.com";
const LIVE_PRICE_USD = 0.004; // per result page, Live queue (vendor price list; check before relying on it)
const OK = 20000;
type Engine = "chatgpt" | "gemini";

const arg = (name: string) => {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => process.argv.slice(2).includes(`--${name}`);

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
 *   npm run seo -- citations [--engine chatgpt|gemini] [--max-cost 0.5] [--location 2756] [--language fr] [--no-sheet]
 */
export async function citations(): Promise<void> {
  const prompts = parsePrompts(readFileSync(PROMPTS_FILE, "utf-8")).slice(0, Number(arg("limit") ?? Infinity));
  const engines: Engine[] = arg("engine") ? [arg("engine") as Engine] : ["chatgpt", "gemini"];
  if (engines.some((e) => e !== "chatgpt" && e !== "gemini")) throw new Error('--engine must be "chatgpt" or "gemini"');
  const locationCode = Number(arg("location") ?? 2756); // Switzerland
  const languageCode = arg("language") ?? "fr";
  const maxCost = Number(arg("max-cost") ?? 0.5);
  const requests = prompts.length * engines.length;

  console.log(`${prompts.length} prompts x ${engines.join(" + ")} = ${requests} requests, location ${locationCode}, language ${languageCode}`);
  console.log(`Estimated cost at the Live price: about $${(requests * LIVE_PRICE_USD).toFixed(3)} (spending cap $${maxCost})`);
  if (has("dry-run")) return;

  const api = new client.AiOptimizationApi(BASE_URL, {
    fetch: authenticatedFetch(requireEnv("DATAFORSEO_LOGIN"), requireEnv("DATAFORSEO_PASSWORD")),
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const rows: Record<string, string | number>[] = [];
  const raw: unknown[] = [];
  let spent = 0;
  let failures = 0;

  outer: for (const prompt of prompts) {
    for (const engine of engines) {
      if (spent >= maxCost) {
        log.warn(`Spending cap $${maxCost} reached after $${spent.toFixed(4)}; stopping`);
        break outer;
      }
      const fields = { keyword: prompt.text, location_code: locationCode, language_code: languageCode };
      try {
        const res =
          engine === "chatgpt"
            ? await api.chatGptLlmScraperLiveAdvanced([new client.AiOptimizationChatGptLlmScraperLiveAdvancedRequestInfo(fields)])
            : await api.geminiLlmScraperLiveAdvanced([new client.AiOptimizationGeminiLlmScraperLiveAdvancedRequestInfo(fields)]);
        spent += res?.cost ?? 0;
        const task = res?.tasks?.[0];
        if (task?.status_code !== OK) {
          failures++;
          log.error(`P${prompt.id} ${engine}: ${task?.status_code} ${task?.status_message}`);
          if (failures >= 3) throw new Error(`3 failed requests in a row; last: ${task?.status_code} ${task?.status_message}`);
          continue;
        }
        failures = 0;
        const result = task.result?.[0];
        raw.push({ prompt, engine, result });
        const summary = summarizeSources(result?.sources, new URL(site.siteUrl).hostname);
        rows.push({ date: stamp, prompt: prompt.text, engine, ...summary });
        log.info(`P${prompt.id} ${engine}: ${summary.easyrecharge_cited === "yes" ? `cited (rank ${summary.rank})` : "not cited"}`);
      } catch (err) {
        if (String((err as Error).message).startsWith("3 failed")) throw err;
        failures++;
        log.error(`P${prompt.id} ${engine} failed: ${(err as Error).message}`);
        if (failures >= 3) throw new Error(`3 failed requests in a row; last: ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  mkdirSync(resolve(dataDir, "citations"), { recursive: true });
  writeFileSync(resolve(dataDir, "citations", `${stamp}.json`), JSON.stringify(raw, null, 2));

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
    console.log(`  ${engine}: ${mine.filter((r) => r.easyrecharge_cited === "yes").length}/${mine.length} cited`);
  }
  console.log(`Raw answers (incl. fan-out queries): seo/data/citations/${stamp}.json`);
}
