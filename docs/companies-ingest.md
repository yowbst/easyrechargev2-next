# Installer dataset from the commercial register (`npm run companies`)

Swiss electrical installers from the commercial register (Zefix) into the Directus
`companies` collection. Two uses: a prospect list for cantons without a partner, and
(later, Phase 3) a block of nearby installers on the commune subsidies pages.

Design and decisions: `docs/superpowers/specs/2026-11-20-installer-dataset-design.md`.
Logic lives in `src/lib/companies/`, the CLI in `scripts/companies-ingest.ts`, the schema in
`scripts/create-companies-schema.py`.

## Prerequisites

| What | Where | Status |
|---|---|---|
| `DIRECTUS_URL`, `DIRECTUS_STATIC_TOKEN` | `.env.local` | existing |
| `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | `.env.local` (the "API Access" password) | existing, used by `npm run seo -- citations` |
| `DIRECTUS_ADMIN_TOKEN` | `.env.local` | schema creation only, never for a pipeline run |
| `companies` collection | created 2026-11-20 by `create-companies-schema.py` | done |
| **Static-token permissions on `companies`** | Directus > Settings > Access Policies | **manual, see below** |
| Postcode coordinates | `src/shared/swiss-postcode-coordinates.ts`, generated 2026-11-20 | done |

No LINDAS account is needed. No new vendor: classification goes through the DataForSEO
Gemini scraper the SEO citations check already uses.

## Commands

```
npm run companies -- geo-dataset --csv <file>      # swisstopo WGS84 CSV -> src/shared/swiss-postcode-coordinates.ts
npm run companies -- fetch [--canton VD,VS]        # LINDAS -> data/companies/raw/<stamp>.jsonl   (read-only, free)
npm run companies -- normalize --in <raw>          # derive fields + geocode -> clean/<stamp>.json
npm run companies -- classify --in <clean>         # -> classified/<stamp>.json   (paid, capped)
npm run companies -- classify --eval               # golden set, prints accuracy (gate 90 %)
npm run companies -- plan --in <classified>        # diff against Directus -> plans/<stamp>.json (read-only)
npm run companies -- apply --plan <file> [--dry-run]
npm run companies -- report [--canton ZH]
npm run companies -- export --canton ZH,BE --classification installer   # CSV for Attio
```

Options: `--limit n`, `--max-cost usd`, `--max-change-ratio n`, `--partial`, `--force`
(ignore caches), `--no-cms` (classify without reading Directus), `--prospect-status none`.

## Sequence

1. `fetch` all cantons. Measured on 2026-11-20: 4,798 rows across 26 cantons (ZH 736, VD 537, TI 435, BE 401, AG 348, GE 312). It stops with an error if a canton returns nothing.
2. `normalize --in data/companies/raw/<stamp>.jsonl`.
3. `classify --in <clean> --dry-run` to see the call count and cost, then run it. The cost cap defaults to the estimate x 1.5. Results are cached per purpose in `data/companies/cache/classify/`, so an interrupted or capped run resumes without paying twice.
4. `plan --in <classified>`. Read the summary: bucket counts, PUBLISH/UNPUBLISH flips, creates by canton, classification split, 20 samples per bucket.
5. `apply --plan <file> --dry-run`, then `apply --plan <file>`. An interrupted apply resumes from `completed[]` in the plan file.
6. `report`, then spot-check ten rows against zefix.ch.

Refresh monthly with the same sequence. The first monthly plan is the one to read slowly.

## What the pipeline owns

| Pipeline writes | Humans write in Directus (never touched by the pipeline) |
|---|---|
| `status`, every `register_*`, `classification*`, contact fields, `lat/lng`, `partner` | `do_not_display`, `classification_override`, `display_name`, `notes`, `prospect_*`, `assigned_to` |

`status` is recomputed on every plan. To hide a company use `do_not_display`; to correct
the model use `classification_override`. Publish rule: published only when the effective
classification is installer, confidence is at least 0.8 (an override skips the threshold),
the name does not say liquidation or bankruptcy, `do_not_display` is off, and the row is not gone.

## Guardrails

- `plan` refuses when candidates fall below 80 % of the live rows (a truncated fetch looks like this). `--partial` disables only that floor. Runs scoped with `--canton` skip it.
- `plan` refuses when creates plus updates exceed 30 % of live rows. Override with `--max-change-ratio` after a deliberate change such as a new model.
- `plan` refuses when every new row is unclassified.
- GONE is only judged inside the cantons a run covered. Nothing is ever deleted: GONE archives, REAPPEARED comes back as a draft.
- `apply` POSTs with retry off, so a 502 cannot create a duplicate.

## Gotchas (verified 2026-11-20)

- **The register has no status.** Companies in liquidation or bankruptcy stay listed; the only trace is the name. 274 of 4,798 candidates (5.7 %) are flagged nationwide.
- **DataForSEO limits the prompt to 2,000 characters** (task error 40501 above that, no charge). A batch therefore holds about 6 purposes, not 20. One live call costs $0.004 and takes about 30 s. Measured: 4,798 companies, 4,656 distinct purposes, 717 calls, about $2.87 for all of Switzerland and roughly 90 minutes with 4 parallel calls.
- **Gemini through DataForSEO answers in free text**; the parser accepts fenced or wrapped JSON and retries the companies a reply skipped. The gate also requires at most 2 % unparseable replies. If that fails, switch to the Gemini developer API (a new key).
- **Directus returns decimals as strings and rewrites timestamps.** The diff compares numerically and ignores `classified_at`, otherwise every geocoded row would be a permanent UPDATE.
- **GONE means "no longer in this run's candidate set"**: struck off the register, or the purpose no longer matches the installer pattern. Either way the row stops being shown.
- **21 special postcodes have no coordinates** (PO box and delivery codes such as 1401, 3000, 6501). Those rows have null lat/lng. Phase 3 must handle that.
- **The candidate pattern is shared** between the SPARQL prefilter and the TypeScript check (`src/lib/companies/ingest/candidates.ts`). Edit it in one place only.
- **Branches** (legal forms 0151, 0111) are separate rows with `legal_form_kind = branch`.
- **Pure solar firms rarely appear**: the candidate pattern needs electrical-installation wording. The golden set therefore has no real solar example.

## Classification quality

Prompt version **v2** (2026-11-21), stored at the end of `classification_model`. Results from another
version count as unknown, so a prompt change relabels everything on the next run.

- The model sees an excerpt, not the full purpose: three quarters of purposes exceed the budget. When the
  first installer wording comes late, the excerpt keeps the opening plus the passage around it (`clipPurpose`).
- The prompt counts multi-trade firms as installers when they list electrical installation work.
- Golden set (90 purposes, `src/lib/companies/ingest/__fixtures__/purposes-golden.json`): 90.0 % on the
  accepted run, 86 % to 90 % across runs. That spread is the noise floor of the model (Gemini 3.5
  Flash-Lite through DataForSEO). Six labels were corrected on 2026-11-21 after reading the full text.
- Full national run: 780 calls, $3.12, 0.1 % unparseable replies. Result: 3,637 installer, 524 other,
  322 inspector, 311 planner, 4 solar.
- Data profile with the known weak spots: `docs/companies-data-profile-2026-11-21.md`.

## Personal data

Sole proprietorships carry a person's name, and Phase 2 adds contact persons. Keep this
dataset in Directus and the MCP tools, do not paste exports into other AI tools, and set
`do_not_display` when someone asks to be removed. Each contact value has a source and a date.

## Known limitations

- Contacts, website and the person running the company are not in the register. Phase 2 fills them (bake-off between four DataForSEO sources first, then site verification through the Bright Data proxy).
- **ESTI permit data is deferred.** The register (verzeichnisse.esti.ch) would add permit number, type, validity and the responsible person, and would confirm which installers are real. Its robots.txt disallows all automated access. Bright Data refuses the host outright (policy_20000, classified as Government, checked 2026-11-21). Firecrawl respects robots.txt by default and only lets Enterprise accounts ignore it, so it does not help either. Remaining options: request an extract from info@esti.admin.ch (preferred), or slow per-company lookups from the operator's own IP, which is a decision for the owner. The ESTI fields already exist in Directus and are empty.
- `lat/lng` are not indexed yet; add indexes before the Phase 3 bounding-box query.

## Manual actions required (outside this repo)

1. **Directus permissions.** Give the role behind `DIRECTUS_STATIC_TOKEN` read, create and update on `companies` (not delete). Until then every command that reads or writes Directus returns 403: `classify` (without `--no-cms`), `plan`, `apply`, `report`, `export`, and the two MCP tools.
2. Redeploy after merging so the MCP server exposes `list_companies` and `update_company_prospect`.
