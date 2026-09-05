# Partner Invoicing — Design

**Date:** 2026-09-05
**Status:** Approved by Yoan (scope, numbering scheme, Google Docs output, partner-facing view)

## Goal

Add the missing second layer of billing: a persistent **invoice** that freezes a set of
billable dispatches for a period, carries a number and a lifecycle up to payment, and
generates an editable Google Doc from Yoan's existing template.

Today `partner_dispatches` is a solid per-lead ledger (price snapshotted at dispatch,
`gift`, `billable`, `billable_locked_at`, `disqualified`, stage lifecycle, `month_bucket`),
but nothing sits above it. The only period-level artifact is `getMonthlyBilling()` — a
stateless `aggregate[sum]` recomputed on every call. It has no number, no status, no due
date, no payment state, no document, and no frozen scope: a later price change or
disqualification silently rewrites last month's "report".

## Non-goals

- **PDF generation and Swiss QR-bill.** Yoan takes the generated Doc, adds the QR payment
  part himself, exports and sends it. No `pdfkit`, no `swissqrbill`, no PDF dependency.
- **Bank reconciliation** (camt.054 import). Payment is marked by hand.
- **VAT computation.** easyRecharge is not VAT-registered. The fields exist and stay at
  zero so the day of registration is a config change, not a migration.
- **A formal credit-note subsystem.** Exceptional corrections are a manual `adjustment`
  line on the next invoice.
- **An admin UI.** Token-gated routes plus MCP tools; the Directus admin is the visual
  fallback. A `/admin/billing` page can be added later without discarding anything.
- **Attio.** It runs in parallel as Yoan's CRM and nothing in this codebase references it.
  Directus is the sole source of truth for invoicing.
- **Multi-partner rollout concerns.** E-ME Énergies is the only active partner; the model
  is partner-scoped but not optimized for scale.

## Prerequisites

These must land **before** the invoicing layer, or `issue_invoice` produces an empty
invoice.

1. **Fix the `disqualified` filter.** `getMonthlyBilling()` and `reconcileBilling()` in
   `src/lib/dispatch/admin.ts` both filter `filter[disqualified][_eq]=false`, but the
   column is `null` on every real row. Directus excludes nulls from `_eq=false`, so the
   reconcile candidate query returns zero rows and nothing is ever locked. Verified
   2026-09-05: **no dispatch has ever had `billable=true`** — not in July (15 rows), August
   (20) or September (2). Same defect on the `gift` filter in `getMonthlyBilling()`.
   Fix: `_neq: true` on both filters.
2. **Backfill** `disqualified = false` and `gift = false` on the 37 existing rows, and set
   non-nullable defaults so the bug cannot recur.
3. **Shorten the acceptance window** from 30 to 15 days. *Contractual — requires E-ME's
   agreement, it halves their window to disqualify a lead.*
4. **Schedule reconciliation.** `POST /api/admin/reconcile-billing` is a documented manual
   curl wired to no cron and has apparently never run. Add a daily Vercel cron.
5. **Correct E-ME's street number.** Directus says `2`, the June invoice says `4`. It is a
   billing address on an accounting document — verify which is right.
6. **Update `docs/operations/partner-dispatch.md`.** It still describes per-stage windows
   (`stage_windows_days`, counted from `stage_entered_at`, defaults `{new:7, contacted:7,
   appointment:14}`). The code implements a single acceptance window from `dispatched_at`
   (`acceptance_window_days`), and `stage_windows_days` does not exist in `site_settings`.
   The May plan described the per-stage version; the implementation simplified.

## Scope rule

An invoice for period `YYYY-MM` contains dispatches where:

```
month_bucket   = <period>
billable       = true
gift          != true
disqualified  != true
invoice        = null        (never billed before)
```

Scope is **the dispatch month**, chosen over "lock month" so that "the July leads" and
"the July invoice" mean the same thing to the partner. The cost is a deferred issue date.

An invoice is **issuable only from `period_end + acceptance_window_days`** — 16 August for
July, with the window at 15 days. `issueInvoice` runs reconciliation for the period first
and **refuses** if any dispatch in the month is still unsettled. That refusal is what makes
the freeze honest.

## Lifecycle

```
(preview) ──issue──> issued ──send──> sent ──pay──> paid
                        │              │
                        └─── revise ───┘   version + 1, new Doc, number unchanged
                        └────────────────> cancelled   number retained, never reused
```

`preview` is not persisted — it is recomputed on demand. Persistence begins at `issue`,
which freezes the scope, assigns the number, snapshots issuer and debtor, and writes the
lines.

