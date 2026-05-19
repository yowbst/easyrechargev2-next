# Operating Partner Dispatch

How to manage installer partners and the dispatch policy from Directus, plus what each runtime mode does. Schema reference lives at [`docs/directus-partners-schema.md`](../directus-partners-schema.md).

## Runtime modes

Controlled by the `DISPATCH_MODE` env var, read once per quote submission.

| Mode | Resolver | Ledger writes | `dispatch.targets` in webhook | Make behavior |
|---|---|---|---|---|
| `off` (default) | not called | none | `[]` | Legacy hardcoded `[ NEW ]` email to E-ME fires, Google Ads uses hardcoded `0.5` |
| `shadow` | called | yes (compare with Make) | `[]` | Legacy hardcoded path still fires — verification only |
| `live` | called | yes | populated | Make's Iterator path emails each target, Google Ads uses `dispatch.billableRate` |

Cutover order: `off` (deploy) → `shadow` (verify ledger matches Make for ~1 week) → edit Make scenario to wire the Iterator + Google Ads formula → `live`.

## Adding a partner

1. **Directus → `partners` → Create**.
   - `status` = `active`
   - `name`, `slug` (stable, lowercase-with-dashes)
   - `notification_email`
   - `language` = `fr` or `de`
   - `monthly_quota` (0 = unlimited)
   - `priority` (lower = picked first, default 100)
   - `billable_rate` (0.0–1.0, default 1.0)
   - `environment` — create **one row per environment** the partner is active in. The `staging` and `production` rows are independent.
2. **`partner_areas` → Create one row per canton** the partner covers. Set `mode` to `exclusive` (unique partner) or `shared` (one of several). Set `priority_override` / `quota_override` only when you want canton-specific overrides.
3. To enable: leave `partners.status = active` and `partner_areas.status = published`. The resolver picks up the change immediately (no ISR — `cache: 'no-store'`).

## Breaking exclusivity in a canton

To go from "one partner gets all VD leads" to "two partners share VD leads":

1. Edit the existing `partner_areas` row → set `mode` from `exclusive` to `shared`.
2. Create a new `partners` row (or reuse an existing partner) → set `partner_areas.mode = shared` for the same canton.
3. If you want more than one partner to receive each lead, bump `site_settings.global_config.dispatch.max_shared_targets` (default `1`).

The shared algorithm picks the partner with the fewest dispatches in the current UTC month, tied on `priority`, then `partner.id`. This naturally rotates leads.

## Setting / changing quotas

- **Partner-wide:** `partners.monthly_quota`. Counted across all the partner's areas combined.
- **Per-canton override:** `partner_areas.quota_override`. Useful when a partner can handle more VD leads than VS leads.
- `0` always means unlimited.

Quota resets at UTC month boundary — there's no carry-over.

## Taking a partner out of dispatch

Set `partners.status = paused`. The resolver excludes paused partners at query time. Existing `partner_dispatches` rows are preserved for history. To resume, flip back to `active`.

If you want to permanently retire a partner, leave `status = paused` and `notes` a reason — don't delete the row (we want the ledger references to stay valid).

## Test traffic suppression

Submissions are flagged `isTest = true` when **any** of these hold:
- `VERCEL_ENV !== "production"` (staging/preview/dev)
- The submitter's email contains any pattern from `site_settings.global_config.dispatch.test_email_patterns`

When `isTest = true`:
- The resolver still runs (we want shadow audit of "what *would* have been dispatched")
- Each resolved target writes a `skipped_test` ledger row instead of `dispatched`
- The Make webhook payload sends `dispatch.targets: []`, `dispatch.billableRate: null` — so no partner email fires and no Google Ads conversion is reported

To add a new test pattern (e.g. when onboarding a new tester whose email shouldn't trigger real dispatches), edit `site_settings.global_config.dispatch.test_email_patterns` directly in Directus — no redeploy needed.

## Reading the ledger

`partner_dispatches` is the source of truth. The debug endpoint surfaces recent rows without opening Directus admin:

```
GET /api/debug/dispatches?limit=20
GET /api/debug/dispatches?canton=VD
GET /api/debug/dispatches?status=skipped_quota
GET /api/debug/dispatches?partner=eme-energies
GET /api/debug/dispatches?env=all     # bypass env filter
```

Defaults to the current environment.

## Reading PostHog dashboards

Server-side events (fire-and-forget per quote submission):
- `dispatch_resolved` — fires once. `target_count`, `reasons[]`, `is_test`, `mode`, `canton`, `environment`.
- `dispatch_sent` — fires once per target (when `is_test=false`).
- `dispatch_skipped_test` — fires once per target (when `is_test=true`).
- `dispatch_exclusive_over_quota` — fires when the exclusive partner is exhausted for the month.
- `dispatch_no_partner_for_canton` — fires when the canton has no active partner (NE/JU today).
- `dispatch_failed` — fires when `runDispatch` itself catches an unexpected error. Should be near-zero.

Build a Trends view filtered by `environment` to monitor each stage of cutover.

## Resolver reason codes

| Reason | When emitted | Acted on |
|---|---|---|
| `exclusive_over_quota` | The exclusive partner is exhausted for the month | Resolver falls through to shared partners. Ledger writes `skipped_quota` for the exhausted exclusive. |
| `no_partner_for_canton` | After exclusive + shared, still no candidate | Empty `dispatch.targets`. No ledger row (coverage gaps are PostHog-only). |
| `unknown_canton` | Submission has a canton value that can't be normalized | Resolver short-circuits; same surface as `no_partner_for_canton`. |
