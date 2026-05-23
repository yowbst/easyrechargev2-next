# Partner Dashboards, Lead Pricing, and Lifecycle — Design

> **Status:** Design approved 2026-05-23. Implementation not yet started.
> Companion to the existing dispatch resolver (`src/lib/dispatch/*`).

## Goal

Extend the in-app partner dispatch system with:

1. A **per-partner CHF price matrix** indexed by lead category (owner × solar).
2. A **per-dispatch lifecycle** — kanban funnel from `New` to `Won/Lost`, plus a `Disqualified` side state covering 7 reasons.
3. A **partner-facing dashboard** at `/partners/<dashboard_token>` where partners move leads through stages and disqualify within a configurable billing window.
4. A **monthly billing report** that sums snapshotted lead prices per partner.

## Architecture summary

A new `partner_lead_prices` collection holds the (partner × category) CHF matrix. Category is derived from existing quote-form fields (`housingStatus`, `solarEquipment`) at dispatch time and snapshotted onto `partner_dispatches.price_chf`. The resolver no longer skips over-quota partners — it sets `gift=true` and dispatches anyway (no billing for gifts).

The dashboard is a Next.js Server Component at `/partners/[uuid]` authenticated by an opaque `partners.dashboard_token`. Two thin POST routes handle stage changes and disqualifications and enforce a per-stage billing window (configurable globally with per-partner overrides). Billing is computed **lazily** at stage change or disqualification, with a token-gated `/api/admin/reconcile-billing` endpoint as a backstop.

No new runtime dependencies. Reuses `directusFetch`, `getEnvironment`, the existing dispatch types and queries.

## Confirmed decisions

| Decision | Value |
|---|---|
| Funnel stages | `New → Contacted → Appointment → Quote Sent → Won → Lost` (6 cols) + side bucket `Disqualified` |
| Billing trigger | Stage reaches `Quote Sent` (locks immediately) **or** stage window elapses without movement |
| Partner auth | URL contains opaque `dashboard_token` (UUID). No login. |
| Disqualification window | Per stage in `site_settings.global_config.dispatch.billing.stage_windows_days`, per-partner override on `partners.disqualification_overrides` |
| Quota exhaustion | Dispatch as **gift** (no billing). Replaces today's `skipped_quota` skip. |
| Pricing source | New `partner_lead_prices` collection (partner × category × env) |
| Price categories | `owner_no_solar`, `owner_solar`, `tenant_no_solar`, `tenant_solar` |
| Price snapshot | Copied onto `partner_dispatches.price_chf` at dispatch time |
| Price visibility | Hidden from partners — dashboard shows `Standard` or `Gift` badge only |

## Working defaults

- `dedup_window_days`: **30** — pre-empts repeat dispatch to same partner for same email.
- `stage_windows_days`: `{ new: 7, contacted: 7, appointment: 14, quote_sent: 0 }`.
- Billing cycle: monthly UTC, reusing `partner_dispatches.month_bucket`.
- Gift leads appear in the partner dashboard, badged `Gift`, never billable.

---

## Data model

### New collection: `partner_lead_prices`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `partner` | M2O → `partners` | Required, cascade |
| `category` | varchar(32) | One of `owner_no_solar | owner_solar | tenant_no_solar | tenant_solar` |
| `price_chf` | integer | Whole CHF |
| `environment` | varchar(16) | `development | staging | production` |
| `status` | string | Directus default |
| `date_created/updated` | datetime | Auto |

Unique on `(partner, category, environment)`.

### `partners` additions

| Field | Type | Notes |
|---|---|---|
| `dashboard_token` | UUID | Default random; backfill with `partners.id` value. Opaque URL credential. |
| `disqualification_overrides` | JSON, nullable | Per-stage override map `{ "<stage>": <days> }` |

`billable_rate` stays untouched — it's a qualification-rate metric, not a CHF price.

### `partner_dispatches` additions

| Field | Type | Notes |
|---|---|---|
| `stage` | varchar(16) | Default `"new"`. Allowed: `new | contacted | appointment | quote_sent | won | lost` |
| `stage_entered_at` | datetime | Server-set on each transition |
| `disqualified` | bool | Default `false` |
| `disqualification_reason` | varchar(32) | Nullable. One of `partner_already_has | dedup | unreachable | not_engaging | competitor | long_timeframe | no_authorization` |
| `disqualified_at` | datetime | Nullable |
| `price_chf` | integer | Nullable. Snapshot at dispatch. `null` = gift. |
| `lead_category` | varchar(32) | Snapshot at dispatch |
| `gift` | bool | Default `false` |
| `billable` | bool | Default `false` |
| `billable_locked_at` | datetime | Nullable |
| `stage_history` | JSON | Append-only `[{ stage, at }]` |

Extend the existing `status` enum to include `skipped_dedup`. The old `skipped_quota` value stays for back-compat reads; new rows never use it.

### `site_settings.global_config.dispatch` extension

