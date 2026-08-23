# Vehicle Ingest Runbook

Refreshes the `vehicles` and `vehicle_brands` Directus collections from EV Database (via
Bright Data). Run a few times a year. Nothing in this pipeline ever unpublishes or
deletes — but review is asymmetric: vehicle writes are gated behind `plan` → review →
`apply`, while `brands` writes immediately with no plan/apply gate, so always run it
with `--dry-run` first and read the output before the live run (see Sequence below).

Implementation: `scripts/vehicles-ingest.ts` (CLI entry) + `src/lib/vehicles/ingest/`.

## Prerequisites

`.env.local` needs:

```
DIRECTUS_URL=<already set for the app>
DIRECTUS_STATIC_TOKEN=<already set for the app>
BRIGHTDATA_API_TOKEN=<token for the account that owns the collectors — see gotcha below>
BRIGHTDATA_LIST_COLLECTOR=c_mipqo2it4a63h5g0k
BRIGHTDATA_DETAILS_COLLECTOR=c_misied485yd5jpx0u
```

**Check the account can actually make requests before blaming the collector ID.** A token
can be `"status":"active"` and still be unable to run anything. Run:

```bash
curl -s -H "Authorization: Bearer $BRIGHTDATA_API_TOKEN" https://api.brightdata.com/status
```

Two fields matter more than `status`:

- `can_make_requests` — if `false`, no trigger will work regardless of collector.
- `auth_fail_reason` — `zone_not_found` means the account has **no scraping zone**.
  Confirm with `GET https://api.brightdata.com/zone/get_active_zones`; an empty array
  `[]` means there is nothing to run jobs on. Create a zone in the Bright Data dashboard.

**Also check the token belongs to the account that owns the collectors.** Compare
`customer` from `/status` against the `id=hl_...` in the collector's dashboard URL. A
mismatch means a trigger will 404 and look like a bad collector ID rather than an auth
problem. Note that `GET /dca/dataset?id=<collector_id>` is **not** a valid test of this —
that endpoint expects a *snapshot* id, so it 404s for a perfectly good collector. The only
definitive check is an actual `POST /dca/trigger`, which starts a billable job.

## Commands

```
npm run ingest -- scrape                  # LIST then DETAILS, merged -> data/raw/<date>.json
npm run ingest -- clean  --in <file>      # normalize + slug -> data/clean/<date>.json
npm run ingest -- brands --in <file>      # create/update vehicle_brands rows (WRITES)
npm run ingest -- plan   --in <file>      # diff against CMS -> data/plans/<date>.json (read-only)
npm run ingest -- apply  --plan <file>    # execute a reviewed plan (WRITES)
npm run ingest -- help
```

Options: `--dry-run` (brands/apply — print intent, zero writes), `--max-change-ratio <n>`
(plan — override the change-ratio guard; `n` is a 0–1 fraction of the CMS count, not a
percentage — e.g. `0.5`, not `50`), `--limit <n>` (scrape — cap DETAILS URLs fetched).
Any flag not valid for the command being run (including a typo like `--dryrun`) is
rejected with an error.

## Sequence

```bash
npm run ingest -- scrape
npm run ingest -- clean  --in data/raw/<date>.json

npm run ingest -- brands --in data/clean/<date>.json --dry-run
# read the printed CREATE/UPDATE/unchanged lines — brands has no plan/apply gate,
# this dry run is the only review step it gets before writing to Directus
npm run ingest -- brands --in data/clean/<date>.json

npm run ingest -- plan   --in data/clean/<date>.json
# review the printed bucket summary and data/plans/<date>.json
npm run ingest -- apply  --plan data/plans/<date>.json
```

**`brands` writes immediately — it is not gated by a plan/apply step the way vehicles
are.** The `--dry-run` above is not optional busywork; it is the only chance to catch a
bad create/update (see "A brand's `name` always comes from the scraped `make` field"
under Known Limitations) before it lands in Directus.

**Run `brands` before `plan`/`apply`, every time — this is not optional.** `plan` resolves
each scraped vehicle's brand relation by looking up an existing `vehicle_brands` row by
slug. If a vehicle's manufacturer has no matching brand row (a genuinely new
manufacturer, or `brands` was skipped), the vehicle is planned with a **null brand
relation**. It still gets created in Directus — there's no error — but
`transformDirectusVehicle` (`src/lib/vehicleTransformer.ts`) returns `null` for any
record whose `brand.name` is missing, so the site silently never renders that vehicle.
There is no warning on the site side; the only signal is a `plan`-time console line
(`⚠️  no brand row for "<slug>" — run the brands step first`) that's easy to miss if
you're not watching the terminal.

New vehicles (from `apply`) and new brands (from `brands`) both land as `draft` in
Directus. Add a thumbnail and publish by hand.

## Guardrails

- `plan` aborts if the scrape returns under 80% of the current CMS vehicle count (looks
  like a broken scrape, not a shrinking catalogue).
- `plan` aborts if CREATE + UPDATE exceeds 30% of the CMS count (looks like a
  field-mapping regression, not a real refresh). Override with `--max-change-ratio` only
  after you've confirmed the change is real.
- `apply` never writes `status` or `slug` to an existing record.
- Vehicles missing from a scrape are reported as `GONE`, never unpublished or deleted.
- Interrupted `apply` runs resume — `applyPlan` accumulates `plan.completed` in memory as
  each write lands, and the CLI persists it back to the `--plan <file>` in a `finally`
  block, so it's written even when the run throws partway through (e.g. a Directus
  request exhausting its retries). Re-run `apply` with the same plan file and already-
  completed entries are skipped. (A hard kill of the process, e.g. Ctrl-C, bypasses the
  `finally` and is not covered — anything mid-flight at that instant may need manual
  reconciliation.)
