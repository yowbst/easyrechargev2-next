# Partner Invoicing — Rollout Checklist

**Status:** code complete on `feat/partner-invoicing` (434 tests green).
**Step 1 (schema) is DONE.** The remaining steps mutate production data, Vercel or Google
and are still open.

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

## Step 1 — Directus schema — ✅ DONE 2026-09-05

Applied via `scripts/create-invoicing-schema.py --apply` against
`easyrechargev2-directus-production.up.railway.app` (same instance as `cms.easyrecharge.ch`
— verified: identical `site_settings` id and `date_updated`).

Created: `partner_invoices` (31 fields, `number` unique), `partner_invoice_lines` (21 fields),
the three relations, the `lines` O2M alias, `partners.invoice_code`, `partner_dispatches.invoice`.
Permissions `read`/`create`/`update` with `fields: ["*"]` granted to the **Backend (Server
Token)** policy on both new collections. `invoice_code = EME` set on all three partner rows.

`partner_dispatches` already had `update` with `fields: ["*"]` on that policy, so the new
`invoice` field — which cancellation clears — was covered without a change.

Verified end to end against real Directus: `POST /api/admin/invoices/preview` for
`eme-energies` / `2026-07` returns `number: EME-202607`, `issuanceRank: 1`,
`existingLiveInvoice: null`, and **15 unsettled** dispatches.

**Still to do here — the data half:**

```bash
npx tsx --env-file=.env.local scripts/backfill-dispatch-booleans.ts          # dry run
npx tsx --env-file=.env.local scripts/backfill-dispatch-booleans.ts --apply
```

Expect ~37 rows. `disqualified` and `gift` are NULL on every real row, which is what has
kept `billable` from ever locking. Then set both fields' defaults to `false` and uncheck
Allow NULL in the Directus data model.

Those 15 unsettled dispatches stay unsettled — and July stays un-issuable — until the
backfill lands and the cron (Step 6) locks them.

## Step 2 — `site_settings.global_config` — ✅ NOT NEEDED

The issuer block was dropped. The issuer never varies, so **easyRecharge's name, contact and
address are hardcoded in the template** rather than injected. There is no `company` block to
create, and no IBAN in Directus — the IBAN lives in the template's QR section, filled by hand.

`payment_terms_days` also needs nothing: the code defaults to 21, which is what
`EME-202607` used.

`issuer_snapshot` is still written on each invoice but is now unused by the document.
Harmless, and it keeps the option of driving the issuer from config later.

> **Security note found while checking this — FIXED 2026-09-06.**
> `src/app/[lang]/[slug]/page.tsx` passed the whole `global_config` object to
> `QuoteForm`, a client component, so its entire contents were serialised into the page
> sent to the browser. Verified on production `/fr/demande-devis`: the Make webhook URLs,
> `test_email_patterns`, the Google Ads account id and the billing config were all
> readable in the served HTML — anyone could post fabricated quotes into the Make
> scenario, producing real dispatches and real billing.
>
> Fixed with an allow-list (`src/lib/public-config.ts`): only `stats`, `trustpilot`,
> `slas` and `google_ads` reach the client, so a secret added to `global_config` later
> cannot leak by default. Five tests guard it. Verified closed on production.
>
> **Residual risk, accepted by Yoan on 2026-09-06:** the webhook URLs were not rotated,
> so anyone who noted them during the exposure window can still post to the Make
> scenarios. A payload or shared-header check at the top of each scenario would close
> that without changing the URLs.

## Step 3 — the acceptance window — ✅ DONE 2026-09-06

`dispatch.billing.acceptance_window_days` is now **15** (was 30), applied after Yoan
confirmed E-ME's agreement. August moved from issuable 2026-10-01 to **2026-09-16**;
September will be issuable 2026-10-16.

No retroactive locking resulted: a reconcile dry-run right after the change found zero
new candidates. The eight unsettled August leads (dispatched 24–31.08) lock between
08.09 and 15.09.

**E-ME must be told the change is live** — their window to refuse a lead is now half
what it was, including for leads already dispatched.

## Step 4 — fix E-ME's billing address

`partners.street_number` says `2`; the June invoice says `4`. One is wrong, and it prints on
an accounting document. Verify which.

## Step 5 — Google — ✅ MOSTLY DONE 2026-09-05

Service account `easyrecharge-invoices@erv2-2026.iam.gserviceaccount.com` authenticates,
and both the template and the `1 - Finance` root folder are shared with it (verified live:
`edit=true` on the template, `addChildren=true` on the root).

The template Doc `1isW8xAJjvWdHn7jV8kYcynRa2fUKVMML3ssOAVBNDbo` was converted in place from
the June invoice into a real template: **19 placeholders**, no June values left, plus an
adjustment row (table row 3) and `{{dashboard_url}}` under "Détail des leads". The issuer
block (name, contact, street, city) is deliberately **hardcoded**, not templated.

Filing is **dynamic**: the destination is resolved per invoice as
`<GOOGLE_INVOICE_ROOT_FOLDER_ID>/<year>/Revenus`, the year taken from `period_month`.
Confirmed present: `2026/Revenus` and `2025/Revenus`. Generation throws
`invoice_folder_not_found` (409) rather than creating a folder or filing elsewhere — so a
missing year folder fails loudly every January instead of silently filing into the old one.

**Still open:**

- **Rotate the service account key.** It was pasted into a chat transcript on 2026-09-05.
  Delete it under *Keys* and create a new one.
- Enable **Google Drive API** and **Google Docs API** on project `erv2-2026` if not already.
- Set the four `GOOGLE_*` variables in **Vercel** (they are set in `.env.local`).
- Decide whether `{{dashboard_url}}` may carry `dashboard_token`: an invoice forwarded to an
  external accountant would grant them access to E-ME's leads.
- The template's adjustment row currently sits **below** the VAT line. Move it above if you
  prefer the usual ordering — the placeholders work wherever the row lives.

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

## August 2026 — issue from 16.09

July's invoice `EME-202607` (17 leads, CHF 680) was issued and sent on 06.09.2026.

August is **not issuable before 2026-09-16**, and that is deliberate: 8 of its 9 billable
leads were still inside E-ME's 15-day refusal window on 06.09, locking between 08.09 and
15.09. None of them had moved a stage, so E-ME had not looked at them yet. Yoan chose to
wait rather than force the locks — billing a partner for leads they can still refuse,
nine days after confirming the shorter window to them, is not defensible.

Expected shape:

| | |
|---|---|
| Billable | 9 leads, CHF 360 |
| Gifted | 11 leads, CHF 0 — `gift_reason: commercial_agreement` |
| Number | `EME-202608` |

The 11 gifts are the 3–23 August commercial arrangement. They will appear on the partner
dashboard with an "Offert" badge and as a `Leads offerts | 11` row on the document — no
manual lead lines are needed this time, the ledger covers the whole month.

```bash
T=$(grep ^DIRECTUS_STATIC_TOKEN .env.local | cut -d= -f2-)
curl -s -X POST -H "x-admin-token: $T" -H 'Content-Type: application/json' \
  -d '{"partner":"eme-energies","month":"2026-08"}' \
  https://easyrecharge.ch/api/admin/invoices/preview | python3 -m json.tool
# then POST .../api/admin/invoices to issue, and .../<id>/document to generate
```

If `unsettled` is not empty on 16.09, the daily cron has not run — check that `CRON_SECRET`
is set in Vercel, or call `POST /api/admin/reconcile-billing` by hand.

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