`revise` handles the back-and-forth with the partner: it bumps `version`, generates a new
Doc, and pushes the previous one onto `doc_versions[]`. It never overwrites a Doc Yoan has
edited by hand.

## Numbering

`<PARTNER_INVOICE_CODE>-<YYYYMM>` — e.g. `EME-202607`, where the code is the new
`partners.invoice_code` field (never derived from the slug). `version` is a separate integer field,
rendered on the Doc as `EME-202607 | v2`, matching the June invoice's `B789CB54-202606 | v1`
shape without its opaque prefix.

**Accepted trade-off:** this is not a continuous sequence, which a Swiss tax audit prefers.
With one invoice per partner per month the series stays reconstructible and gap-free as long
as nothing is cancelled. `cancelled` therefore **retains** its number rather than freeing it,
and a re-issue for the same period is suffixed with its issuance rank: the second issuance
of July is `EME-202607-R2`, the third `EME-202607-R3`. The first issuance carries no suffix,
so the common case stays clean.

`events[].actor` is one of `yoan` \| `partner` \| `system`; `events[].type` is one of
`issued` \| `sent` \| `comment` \| `revision_requested` \| `revised` \| `paid` \| `cancelled`.

## Data model

### New collection: `partner_invoices`

| Field | Directus type | Notes |
|---|---|---|
| `id` | UUID, PK | default *Generate UUID* |
| `number` | String, **unique** | `EME-202607` |
| `version` | Integer | default `1` |
| `status` | String (dropdown) | `issued` \| `sent` \| `disputed` \| `paid` \| `cancelled`, default `issued` |
| `partner` | M2O → `partners` | |
| `period_month` | String | `2026-07` |
| `period_start`, `period_end` | Date | |
| `issued_at`, `due_at`, `sent_at`, `paid_at` | Timestamp, nullable | |
| `payment_terms_days` | Integer | default `21` (from the June invoice: 12.07 → 02.08) |
| `currency` | String | default `CHF` |
| `subtotal_chf`, `adjustment_chf`, `total_chf` | Decimal(10,2) | |
| `vat_rate`, `vat_chf` | Decimal | default `0`, dormant until VAT registration |
| `issuer_snapshot`, `debtor_snapshot` | JSON | frozen at issue |
| `doc_url`, `doc_file_id` | String | current Google Doc |
| `doc_versions` | JSON | `[{version, doc_url, doc_file_id, generated_at}]` |
| `events` | JSON | `[{at, actor, type, note}]` — the partner back-and-forth |
| `notes` | Text | internal, never rendered on the Doc |
| `environment` | String | same convention as the rest of the schema |

Plus an O2M alias `lines` → `partner_invoice_lines`.

`issuer_snapshot` and `debtor_snapshot` do the essential work: if E-ME's address changes in
October, the July invoice still shows July's. That is precisely what the current aggregate
report cannot do.

### New collection: `partner_invoice_lines`

`id` (UUID), `invoice` (M2O → `partner_invoices`), `dispatch` (M2O → `partner_dispatches`,
nullable), `kind` (dropdown `lead` \| `adjustment`, default `lead`), `label`, `description`,
`quantity` (Integer, default 1), `unit_price_chf` / `amount_chf` (Decimal(10,2)),
`sort` (Integer).

`kind` and `dispatch` are independent axes:

| `kind` | `dispatch` | Meaning |
|---|---|---|
| `lead` | set | the normal case — a billable dispatch |
| `lead` | `null` | a lead billed without a ledger row (pre-go-live manual dispatches) |
| `adjustment` | `null` | a discount or correction, `amount_chf` typically negative |

Plus fields **copied** from the dispatch so the line stands alone: `dispatched_at`,
`canton`, `postal_code`, `locality`, `last_name`, `lead_category`, `product`.

The copy is deliberate — the invoice must not move when the ledger moves.

