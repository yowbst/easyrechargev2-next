# Partner Dispatch — Directus Schema

Three collections drive partner lead dispatch. Created manually in Directus admin; this document is the source of truth for what the code expects.

## `partners`

Master record per installer partner. Multiple rows per partner are allowed, one per `environment`, so staging and production policy stay independent.

| Field | Type | Notes |
|---|---|---|
**Identity & dispatch policy**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `status` | dropdown (string) | `active` (dispatched) / `paused` (skipped). Partner-lifecycle, not the Directus `published/draft/archived` convention. |
| `name` | string | Display name shown in admin and in PostHog (e.g. `E-ME Énergies`). |
| `slug` | string | Stable identifier for logs and ledger queries (e.g. `eme-energies`). |
| `notification_email` | string | Where Make sends the lead email. |
| `monthly_quota` | integer | Legacy charger quota: max charger leads per UTC calendar month, used while the partner has no `partner_products` rows. `0` = unlimited. |
| `priority` | integer | Tie-breaker, lower wins. Default `100`. |
| `language` | dropdown | `fr` / `de`. Surfaces on `dispatch.targets[].language` so Make can branch on email language later. |
| `billable_rate` | decimal | `0.0`–`1.0`. Per-partner fraction of leads that are billable. Feeds Google Ads `conversionValue = 40 × billable_rate`. Default `1.0`. |
| `environment` | dropdown | `development` / `staging` / `production`. Set by ops; matches Vercel's `VERCEL_ENV` mapping in `src/lib/directus-storage.ts:getEnvironment()`. |
| `notes` | text | Free notes. |

**Business identification & address** — administrative metadata, not used by the resolver. Surfaces in CRM exports, contracts, and partner-facing communications.

| Field | Type | Notes |
|---|---|---|
| `business_name` | string | Official legal name. May differ from the display `name` (e.g. `E-ME Énergies SA` vs. display `E-ME Énergies`). |
| `legal_form` | dropdown | English-semantic codes: `corporation` (Société Anonyme / SA / AG), `llc` (Sàrl / GmbH), `gp` (General partnership / SNC), `sp` (Sole proprietorship / Raison individuelle). |
| `uid` | string | Swiss business UID, format `CHE-XXX.XXX.XXX`. |
| `street_name` | string | Street name (e.g. `Rue de la Gare`). |
| `street_number` | string | String, not integer — supports `12A`, `bis`, etc. |
| `postal_code` | string | 4 digits for CH; string to keep leading zeros. |
| `locality` | string | City / town name. |
| `canton` | M2O → `canton` | Partner's registered canton. Same `canton` collection used by `partner_areas`. **Not** required to match the partner's `partner_areas` — a partner can be HQ'd in one canton and cover several others. |

Note: `language` dropdown actually offers `fr` / `de` / `en` (the resolver only consumes `fr` and `de` today via the webhook payload — `en` is reserved for future English-speaking partners).

## `partner_products`

One row per partner × product: which lead verticals a partner receives and how many per month. O2M alias `products` on `partners` (edited inline on the partner form).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `partner` | M2O → `partners` | Required. On delete: cascade. |
| `product` | dropdown (string) | `ecp` / `battery` (keys of `PRODUCTS` in `src/lib/products.ts`). Unique together with `partner`. |
| `status` | dropdown (string) | `active` (receives the product) / `paused`. |
| `monthly_quota` | integer | Max leads of this product per UTC calendar month. `0` or empty = unlimited. Over quota still dispatches, as a gift. |

Rules (`src/lib/dispatch/partner-products.ts`):
- A partner with no rows is charger-only with `partners.monthly_quota` (legacy, no migration needed).
- Once a partner has any row, every product it receives — the charger included — needs an active row.
- `partner_areas.quota_override` only overrides the charger quota.
- Cantons are shared across products: `partner_areas` has no product.

## `partner_areas`

Junction between `partners` and the existing `canton` collection. One row = "this partner covers this canton".

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `status` | Directus built-in | `published` / `draft` / `archived`. Resolver filters to `published`. |
| `partner` | M2O → `partners` | |
| `canton` | M2O → `canton` | Existing collection. Resolver matches via `canton.code` and ignores rows where `canton.is_active = false`. |
| `mode` | dropdown | `exclusive` (only this partner gets leads in this canton) / `shared` (multiple partners can be picked). |
| `priority_override` | integer | Optional. Overrides `partner.priority` for this canton. |
| `quota_override` | integer | Optional. Overrides `partner.monthly_quota` for this canton. `0` = unlimited. |

**Integrity rule** (enforced by the resolver, not the DB): at most one `(canton, environment)` row should be `mode = exclusive`. Violations are warned in the server log; the resolver picks the lowest-priority exclusive deterministically.

## `partner_dispatches`

Append-only ledger. One row per resolved dispatch decision. Quota counting reads from here; debug endpoint surfaces recent rows.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `submission` | M2O → `form_submissions` | |
| `partner` | M2O → `partners` | The partner this row is attributed to. |
| `canton` | string | Snapshot of the 2-letter code at dispatch time. **Not** a FK — historical rows must survive canton renames or restrictions. |
| `mode_used` | dropdown | `exclusive` / `shared`. Which branch of the resolver fired. |
| `month_bucket` | string | `YYYY-MM` UTC. Quota counting key. |
| `dispatched_at` | datetime | |
| `status` | dropdown | `dispatched` / `skipped_quota` / `skipped_test`. Coverage gaps (`no_partner_for_canton`, unknown canton) are tracked in PostHog only — no partner-attributed ledger row is written for those. |
| `environment` | dropdown | matches partner. |

Recommended indexes:
- `(partner, month_bucket, status)` for quota counting
- `submission` for back-references

## `site_settings.global_config.dispatch`

Singleton-level configuration. Merged into the existing `global_config` JSON field (keys `webhooks`, `slas`, `stats`, `trustpilot` are preserved).

```json
{
  "dispatch": {
    "max_shared_targets": 1,
    "test_email_patterns": ["yoan.basset", "easyrecharge.ch"]
  }
}
```

- `max_shared_targets` — how many partners to dispatch to in `shared` mode. Default `1`. Bump only after confirming partners are ready for multi-fan-out.
- `test_email_patterns` — case-insensitive substring matches. Submissions whose email contains any pattern are flagged `isTest=true`, ledger writes `skipped_test`, and no partner email or Google Ads conversion fires.

## Seed data

Initial seed for migration parity with the legacy Make scenario (E-ME Énergies exclusive on VD/GE/VS/FR):

| Partner | Env | Cantons (exclusive) | quota | rate |
|---|---|---|---|---|
| E-ME Énergies | staging | VD, GE, VS, FR | 0 (unlimited) | 0.5 |
| E-ME Énergies | production | VD, GE, VS, FR | 0 (unlimited) | 0.5 |

NE and JU remain unassigned — the resolver returns no targets, matching today's behavior.
