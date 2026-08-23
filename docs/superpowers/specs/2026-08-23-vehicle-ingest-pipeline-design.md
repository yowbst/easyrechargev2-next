# Vehicle Ingest Pipeline — Design

Date: 2026-08-23
Status: proposed
Supersedes: `/Users/yoanbasset/Jupyter/ev-database/# EV Database — Scraping, Cleaning & Upload Pipeline.ipynb` (sections 1–4)

## Goal

Move the EV Database scrape → clean → upsert pipeline out of an untracked Jupyter notebook
and into the repo, as typed and tested modules driven by a CLI. The pipeline refreshes the
`vehicles` and `vehicle_brands` Directus collections a few times a year, with a human
approving every change before it reaches the 562 live records.

## Decisions (locked)

1. **Logic in the app, execution outside it.** Modules live in `src/lib/vehicles/ingest/`;
   a CLI in `scripts/` drives them. No Vercel cron, no webhook receiver, no durable workflow.
2. **TypeScript, not Python.** The cleaning logic is pure regex and the image step is plain
   HTTP — neither depends on pandas or PIL, so the port is mechanical.
3. **Plan / apply split.** `plan` produces a reviewable file; `apply` executes exactly that
   file. What you read is what runs.
4. **Identity is `evdb_id`, never `slug`.**
5. **Slugs are frozen after creation.** Drift is logged and ignored.
6. **Disappeared vehicles are reported, never mutated.**
7. **`status` is written on create only, never on update.**

## Current state (from codebase + live CMS exploration)

- Live CMS: 562 vehicles (all `published`), 63 brands. Created 2026-01-06, last touched
  2026-02-20. `cms.easyrecharge.ch` and the Railway URL in `.env.local` are the same instance.
- Newest local dataset: `EVDB_vehicles_fromBD_2025-12-26_0_3-cleaned.json` (~8 months stale).
- The site reads vehicles via `fetchVehicles`/`fetchVehicle` in `src/lib/directus-queries.ts`,
  filtered on `status: published`, shaped by `transformDirectusVehicle` in
  `src/lib/vehicleTransformer.ts`.
- Admin route precedent: `/api/admin/reconcile-billing` gates on an `x-admin-token` header
  compared to `DIRECTUS_STATIC_TOKEN`, and calls a lib function taking a `dryRun` flag.
- Module layout precedent: `src/lib/dispatch/` (`queries.ts` / `types.ts` / `index.ts`).

### Bugs found in the notebook that this design fixes

| # | Bug | Consequence |
|---|---|---|
| 1 | `build_vehicle_payload` unconditionally sets `payload["status"] = "draft"`, and that payload is PATCHed onto existing records (cell 101/103). Same bug in the brand upsert (cell 78). | Re-running drafts all 562 published vehicles. The vehicles section of the live site goes empty. |
| 2 | Upsert matches on `slug`, which is derived from battery kWh, range km and year — all mutable. 562/562 slugs embed all three. | Any spec revision or discontinuation changes the slug, so the upsert takes the CREATE branch and produces a duplicate instead of an update. |
| 3 | Every field is PATCHed on every record every run. | 562 pointless writes, all `date_updated` values churn, ISR caches bust for no reason. |
| 4 | The Bright Data poll loop treats HTTP 200 as "ready" (cell 18). Current API returns 200 with `{"status":"building"}` while in progress. | The loop can exit early and pass `{"status":"building"}` downstream as if it were vehicle data. |
| 5 | Directus token, Bright Data token and a Contentful CMA token are hardcoded in cells 4, 78, 98. | Credentials in a file with no access control. The Contentful token is likely still live. |
| 6 | Endpoint hardcoded to `https://easyrecharge-cms.replit.app`. | Returns 404; instance no longer exists. |

## Architecture

### Modules — `src/lib/vehicles/ingest/`