`label` follows the June annex convention: `P / PALTHEY / 1066 Epalinges / 2026-06-01`
(surname only, no first name — the same privacy stance as the kanban's "first name + last
initial").

### Changes to `partner_dispatches`

| Action | Field | Why |
|---|---|---|
| **Add** | `invoice` — M2O → `partner_invoices`, nullable | double-billing lock: a dispatch already on an invoice cannot enter another scope |
| **Alter** | `disqualified` — default `false`, non-nullable | root cause of the billing bug |
| **Alter** | `gift` — default `false`, non-nullable | `getMonthlyBilling()` filters on it too |
| **Backfill** | `disqualified`, `gift` → `false` on 37 rows | fixing the filter alone is not enough |

### Changes to `site_settings.global_config`

```jsonc
"dispatch": {
  "billing": {
    "acceptance_window_days": 15   // was 30 — requires E-ME's agreement
  }
},
"invoicing": {                     // new block
  "payment_terms_days": 21
},
"company": {                       // new — the issuer identity exists nowhere today
  "name": "easyRecharge",
  "contact_name": "Yoan Basset",
  "street": "Ch. de Sorécot 33",
  "postal_code": "1033",
  "locality": "Cheseaux/Lausanne",
  "country": "CH",
  "email": "yoan@easyrecharge.ch",
  "iban": "<TO FILL>",
  "vat_number": null
}
```

`company` feeds `issuer_snapshot`. Until now the issuer's address lived only inside the
Google template.

### New CMS page

A `pages` row with `route_id = "partner-invoices"` and fr/de translations, exactly like
`partner-leads` and `partner-stats`. It supplies the `pages.partner-invoices.*` dictionary.

### Permissions

The static token's Directus role needs read + write on both new collections, or the admin
routes fail silently.

## Document generation

A Google **service account** (`googleapis`, Drive + Docs scopes — **no Sheets**, the annex
is gone):

1. `drive.files.copy` the template into the destination folder
2. `docs.documents.batchUpdate` / `replaceAllText` on the placeholders
3. write `doc_url` / `doc_file_id`, push the previous Doc onto `doc_versions[]`

The `QR Facture` block is left empty — Yoan fills it. Regeneration always creates a **new
versioned Doc** and never overwrites the previous one, so hand edits survive.

### Template placeholders — English only

```
{{invoice_number}}   {{invoice_version}}   {{issue_date}}      {{due_date}}
{{issuer_name}}      {{issuer_contact}}    {{issuer_street}}   {{issuer_city}}
{{debtor_name}}      {{debtor_street}}     {{debtor_city}}     {{sent_to}}
{{period_label}}     {{period_start}}      {{period_end}}
{{line_description}} {{line_quantity}}     {{line_unit_price}} {{line_amount}}
{{vat_rate}}         {{vat_amount}}        {{total_due}}
{{dashboard_url}}
```

The Doc carries a **single aggregated line** (`13 | CHF 40.00 | CHF 520.00`), matching June.
Per-lead detail lives in the partner dashboard, not in the document.

`{{dashboard_url}}` replaces the June annex link (`Deals - À facturer _ 06.2026.xlsx`).

**Open security question:** the dashboard URL embeds `dashboard_token`, the sole credential
for the partner's leads. Harmless while the invoice stays at E-ME, but an invoice forwarded
to an external accountant grants access to every lead. If that is unacceptable, link to a
bare `/partners` URL with a "from your partner area" wording instead.

### New env vars

`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`,
`GOOGLE_INVOICE_TEMPLATE_DOC_ID`, `GOOGLE_INVOICE_FOLDER_ID`.

The template must live on an **easyRecharge** Google account (not neho.ch — that would mix
easyRecharge billing data, lead names and addresses included, into the employer's Drive) and
be shared with the service account.

**Unverified:** the template's internal structure (tables, styles) has not been inspected.
`replaceAllText` operates on text; since the Doc holds one aggregated line, no row insertion
is expected — but this must be confirmed when writing the implementation plan.

## Surfaces

Token-gated routes (`x-admin-token`, the existing convention) with MCP tools as thin
wrappers — the same pattern as `reconcile-billing` / `get_billing`.

| Route | MCP tool |
|---|---|
| `POST /api/admin/invoices/preview` | `preview_invoice` |
| `POST /api/admin/invoices` | `issue_invoice` |
| `POST /api/admin/invoices/[id]/document` | `generate_invoice_document` |
| `POST /api/admin/invoices/[id]/status` | `set_invoice_status` |
| `POST /api/admin/invoices/[id]/note` | `add_invoice_note` |
| `GET /api/admin/invoices` | `list_invoices` |

### Library — `src/lib/billing/`

| File | Responsibility |
|---|---|
| `period.ts` | `computePeriod(month)`, `isPeriodIssuable(month, config, now)` |
| `scope.ts` | `collectBillableDispatches(partnerId, month)` |
| `numbering.ts` | `buildInvoiceNumber(partner, month)`, cancellation suffixes |
| `invoice.ts` | `previewInvoice`, `issueInvoice`, `reviseInvoice`, `setStatus`, `addNote`, `addAdjustment` |
| `google-docs.ts` | template copy + placeholder substitution, **behind an interface** so tests run offline |

## Partner-facing view — `/partners/[uuid]/invoices`

The slot already exists: the sidebar carries a disabled `Receipt` item badged "Bientôt",
right above an identical "Settings". Enabling it is the whole navigation change.

- New server page `src/app/partners/[uuid]/invoices/page.tsx`, on the exact pattern of
  `leads/page.tsx`: `findPartnerByToken(uuid)` → `notFound()`,
  `fetchPage("partner-invoices", locale)`, `?lang=fr|de`, `robots: noindex`
- `PartnerNav` goes from `"leads" | "stats"` to `"leads" | "stats" | "invoices"`
- The sidebar item drops `disabled` and its badge and gains its `Link`
- `PREFIXES` in `src/lib/partner-i18n.ts` gains `pages.partner-invoices.`
- **List:** number, period, total, status badge, issue and due dates
- **Detail:** the per-lead table that used to be the annex — `NOM / NPA Localité`, date,
  category, amount
- `cancelled` invoices are not shown

**Product decision being reversed:** the dashboard deliberately hides CHF amounts today
(`Standard` / `Gift` badge only, stated explicitly in the runbook). Publishing invoices
exposes the price grid and each lead's price. The objection is weak — E-ME receives the
invoice and knows the price — but it is a reversal, not an implementation detail. A softer
variant shows amounts only in the invoices view and leaves the kanban silent.

## Error handling

| Case | Behaviour |
|---|---|
| Period not yet issuable | 409 `period_not_issuable`, with the earliest issuable date |
| Unsettled dispatches in the period | 409 `unsettled_dispatches` + the offending ids |
| Empty scope | 409 `empty_scope` — never issue a zero invoice |
| Dispatch already carries an `invoice` | excluded from scope, reported in the preview |
| Duplicate number | 409 `duplicate_number` — the unique index is the backstop |
| Google API failure | invoice stays `issued` with `doc_url` null; generation is retryable and idempotent |
| Status transition not allowed | 409 `invalid_transition` |

Document generation is deliberately **decoupled** from issuance: a Google outage must not
block the freeze.

## Testing

Vitest, alongside the existing `src/lib/dispatch/*.test.ts`:

- `period.ts` — boundaries, the issuable date with a 15-day window, month rollover
- `scope.ts` — each exclusion (gift, disqualified, not billable, already invoiced), and the
  `null`-vs-`false` regression that caused the original bug
- `numbering.ts` — format, cancellation suffix, collisions
- `invoice.ts` — totals with adjustment lines, snapshot immutability, transition matrix,
  `revise` version increment
- `google-docs.ts` — against a fake implementing the interface; no network

Manual acceptance: issue July 2026 for E-ME, confirm 15 leads and CHF 600 before exclusions,
generate the Doc, check every placeholder resolved, verify the partner view.

## Rollout

1. Prerequisites 1–6 above, deployed and verified (`billable=true` actually appears)
2. Directus schema: collections, fields, defaults, backfill, permissions
3. `src/lib/billing/` with its tests
4. Admin routes, then the MCP tools wrapping them
5. Template copy with English placeholders + service account, then `google-docs.ts`
6. Partner-facing view and the CMS page
7. First real run on the **August 2026** period; July 2026 is issued in the same pass, with
   two manual corrections it cannot derive on its own:
   - the three pre-go-live leads (Papeil 04.07, Chaillet 07.07, Golay 07.07 — dispatched
     before the ledger went live on 12.07.2026 at 15:25) added as `lead` lines with
     `dispatch = null`. A fourth quote of that period, Shabani (5325 Leibstadt, **AG**), is
     **not** billable: AG is in no E-ME coverage area (the production partner row
     547c103f covers VD/GE/FR/VS/NE).
   - the QA test lead of 12.07 (`lead.dispatch.qa@proton.me`) marked `disqualified` in the
     ledger before issuing, otherwise the scope rule includes it — its row carries
     `status='dispatched'`, not `skipped_test`.

   Expected July total: 15 ledger rows − 1 QA + 3 manual = **17 leads, CHF 680**.

## Open items

- `partners.invoice_code` (String, max 8) — added during planning: the spec's `EME-202607`
  needed a source for `EME`, and deriving it from the slug is fragile. Set to `EME`.
- An adjustment endpoint is missing from the Surfaces table — see the plan's Task 14.
- E-ME street number: `2` or `4`
- easyRecharge IBAN for `global_config.company`
- Whether `{{dashboard_url}}` may carry the `dashboard_token`
- E-ME's agreement on the 30 → 15 day acceptance window
