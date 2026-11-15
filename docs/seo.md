# SEO command center

SEO and GEO tooling for easyrecharge.ch, merged from the former `easyrechargev2-seo` repo. Everything runs through one entry point, the same shape as `npm run ingest`:

```
npm run seo -- <command> [flags]
```

Code lives in `seo/`; raw output (GSC exports, crawls, audit JSON, logs) goes to `seo/data/`, which git ignores. The workbook that holds history is a Google Sheet.

## Commands

| Command | What it does | Needs Google |
|---|---|---|
| `gsc` | 28 days of Search Console queries and pages -> `seo/data/gsc/`, Performance and Keywords Master tabs | yes |
| `geo [--url <page>] [--dry-run]` | AI-readiness audit of the French blog posts and the home page: JSON-LD (read from `@graph`), author, FAQ, freshness, answers, citations; robots.txt AI-bot access; `llms.txt` | only without `--dry-run` |
| `crawl [--url] [--max-pages] [--dry-run]` | Titles, meta descriptions, h1, canonical, hreflang, alt text, HTTP errors across the site | only without `--dry-run` |
| `freshness [--dry-run]` | Posts untouched for more than 90 days -> Content Calendar, ranked by impressions | only without `--dry-run` |
| `keywords discover "<topic>"` | GSC queries + Google Autocomplete (CH) -> Keywords Master | yes |
| `keywords import-ads <csv> [--dry-run]` | Search terms report (UTF-8 CSV) or Keyword Planner download (UTF-16 TSV) | only without `--dry-run` |
| `keywords cluster` / `keywords gaps` | Pre-group unclustered terms / list clusters with no content | yes |
| `citations [--dry-run] [--limit n] [--engine chatgpt\|gemini]` | Asks ChatGPT and Gemini the frozen prompts through DataForSEO's LLM scraper (Switzerland, French) and logs the cited domains to the AI Citations tab | `--dry-run` no; otherwise DataForSEO login + Sheet |
| `sheet read <tab>` / `sheet upsert <tab> <key> <json>` | Generic tab access, used by the skills | yes |

`--dry-run` prints results and leaves the Sheet untouched, so it works with no Google credentials.

Not ported yet (still in the old repo, run there): PageSpeed (`audit:psi`), programmatic-page audit (`audit:spin`), subsidies scrape, charger price scripts. Port them when you next need them; for Core Web Vitals use `npx lighthouse@12 <url> --only-categories=performance` (the keyless PageSpeed API is permanently rate-limited).

## One-time setup

The scripts authenticate as the dedicated `seo-agent` service account, so SEO never shares a key with invoicing.

1. In `.env.local` set `SEO_GOOGLE_SERVICE_ACCOUNT_EMAIL` and `SEO_GOOGLE_SERVICE_ACCOUNT_KEY` (the key is the PEM `private_key`, with `\n` escapes), and `SEO_SHEETS_WORKBOOK_ID` (the id in the Sheet URL). Optional: `GSC_PROPERTY` if it is not `sc-domain:easyrecharge.ch`. Without the `SEO_` pair the scripts fall back to the invoicing account (`GOOGLE_SERVICE_ACCOUNT_*`).
2. Share the SEO workbook with that e-mail as **Editor**.
3. In Search Console (Settings > Users and permissions), add the same e-mail as a **Restricted** user. The scripts only read.
4. Check: `npm run seo -- gsc`.

Sheet tabs: Keywords Master, Content Calendar, Topic Clusters, Performance, Site Health, Score History, Issues, AI Citations. Tab names are in `seo/site.json`.

## Monthly AI-citation check (manual)

Goal: see whether ChatGPT, Perplexity and Gemini cite easyRecharge, and track it over time.

1. Use the frozen prompt list (`seo/prompts/ai-citations-2026.md`, 30 prompts; edited once, then not touched for a year so the trend is comparable).
2. Run each prompt in ChatGPT, Perplexity and Gemini, signed out or in a clean session, in French.
3. In the **AI Citations** tab add one row per prompt and engine: `date, prompt, engine, cited_domains, easyrecharge_cited (yes/no), rank`.
4. Compare with the PostHog Acquisition dashboard tiles "AI channel": citations should precede sessions from `chatgpt.com`, `gemini.google.com`, `perplexity.ai`.

### Automated (DataForSEO)

`npm run seo -- citations` does steps 2-3 for ChatGPT and Gemini: `--dry-run` prints the request count and estimated cost without any network call; `--limit 3` is a cheap trial; a spending cap (`--max-cost`, default $0.5) stops a run that costs more than expected. Raw answers, including the searches ChatGPT ran to build them (`fan_out_queries`), are saved to `seo/data/citations/<date>.json`.

Setup: create a DataForSEO account (pay as you go; the vendor lists a $50 minimum top-up and a $1 trial credit), then put the **API Access** login and password in `.env.local` as `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` (not the account password). Before relying on it: confirm that Switzerland + French returns sensible answers, and spot-check about five prompts by hand each quarter, because the scraper is not guaranteed to match what you see in the apps. Perplexity is not covered by the scraper.

## Reading the audits

- A page that emits BlogPosting + Person + FAQPage inside one `@graph` block is credited for all three. If an audit says "no schema", open the page source before believing it.
- "Stale" means Directus `date_updated` older than 90 days. Saving without changing anything resets it; refresh content, do not re-save.
- Traffic and quote conversion by channel and landing page are in PostHog (Acquisition dashboard), not in the workbook.

## Tests

The checks that can be unit-tested are: `seo/lib/*.test.ts` (GEO analysis incl. the `@graph` regression, crawl analysis, keyword parsing) and `src/lib/seo/jsonLd.test.ts` (what the site actually emits). They run with `npm test`. The live-site crawl is manual, after deploys.