| Module | Responsibility |
|---|---|
| `brightdata.ts` | Trigger the collector, poll the snapshot, persist raw JSON |
| `clean.ts` | Port of `clean_model_column`, `clean_title_v2`, `normalize_model`, `slugify` |
| `fieldmap.ts` | Typed equivalent of `VEHICLE_MAP` — source → Directus field, with casts |
| `upsert.ts` | Find by `evdb_id`, build payloads, create/patch, status rules |
| `diff.ts` | Compare source against CMS, classify into plan buckets |
| `images.ts` | Download, upload to `/files`, attach `thumbnail` |
| `types.ts` | Shared with `src/lib/vehicleTransformer.ts` |

`fieldmap.ts` and `vehicleTransformer.ts` must share the numeric-field type. `battery`,
`range`, `efficiency`, `fastcharge` and `price_per_range` are `{value, unit}` objects in
Directus; `extractNumericField` silently falls back to `0` on a shape mismatch rather than
throwing, so a mapping error currently ships as "0 kWh" on the live site instead of failing
loudly. One shared type makes that a compile error.

Modules take no CLI-specific assumptions, so a route or cron could call them unchanged if the
cadence decision is ever revisited.

### CLI — `scripts/vehicles-ingest.ts`

```
scrape   trigger Bright Data, poll, write data/raw/<date>.json
clean    normalize + generate slugs      → data/clean/<date>.json
plan     diff clean snapshot vs CMS      → data/plans/<date>.json  (no writes)
apply    execute a plan file             (the only command that writes)
images   download + upload thumbnails for newly created vehicles only
brands   upsert vehicle_brands (same plan/apply split)
```

Snapshot and plan files live under `data/` at the repo root, which is **gitignored** — these
are multi-MB scrape artifacts, not source. Only the golden-test fixture is committed.

Brands use `slug` as their identity key rather than an external id. This is safe where it is
not for vehicles: a brand slug is `slugify(make)` and derives only from the manufacturer name,
which does not change when specs are revised. `active_models` is recomputed from the scrape on
each run.

### Data flow

```
Bright Data collector c_mipqo2it4a63h5g0k
   → raw snapshot (gitignored)
   → cleaned snapshot
   → plan file  ← human reviews here
   → Directus
```

## Identity and change detection

**Existence check: `evdb_id`.** Verified 562/562 populated, zero duplicates on the live
collection. It is EVDB's own key and is stable across spec revisions. `short_id` is equally
unique and serves as a fallback if `evdb_id` is ever absent on a scraped row.

**Change detection: field-level deep comparison.** Fetch the current record, build the
candidate payload, compare per field, PATCH only the differing keys. No stored hash — a hash
says *that* something changed but not *what*, and "what changed" is the point of the review
step. It would also require a new Directus field.

**Slug policy.** Generated on create, frozen thereafter. Drift is reported for visibility but
never acted on. No redirect table to maintain, no SEO churn. Accepted cost: a slug can become
factually stale (reads `-2025` when EVDB now says `2025-2026`).

### Plan buckets

| Bucket | Meaning | Action on apply |
|---|---|---|
| `CREATE` | No CMS record with this `evdb_id` | POST, `status: draft` |
| `UPDATE` | Field values differ | PATCH changed keys only, no `status` |
| `SLUG_DRIFT` | Generated slug ≠ stored slug | None — logged only |
| `GONE` | In CMS, absent from scrape | None — logged only |
| `UNCHANGED` | Identical | None — zero writes |

New vehicles land as `draft` deliberately: they need a thumbnail and a human eye before going
live. Publishing stays a manual step in Directus.

## Safety rules

1. **Never send `status` on update.** Enforced in `upsert.ts` and covered by a unit test.
2. **Scrape sanity check.** Abort if the scrape returns fewer than 80% of the current CMS
   count — that signals a broken scrape, not a shrinking market.
3. **Change-ratio circuit breaker.** Abort if a plan would modify more than a configurable
   share of the catalogue (default 30%), overridable with an explicit flag.
4. **Slug golden test.** Assert the ported generator reproduces all 562 live slugs from the
   December 2025 dataset. Slugs are both the historical upsert key and the public URLs; a
   silent change to the generator would create duplicates and break SEO.
5. **Nothing is ever unpublished or deleted by this pipeline.**

## Error handling