```jsonc
{
  // existing dispatch keys untouched
  "billing": {
    "currency": "CHF",
    "stage_windows_days": {
      "new": 7,
      "contacted": 7,
      "appointment": 14,
      "quote_sent": 0
    },
    "dedup_window_days": 30
  }
}
```

---

## Lead categorization

Derive from the existing quote form (`src/components/quote/QuoteForm.tsx`). Lives in a new `src/lib/dispatch/categorize.ts`:

- `housingStatus`: `"owner" | "co-owner" | "tenant"` — co-owner counts as owner (same purchasing pattern).
- `solarEquipment`: `"exists" | "in-progress" | "none" | ""` — both `exists` and `in-progress` count as "has solar".

```ts
export function deriveLeadCategory(data: Record<string, unknown>): LeadCategory {
  const isOwner = data.housingStatus === "owner" || data.housingStatus === "co-owner";
  const hasSolar = data.solarEquipment === "exists" || data.solarEquipment === "in-progress";
  if (isOwner) return hasSolar ? "owner_solar" : "owner_no_solar";
  return hasSolar ? "tenant_solar" : "tenant_no_solar";
}
```

---

## Dispatch flow changes

In `src/lib/dispatch/resolver.ts`, `queries.ts`, `index.ts`:

1. Orchestrator receives `leadCategory` from the quote route.
2. In parallel with the existing quota-count query, fetch:
   - `partner_lead_prices` rows for candidate partners.
   - `partner_dispatches` rows from the last `dedup_window_days` matching `submission.user.email = <email>` AND `partner IN candidatePartners`. The set of matching partner IDs is the dedup set.
3. For each candidate, look up the (partner, leadCategory) price. Snapshot onto the target.
4. **Drop the `skipped_quota` short-circuit.** Over-quota partners are still dispatched, marked `gift=true`, `price_chf=null`. Missing price row → also gift, with a warn log.
5. Partners in the dedup set get a `skipped_dedup` ledger row instead of a real dispatch.
6. `recordDispatch` writes `stage="new"`, `stage_entered_at=now`, `price_chf`, `lead_category`, `gift`, `billable=false`, `stage_history=[{ "new", now }]`.
7. Webhook payload (`src/app/api/quote/route.ts`) gains `leadCategory` at the submission level; each `dispatch.targets[]` already carries `priceChf`/`leadCategory`/`gift` via the extended `DispatchTarget`.

---

## Partner dashboard

### Routes

| Route | Renders |
|---|---|
| `/partners/[uuid]` | Server Component, 6-column kanban + Disqualified bucket |
| `POST /api/partners/[uuid]/dispatches/[id]/stage` | Stage change |
| `POST /api/partners/[uuid]/dispatches/[id]/disqualify` | Disqualification |

