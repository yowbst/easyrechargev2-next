# Partner Invoicing — Rollout Checklist

**Status:** code complete on `feat/partner-invoicing` (26 commits, 434 tests green).
Every step below is a **human** step: each mutates production Directus, Vercel, or Google,
and none of them was executed by the agent that wrote the code.

Spec: `docs/superpowers/specs/2026-09-05-partner-invoicing-design.md`
Plan: `docs/superpowers/plans/2026-09-05-partner-invoicing.md`

---

## Step 0 — do this FIRST, before anything else

**Disqualify the QA test lead of 12.07.2026** (`lead.dispatch.qa@proton.me`) in
`partner_dispatches`: set `disqualified = true`, `disqualification_reason = "dedup"`,
`disqualification_note = "QA test lead"`.

Its row carries `status='dispatched'`, not `skipped_test`, so the scope rule treats it as a
real billable lead. Its acceptance window closed long ago, which means **the first run of
the new daily cron will lock it to `billable=true`** — and once `billable_locked_at` is set,
the disqualify route refuses with `billing_locked`. After that only manual Directus surgery
can undo it.

Order matters: disqualify this row **before** Step 6 provisions `CRON_SECRET`.

## Step 1 — Directus schema

Create, per the spec's Data model tables:

- collection `partner_invoices` — **`number` must carry a unique constraint.** It is
  load-bearing, not cosmetic: `findInvoicesForPeriod` is a check-then-act race without it.
- collection `partner_invoice_lines`
- on `partner_invoices`, the O2M alias **named exactly `lines`** → `partner_invoice_lines.invoice`.
  The partner-facing view reads `lines`; a different name leaves its detail table silently
  empty (it degrades rather than crashing, so you would not notice).
- on `partner_dispatches`: add `invoice` (M2O → `partner_invoices`, nullable)
- on `partners`: add `invoice_code` (String, max 8). **Set it to `EME`** on the production
  row `547c103f-2525-4fef-a10d-66dfd573f723`. Without it, issuing throws `missing_invoice_code`.

Then set defaults and backfill:

- `partner_dispatches.disqualified` and `.gift` → default `false`, **uncheck Allow NULL**
- run the backfill, dry-run first:
  ```bash
  npx tsx --env-file=.env.local scripts/backfill-dispatch-booleans.ts
  npx tsx --env-file=.env.local scripts/backfill-dispatch-booleans.ts --apply
  ```
  Expect ~37 rows. This is what makes `billable` lockable at all — it has never been set on
  any dispatch, in any month.

**Permissions for the static token's role:** read + write on both new collections, **and
write on `partner_dispatches.invoice`**. That last one is new — cancelling an invoice now
clears the stamp to release its dispatches, and it fails without it.
`scripts/verify-invoicing-schema.ts` checks field presence but **not** permissions.

Verify:
```bash
npx tsx --env-file=.env.local scripts/verify-invoicing-schema.ts
```

## Step 2 — `site_settings.global_config`

Add the `company` block (spec §Data model) — it is the source of `issuer_snapshot`, and the
issuer's address currently exists nowhere but the Google template. **Fill in the IBAN.**

Add `invoicing: { payment_terms_days: 21 }`.

## Step 3 — the acceptance window *(gated)*

Set `dispatch.billing.acceptance_window_days` to `15`.

**Do not do this until E-ME has agreed.** It halves their contractual window to disqualify a
lead, from 30 days to 15. The code default already reads 15; until you change the stored
config, the live value of 30 wins and July stays un-issuable until 30 August.

## Step 4 — fix E-ME's billing address

`partners.street_number` says `2`; the June invoice says `4`. One is wrong, and it prints on
an accounting document. Verify which.

## Step 5 — Google