- Exponential backoff on 5xx from both Bright Data and Directus.
- Poll Bright Data on the response **body** (`{"status":"building"}`), not the HTTP status.
- The plan file doubles as a checkpoint: `apply` records completed `evdb_id`s, so an
  interrupted run resumes instead of restarting.
- A vehicle is written in a single PATCH — no partial field writes.
- Snapshots expire at Bright Data (16 days batch / 7 real-time), so raw snapshots are
  persisted locally rather than re-fetched.

## Secrets

All three hardcoded tokens move to environment variables:

| Var | Notes |
|---|---|
| `BRIGHTDATA_API_TOKEN` | Currently expired (`/status` → 401). Regenerate at brightdata.com/cp/setting/users |
| `BRIGHTDATA_COLLECTOR_ID` | `c_mipqo2it4a63h5g0k` — still valid |
| `DIRECTUS_URL` / `DIRECTUS_STATIC_TOKEN` | Already in `.env.local` |

The Contentful CMA token in cell 4 should be **revoked** — the Contentful cells are dead code
being deleted, not ported.

## Bright Data notes

The `/dca/*` endpoints are **not** deprecated; they were rebranded "Scraper Studio" (docs call
it the Collection API). `POST /dca/trigger?collector=c_...` → `{collection_id}` →
`GET /dca/dataset?id=...` remains the current contract, so the notebook's approach is sound
apart from bug #4. The 401 is purely an expired token.

Do **not** migrate to the newer Web Scraper API (`/datasets/v3/*`, `gd_...` dataset IDs) — that
product is for Bright Data's prebuilt scrapers. The EVDB scraper is a custom collector, so
Scraper Studio is correct; migrating would mean rebuilding the scraper for no gain.

For 100+ inputs Bright Data recommends push delivery over polling. At a few runs per year with
a human present, polling is acceptable and avoids needing a public webhook endpoint. Noted as a
future option if cadence ever increases.

## Testing

- Unit tests on `clean.ts`: model cleaning, title assembly, slugify edge cases (unicode, `&`,
  `+`, em-dashes, truncation).
- **Golden slug test** against all 562 live slugs (see Safety rule 4).
- Unit tests on `diff.ts` bucket classification, including the case that matters most: same
  `evdb_id`, changed range → `UPDATE`, not `CREATE`.
- Unit test asserting no `status` key appears in any update payload.
- Unit test on the scrape-sanity and change-ratio breakers.
- `plan` against production is read-only and safe to run repeatedly as a live integration check.

## Rollout

1. Regenerate the Bright Data token; revoke the Contentful token.
2. Port modules + tests. Golden slug test must pass before anything else proceeds.
3. `plan` against the December 2025 dataset and the live CMS. Expected result: near-total
   `UNCHANGED`, since that dataset is what produced the current records. Any large `CREATE`
   bucket means the identity logic is wrong — stop and fix.
4. Fresh `scrape` → `clean` → `plan`. Review.
5. `apply`, then `images`, then publish new vehicles manually in Directus.
6. Retire notebook sections 1–4; keep the notebook for exploration only.

Step 3 is the real acceptance test for the identity fix and must not be skipped.

## Out of scope

- Vercel cron, webhook receiver, durable workflows/queues.
- Auto-publishing new vehicles.
- Auto-unpublishing disappeared vehicles.
- Vehicle translations (`translations` field) — untouched by this pipeline.
- Re-uploading images for existing vehicles (12,033 files already on disk).
- Any change to how the site *reads* vehicles.

## Open risks

- **Golden slug test may not pass cleanly.** The December dataset may not reproduce every live
  slug if records were hand-edited in Directus since January. Mismatches need triage: a
  hand-edit is fine to accept, a logic divergence is not.
- **`year` source field.** `clean_title_v2` reads `row["year"]`, distinct from the
  `date_range_active` stored in Directus. The scrape shape needs confirming against a fresh
  snapshot before the port is trusted.
- **Brand creation ordering.** Vehicles reference `vehicle_brands` by slug lookup. A genuinely
  new manufacturer must have its brand row created first, or the vehicle lands with a null
  brand and `transformDirectusVehicle` drops it (it returns `null` without `brand.name`).
  `brands` must run before `apply`.
