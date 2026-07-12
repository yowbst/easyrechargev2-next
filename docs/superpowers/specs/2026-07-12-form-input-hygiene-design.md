# Quote Form Input Hygiene — Design

**Date:** 2026-07-12
**Status:** Approved (pending spec review)

## Goal

Catch two recurring lead-data-quality problems at the source, in the forms:
1. **Email typos** (e.g. `gmail.con`) — a real lead's confirmation bounced because
   of a `.con` address. Surface a soft, click-to-accept correction.
2. **Name casing** — lowercase / untrimmed names (`"mirrazavi "`) reach the CRM
   and partner emails. Normalize to trimmed Title-Case.

This is sub-project **B** of the form/dispatch data-quality work. (Sub-project A,
webhook payload enrichment, already shipped.)

## Scope

- Applies to the two forms that collect name + email: **QuoteForm** (contact
  step) and **ContactForm**. MiniQuoteForm has no name/email fields — out of
  scope.
- Email suggestion: **client-only** (a suggestion; the server never auto-changes
  an email — the user must accept it).
- Name normalization: **client (on blur) + server backstop**.

## Non-goals

- No auto-rewriting of emails (only a suggestion the user accepts).
- No third-party library (`mailcheck` etc.) — a small curated + edit-distance
  check is enough.
- No changes to MiniQuoteForm or to fields other than firstName/lastName/email.

## Shared module — `src/lib/form-hygiene.ts`

Two pure functions, no framework/browser deps, importable on client and server.

### `normalizeName(raw: string): string`
- Collapse internal whitespace and trim.
- If the trimmed string is **all-lowercase or all-uppercase** (considering
  letters only), Title-Case each word (first letter upper, rest lower).
  Otherwise (already mixed-case) return the trimmed string unchanged, preserving
  intentional casing like `McDonald` / `DeLuca`.
- Idempotent (applying twice = applying once), so client + server both applying
  it is safe.
- Examples:
  - `"sina"` → `"Sina"`
  - `"MIRRAZAVI"` → `"Mirrazavi"`
  - `"mirrazavi "` → `"Mirrazavi"`
  - `"McDonald"` → `"McDonald"` (unchanged)
  - `"van der berg"` → `"Van Der Berg"`
  - `""` → `""`

### `suggestEmailCorrection(email: string): string | null`
- Return `null` unless the email is otherwise structurally valid
  (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, the same regex the forms already use).
- Split into `local` + `domain` (lowercased domain).
- **TLD-typo map** (highest-value, exact, unambiguous only): `.con`, `.cmo`,
  `.comm`, `.vom`, `.xom` → `.com`; `.ney`, `.nte` → `.net`; `.chh` → `.ch`.
  (Deliberately excludes valid TLDs like `.co` so we never "correct" a real
  address.) If the domain's TLD matches a key, return
  `local@<domain with corrected tld>`.
- **Domain near-miss**: Levenshtein distance ≤ 1 between the full domain and any
  entry in a curated `KNOWN_DOMAINS` list; if a unique closest match exists (and
  the domain isn't already an exact known domain), return `local@<known domain>`.
  - `KNOWN_DOMAINS` (Swiss + global): `gmail.com`, `googlemail.com`,
    `hotmail.com`, `outlook.com`, `live.com`, `msn.com`, `yahoo.com`, `yahoo.fr`,
    `icloud.com`, `me.com`, `proton.me`, `protonmail.com`, `gmx.ch`, `gmx.net`,
    `bluewin.ch`, `hispeed.ch`, `sunrise.ch`, `swissonline.ch`, `windowslive.com`.
  - Catches `gmial.com`, `hotmial.com`, `gmai.com`, `yaho.com`, `bluewin.hc`, …
- If neither check fires (or the domain is already an exact known domain), return
  `null`.
- Include a small internal `levenshtein(a, b)` helper (≤ ~15 lines), capped/early
  -exit at distance 2 for cheapness.

## Wiring

### QuoteForm (`src/components/quote/QuoteForm.tsx`)
- **firstName / lastName inputs:** add `onBlur={(e) => handleFieldChange(field, normalizeName(e.target.value))}`.
- **email:** compute `const emailSuggestion = suggestEmailCorrection(formData.email)`.
  Below the existing email error, when `emailSuggestion` is non-null and the
  email is valid, render a soft suggestion line: the label text +
  `<button type="button" onClick={() => handleFieldChange("email", emailSuggestion)}>`
  showing the suggested email. Styling: muted, small (matches the existing
  `text-xs` helper text); the email button is emphasized (e.g. underline /
  primary color).

### ContactForm (`src/components/ContactForm.tsx`)
- Same two changes (name `onBlur` normalize; email suggestion line). ContactForm
  already has `onBlur` telemetry on the name fields — keep the telemetry call and
  add the normalize (call both in the handler).

### Server backstop (`src/lib/directus-storage.ts`)
- In `createOrUpdateFormUser`, apply `normalizeName` to `first_name` and
  `last_name` before persisting (they currently pass through raw). This fixes
  lowercase/untrimmed names even when the user autofills and submits without
  blurring. Email is **not** touched server-side.

## i18n

- Add a Directus dictionary key for the suggestion label, e.g.
  `steps.contact.fields.email.suggestion` (QuoteForm, `tq`) and the ContactForm
  equivalent (`d`). Values: fr `"Vouliez-vous dire"`, de `"Meinten Sie"`.
- Provide a hardcoded fr/de fallback in the component when the key is missing, so
  the feature works before the CMS is updated (pattern: `tq(key) || fallback`).
- The suggested email itself is dynamic and rendered as the button label, not
  part of the translated string.

## Error handling / edge cases

- `normalizeName("")` → `""`; never throws.
- `suggestEmailCorrection` on an empty/invalid email → `null` (no suggestion
  shown).
- Suggestion equals the current email → treat as `null` (don't show a no-op).
- A domain that is already an exact `KNOWN_DOMAINS` entry → `null`.

## Testing

Repo has no test framework. Verify with `npx tsc --noEmit` + `npx eslint`, then
manually:
- QuoteForm + ContactForm: type `sina@gmail.con` → suggestion `sina@gmail.com`
  appears; clicking it fills the field; the suggestion then disappears.
- Type a valid unusual domain (e.g. `x@bluewin.ch`) → no suggestion.
- Type `sina` / `MIRRAZAVI ` / `McDonald` in name fields, blur → `Sina` /
  `Mirrazavi` / `McDonald`.
- Submit a lead with lowercase names without blurring → confirm the stored user
  and the webhook payload show Title-Cased, trimmed names (server backstop).

## Rollout

Client + one server function. Additive, no schema change. Deploy via the standard
staging→main flow. Dictionary key can be added in Directus anytime (fallback
covers the gap).