- Copy the invoice template onto an **easyRecharge** Google account (not neho.ch — it would
  put client names and addresses in your employer's Drive).
- Replace its literal values with the English placeholders listed in the spec
  (`{{invoice_number}}`, `{{issue_date}}`, `{{line_quantity}}`…).
- **Add an adjustment row** carrying `{{adjustment_label}}` and `{{adjustment_amount}}`.
  Both render as an empty string when there is no adjustment, so the row collapses on an
  ordinary invoice. **Until this row exists, do not use a discount** — the total would drop
  with nothing on the document explaining why.
- Replace the old spreadsheet-annex link with `{{dashboard_url}}`.
- Create a service account, share the template and the destination folder with it, and set
  `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`,
  `GOOGLE_INVOICE_TEMPLATE_DOC_ID`, `GOOGLE_INVOICE_FOLDER_ID`.

Open question you still owe an answer to: `{{dashboard_url}}` embeds `dashboard_token`, the
sole credential for E-ME's leads. An invoice forwarded to an external accountant would grant
them access. If that bothers you, link to a bare `/partners` URL instead.

## Step 6 — Vercel

Generate `CRON_SECRET` (`openssl rand -base64 32`) and set it in Production and Preview.
The daily cron at 03:00 UTC is what actually locks `billable`. **Step 0 must be done first.**

## Step 7 — the CMS page

Create a `pages` row with `route_id = "partner-invoices"` and fr/de translations, like
`partner-leads` and `partner-stats`. Until it exists every string on the invoices view
renders as `[key]` — visible, not broken.

Keys needed: `title`, `empty`, `col.number`, `col.period`, `col.total`, `col.status`,
`col.issued`, `col.due`, `status.issued`, `status.sent`, `status.disputed`, `status.paid`,
`detail.title`, `detail.col.date`, `detail.col.lead`, `detail.col.category`, `detail.col.amount`.

## Step 8 — the first real invoice (July 2026)

```bash
T=$(grep ^DIRECTUS_STATIC_TOKEN .env.local | cut -d= -f2-)
curl -s -X POST -H "x-admin-token: $T" -H 'Content-Type: application/json' \
  -d '{"partner":"eme-energies","month":"2026-07"}' \
  https://easyrecharge.ch/api/admin/invoices/preview | python3 -m json.tool
```

Expect 14 lines and CHF 560 (15 ledger rows minus the QA lead from Step 0). If `unsettled`
is non-empty, the cron has not locked those rows yet.

Then issue, and add the three pre-go-live leads — they were dispatched before the ledger
went live on 12.07.2026 at 15:25, so they have no ledger rows:

| Label | CHF |
|---|---|
| `P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04` | 40 |
| `P / CHAILLET / 1009 Pully / 2026-07-07` | 40 |
| `P / GOLAY / 1807 Blonay / 2026-07-07` | 40 |

Use the MCP tool `add_invoice_manual_lead` (or `POST /api/admin/invoices/[id]/manual-lead`) —
it recomputes the invoice totals from the actual lines. Do **not** insert them by hand in
Directus; the header totals would not follow.

**Shabani (5325 Leibstadt, AG) is not billable** — AG is in no E-ME coverage area. The
production partner covers VD, GE, FR, VS and NE.

Expected total: **17 leads, CHF 680.**

Generate the document, check every `{{…}}` placeholder resolved, add the QR payment part by
hand, export, send. Then record it:

```bash
curl -s -X POST -H "x-admin-token: $T" -H 'Content-Type: application/json' \
  -d '{"status":"sent"}' https://easyrecharge.ch/api/admin/invoices/<id>/status
```

---

## Things to know that are not steps

- **If you hand-create any invoice row in Directus, set `environment` to `production`.**
  The admin list and the `list_invoices` MCP tool now filter on it, so a row without it is
  invisible.
- **Cancelling an invoice releases its dispatches** back into the billable pool. That is the
  recovery path if a run half-fails: cancel, then re-issue — the number becomes `-R2`.
- **Regenerating a document bumps the version** and always creates a *new* Doc. Your hand
  edits on the previous one are never overwritten; the old URL stays in `doc_versions[]`.
- **A month mixing unit prices refuses to generate a document** (`mixed_unit_prices`, 409)
  rather than printing a line that does not add up. If a manual lead line carries a price
  different from the ledger leads, you will hit this — it is deliberate.
- June 2026 was invoiced from Attio (13 leads, CHF 520) and has no ledger rows. Nothing in
  this system reaches back before 12.07.2026.