`[uuid]` matches `partners.dashboard_token`. Wrong/missing token → 404 (don't leak existence). Page metadata sets `robots: noindex,nofollow`.

### UI

Server Component fetches all `partner_dispatches` rows for the partner (current environment, status='dispatched'). Groups by `stage`; routes `disqualified=true` rows into a collapsible bottom bucket. Active columns use shadcn cards + Tailwind grid.

Each card shows: first name + last initial (privacy), canton, dispatch date, category badge, **billing badge** (`Standard` or `Gift`, **no CHF**), contact info (email/phone), and:
- Stage `<select>` (dropdown initially; drag-and-drop can be a follow-up).
- Disqualify button → opens modal with 7 reasons → POSTs to disqualify endpoint.

Once `billable_locked_at` is set, the card shows a "Verrouillé" badge. Stage can still be moved through Won/Lost for the partner's records, but disqualification is refused.

i18n: dashboard strings live in a new `partner_dashboard` dictionary section. Language follows `partners.language`.

---

## Billing window semantics

`stage_windows_days[stage]` is the time budget *for that stage*, counted from `stage_entered_at`. When a lead moves stages, a fresh budget starts based on the new stage's window. This creates a forcing function: partners must keep progressing leads to keep the disqualification option open.

A lead becomes `billable=true` when **any** of these is first true and it's not already locked:

- `stage` reaches `quote_sent` (or `won`/`lost`).
- `stage_entered_at + windowDays(stage)` is in the past.
- `disqualified=false` AND `gift=false` AND lazy reconciliation flips it.

`gift=true` always wins over billable. `disqualified=true` always wins over billable.

Computed lazily at:

1. **Stage change** — `shouldLockBilling()` checks the previous stage's elapsed time + the new stage's identity.
2. **Disqualification request** — if window already expired, lock billing now and return 409.
3. **Reconciliation endpoint** — `POST /api/admin/reconcile-billing` (token-gated) scans non-billable, non-disqualified, non-gift rows whose current-stage window has elapsed and flips `billable=true`. Safe to call before generating an invoice; can be wired to a Vercel cron later.

---

## Admin billing report

`GET /api/admin/billing?month=YYYY-MM`, header `x-admin-token: $DIRECTUS_STATIC_TOKEN`.

Sums `price_chf` per partner where `month_bucket = <month>` AND `billable=true` AND `gift=false` AND `disqualified=false`. JSON response with `{ partnerId, leadCount, totalChf }[]` and overall `totalChf`. No UI in v1 — founder runs the request monthly.

---

## Critical files

Reused from the existing dispatch system:

- `src/lib/dispatch/types.ts` — extend with `LeadCategory`, `DispatchStage`, `DisqualificationReason`; add fields to `Partner` and `DispatchTarget`; extend `DispatchStatus`.
- `src/lib/dispatch/queries.ts` — add `fetchPartnerLeadPrices`, `findRecentDispatchesByEmail`; extend `fetchDispatchConfig` with billing block; extend `RecordDispatchInput` + `recordDispatch` to write new ledger fields.
- `src/lib/dispatch/resolver.ts` — switch to `ResolverInput` object, snapshot price, gift over-quota partners, respect dedup set.
- `src/lib/dispatch/index.ts` — parallel-fetch price + dedup; pass leadCategory; drop `skipped_quota` emission.
- `src/app/api/quote/route.ts` — call `deriveLeadCategory(quoteData)`, pass to `runDispatch`, include in webhook submission section.
- `src/lib/directus-storage.ts` — `getEnvironment()` reused as-is.

New files:

- `src/lib/dispatch/categorize.ts` — `deriveLeadCategory(data)`.
- `src/lib/dispatch/billing.ts` — `windowDaysFor`, `isWindowExpired`, `shouldLockBilling`.
- `src/lib/dispatch/partner-dashboard-queries.ts` — `fetchPartnerDispatches(partnerId)` with joined `submission.user`.
- `src/lib/partner-auth.ts` — `findPartnerByToken(token)`.
- `src/app/api/partners/[uuid]/dispatches/[id]/stage/route.ts` — stage transition handler.
- `src/app/api/partners/[uuid]/dispatches/[id]/disqualify/route.ts` — disqualification handler.
- `src/app/api/admin/billing/route.ts` — monthly billing report.
- `src/app/api/admin/reconcile-billing/route.ts` — backstop window-locker.
- `src/app/partners/[uuid]/page.tsx` — kanban dashboard.
- `src/components/partners/Kanban.tsx`, `LeadCard.tsx`, `DisqualifyModal.tsx` — client islands.

Docs:

- `docs/operations/partner-dispatch.md` — append a "Lifecycle, pricing, dashboards" section.

---

## Directus pre-requisite checklist (manual)

Before code rollout:

1. Create `partner_lead_prices` collection with the schema above + unique `(partner, category, environment)`.
2. Add `dashboard_token` (UUID, default random, backfill from `id`) and `disqualification_overrides` (JSON) to `partners`.
3. Add the lifecycle/pricing columns above to `partner_dispatches`. Extend the `status` enum to include `skipped_dedup`.
4. Add the `billing` block to `site_settings.global_config.dispatch`.
5. Seed `partner_lead_prices` rows for each live partner × 4 categories with the negotiated CHF amounts (or `0` for "treat as gift while pricing is unknown") before flipping `DISPATCH_MODE=live`.

---

## Verification

End-to-end smoke tests after the Directus pre-requisites + code are deployed to staging:

1. **Categorization** — Submit a quote each as (owner, no solar), (owner, solar exists), (tenant, no solar), (tenant, solar in-progress). Check the resulting `partner_dispatches` row has the right `lead_category` and `price_chf` snapshot.
2. **Gift path** — Set a partner's `monthly_quota=1`, send two leads in their canton with different emails. Second row should have `gift=true`, `price_chf=null`.
3. **Dedup path** — Send two leads with the same email to the same canton within 30 days. Second dispatch row to the same partner should be `status='skipped_dedup'`.
4. **Dashboard auth** — `/partners/<random-uuid>` → 404; `/partners/<real-token>` → 200, kanban renders with only that partner's leads.
5. **Stage move + billing lock** — Move a non-gift lead to `quote_sent` via the stage API. Row gets `billable=true`, `billable_locked_at` set, `stage_history` has two entries.
6. **Disqualify within window** — Disqualify a fresh lead. Row gets `disqualified=true`, `disqualification_reason` set, `billable=false`, `billable_locked_at` set.
7. **Disqualify after window** — Backdate `stage_entered_at` to 30 days ago in Directus. Attempt to disqualify → 409. Row flips to `billable=true`.
8. **Billing report** — `GET /api/admin/billing?month=YYYY-MM` with the admin token returns a non-empty `rows[]` and the sum matches a manual Directus query.
9. **Build + lint** — `npm run lint && npm run build` on `staging`.

---

## Open items

- Disqualification reason wording in `de`/`fr` (will live in Directus translations under the new `partner_dashboard` dictionary section).
- Whether `Lost` and `Disqualified` buckets should paginate or limit to last 90 days once they accumulate.
- Whether to add `/partners/[uuid]/lead/[dispatchId]` for a full lead detail drawer in v1 or punt to v2.
