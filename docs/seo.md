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
| `sheet read <tab>` / `sheet upsert <tab> <key> <json>` | Generic tab access, used by the skills | yes |

`--dry-run` prints results and leaves the Sheet untouched, so it works with no Google credentials.

Not ported yet (still in the old repo, run there): PageSpeed (`audit:psi`), programmatic-page audit (`audit:spin`), subsidies scrape, charger price scripts. Port them when you next need them; for Core Web Vitals use `npx lighthouse@12 <url> --only-categories=performance` (the keyless PageSpeed API is permanently rate-limited).

## One-time setup

The scripts reuse the invoicing service account, so there is no key file to copy.

1. `.env.local` already has `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_KEY`. Add `SEO_SHEETS_WORKBOOK_ID` (the id in the Sheet URL) and, if different from `sc-domain:easyrecharge.ch`, `GSC_PROPERTY`.
2. Share the SEO workbook with the service account e-mail as **Editor**.
3. In Search Console, add the same e-mail as a **Restricted** user on the property.
4. Check: `npm run seo -- gsc`.

Sheet tabs: Keywords Master, Content Calendar, Topic Clusters, Performance, Site Health, Score History, Issues, AI Citations. Tab names are in `seo/site.json`.

## Monthly AI-citation check (manual)

Goal: see whether ChatGPT, Perplexity and Gemini cite easyRecharge, and track it over time.

1. Use the frozen prompt list (`seo/prompts/ai-citations-2026.md`, 30 prompts; edited once, then not touched for a year so the trend is comparable).
2. Run each prompt in ChatGPT, Perplexity and Gemini, signed out or in a clean session, in French.
3. In the **AI Citations** tab add one row per prompt and engine: `date, prompt, engine, cited_domains, easyrecharge_cited (yes/no), rank`.
4. Compare with the PostHog Acquisition dashboard tiles "AI channel": citations should precede sessions from `chatgpt.com`, `gemini.google.com`, `perplexity.ai`.

Automate only the Perplexity part later, if the signal justifies it; API answers differ from what the consumer apps show.

## Reading the audits

- A page that emits BlogPosting + Person + FAQPage inside one `@graph` block is credited for all three. If an audit says "no schema", open the page source before believing it.
- "Stale" means Directus `date_updated` older than 90 days. Saving without changing anything resets it; refresh content, do not re-save.
- Traffic and quote conversion by channel and landing page are in PostHog (Acquisition dashboard), not in the workbook.

## Tests

The checks that can be unit-tested are: `seo/lib/*.test.ts` (GEO analysis incl. the `@graph` regression, crawl analysis, keyword parsing) and `src/lib/seo/jsonLd.test.ts` (what the site actually emits). They run with `npm test`. The live-site crawl is manual, after deploys.