- `brands` only creates/updates; it never deletes a brand row.

## Gotchas

- **Scraping is two collectors, not one.** LIST returns identity + summary fields
  (`evdb_id`, `make`, `model`, `year`, `car_url`); DETAILS returns deep spec blocks
  (`battery_details`, `charging`, `performance`) and none of the identity fields. They
  join on `car_url` (`mergeListAndDetails` in `src/lib/vehicles/ingest/merge.ts`).
- **The DETAILS collector returns its payload as a JSON string**, not a JSON object —
  each row must be unwrapped (`unwrapDetails`) before it can be merged.
- **A LIST row with no DETAILS match is dropped**, not carried through partially.
  Without `battery_details.nominal_capacity` from DETAILS, the generated slug would lose
  its kWh component, and slugs are the vehicle's stable identity in URLs — better to drop
  the row than mint a wrong slug.
- `evdb_id` is a **string** in Directus and a **number** in the scrape payload. Always
  coerce with `String(...)` before comparing/indexing — `indexByEvdbId` does this once,
  centrally.
- **Slugs are frozen after creation.** `plan` reports `SLUG_DRIFT` (existing slug vs. the
  slug the current scrape would generate) but never applies it. Expect this bucket to be
  **noisy** — the slug embeds range/battery/model, so most ordinary spec revisions (a
  range recalculation, a battery capacity correction) drift it. A non-zero `SLUG_DRIFT`
  count is normal and does not need action.
- `evdb_time_fetched` is a **non-triggering field** (`NON_TRIGGERING_FIELDS` in
  `diff.ts`): by itself it never causes a record to be classified `UPDATE` (it changes on
  literally every scrape by definition, so treating it as a real diff would make every
  vehicle look changed on every run). It still gets refreshed in the PATCH body if the
  record is updated for some other, real reason.
- **Plan bucket counts are per-entry, not per-vehicle.** One vehicle can appear as both
  an `UPDATE` and a `SLUG_DRIFT` (two separate entries), so the printed counts can sum to
  more than the scrape count. Don't read them as mutually-exclusive per-vehicle buckets.
- New vehicles land as `draft` and need a thumbnail plus manual publishing in Directus —
  see "Known limitations" below, there is no automated thumbnail step yet.
- Bright Data snapshots expire (16 days for batch collections, 7 days for real-time).
  Keep `data/raw/` around if you might need to re-run `clean`/`plan` without re-scraping.
- **`/dca/*` endpoints are current, not deprecated** — they were rebranded "Scraper
  Studio" in Bright Data's UI, but the API paths didn't change. Do **not** migrate to
  `/datasets/v3/*`; that's for Bright Data's prebuilt scrapers, not custom collectors
  like these two.

## Acceptance-gate baseline (regression check)

Planning the December 2025 EVDB snapshot against the live CMS is the known-good
reference run. It produces, with **zero writes**:

```
CREATE     0
UPDATE     0
SLUG_DRIFT 0
GONE       0
UNCHANGED  562
```

If you ever suspect the comparison layer (`diff.ts`, `fieldmap.ts`, `queries.ts`) has
regressed — e.g. `plan` starts reporting spurious `UPDATE`s or `CREATE`s against a
snapshot you know matches the CMS — re-run `plan` against that same December 2025
snapshot and confirm you still get this exact result. Any deviation means something in
identity matching or field comparison broke.

## Known limitations

- **`buildBrandPayload` never sets `icon_simple`.** A brand-new manufacturer is created
  in Directus without a logo. Add one manually after `brands` creates the row.
- **A brand's `name` always comes from the scraped `make` field.** If someone corrects a
  brand's display name by hand in Directus, the next `brands` run overwrites it back to
  whatever EV Database has, and it does so immediately — `brands` has no plan/apply
  review gate (see Sequence above). There's no protection against this — don't hand-edit
  brand names unless you also intend to keep re-applying the correction, or plan to patch
  `buildBrandPayload` to leave `name` alone on update. Always run `brands --dry-run`
  first and check its UPDATE lines for a name change you didn't expect before running it
  live.
- **There is no `images` command.** The original design considered scraping/uploading
  thumbnails automatically; that was never implemented. Thumbnails for newly created
  vehicles are a manual step in Directus today.

## Manual actions required (outside this repo)

These cannot be automated from here — they need a human with dashboard/account access:

1. **Obtain a Bright Data API token for the account that owns the two collectors.** The
   token supplied during development authenticated successfully but belonged to a
   different Bright Data customer account than the one hosting
   `c_mipqo2it4a63h5g0k` / `c_misied485yd5jpx0u`, so every trigger 404'd. Get a token
   scoped to the owning account (or move/recreate the collectors under the account whose
   token you have) before running `scrape` for real.
2. **Revoke the Contentful CMA token** hardcoded in cell 4 of
   `/Users/yoanbasset/Jupyter/ev-database/# EV Database — Scraping, Cleaning & Upload
   Pipeline.ipynb`. The Contentful code path in that notebook is dead — it was not
   ported to this pipeline — so the token serves no purpose and should be revoked in
   Contentful's dashboard.
3. **Revoke the expired Bright Data token** hardcoded in cell 15 of the same notebook.
   It no longer works, but it shouldn't remain readable in a file either.
4. **Stop the notebook being a credential store.** Cells 4, 15, 78, and 98 have
   hardcoded API keys/tokens. Replace each with an `os.environ[...]` lookup (loading
   from a local `.env`/shell export the notebook never commits), or delete the cells if
   the code path they support is no longer needed. This repo's automated tooling
   deliberately did not touch the notebook — it's a 750KB unversioned file with no undo,
   kept outside this repo, so this edit needs to be done by hand and reviewed by eye
   before saving.
