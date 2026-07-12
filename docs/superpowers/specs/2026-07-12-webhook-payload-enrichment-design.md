# Webhook Payload Enrichment — Design

**Date:** 2026-07-12
**Status:** Approved (pending spec review)

## Goal

Enrich the quote webhook payload so the Make scenario no longer has to compute
derived values, and fix a phone-parsing gap in the manual-dispatch path. Four
additions, all in the shared payload builder (`buildQuoteWebhookPayload` in
`src/lib/dispatch/webhook.ts`), so both the quote route and the manual-dispatch
route benefit.

This is sub-project **A** of a larger set. Sub-project **B** (quote-form input
hygiene: email typo suggestion, name capitalization) is a separate spec.

## Scope

1. Phone country fallback (fixes empty phone object on manual dispatch).
2. `submission.ref` — computed reference string.
3. `submission.request_url` — customer-facing success page URL.
4. `targets[].crmUrl` — per-partner CRM/kanban URL.

## Non-goals

- No change to how partners are resolved or billed.
- No storage of `phoneCountry` on the user record (Swiss-only marketplace; a
  `CH` default is sufficient).
- No changes to the quote form UI (that is sub-project B).

## 1. Phone country fallback

**Problem:** the manual-dispatch route calls `parsePhone(user?.phone ?? null)`
with no country. libphonenumber cannot parse a Swiss national number
(`"0789514497"`) without one, so `international` / `countryCode` /
`countryCallingCode` come back `null`.

**Fix:** default `defaultCountry` to `"CH"` in the shared `parsePhone`:

```ts
export function parsePhone(raw: string | null | undefined, defaultCountry: string = "CH") {
```

The quote route always passes an explicit `phoneCountry`, so this changes
behavior only for callers that omit it (the manual-dispatch route today). Result
for `"0789514497"`: `international: "+41 78 951 44 97"`, `countryCode: "CH"`,
`countryCallingCode: "+41"`.

## 2. `submission.ref`

A stable human-readable reference, added to the `submission` object.

**Format:** `P / {UPPER(trim(lastName))} / {postalCode} {locality} / {YYYY-MM-DD(submittedAt)}`

Example: `P / MIRRAZAVI / 1110 Morges / 2026-07-12`

Rules:
- `lastName`: trimmed, then uppercased. (Fixes the observed trailing-space case.)
- `postalCode`, `locality`: read from `submission.data`.
- Date: `submittedAt` formatted `YYYY-MM-DD` (UTC, from the ISO string —
  `submittedAt.slice(0, 10)`).
- Missing pieces render as empty segments (mirrors the current Make formula);
  the fixed `P / … / … / …` skeleton is always present.

Implemented as a small pure helper `buildQuoteRef({ lastName, postalCode, locality, submittedAt })`
so it is unit-reasoned in isolation.

## 3. `submission.request_url`

The customer-facing success page for the submission, added to the `submission`
object.

**Format:** `{host}{locationPath}/{id}` where `host = locationHost || SITE_URL`.

- `locationPath` and `id` come from the submission.
- On the quote route, `locationHost` is the real request host.
- On the manual-dispatch route, `locationHost` is `null`, so it falls back to
  `SITE_URL` (`process.env.SITE_URL || "https://easyrecharge.ch"`).

Example (manual dispatch): `https://easyrecharge.ch/fr/demande-devis/be4b2093-…`

Note: `SITE_URL` already includes the scheme (`https://…`); `locationHost` does
not, so when using `locationHost` the builder prepends `https://`. The result is
always a fully-qualified `https://` URL.

## 4. `targets[].crmUrl`

Each dispatch target gains a `crmUrl` pointing to that partner's kanban in their
own language.

**Format:** `${SITE_URL}/${target.language}/partners/${dashboardToken}/leads`

- `target.language` is the partner's language (`fr` / `de`).
- `dashboardToken` is the partner's `dashboard_token`.
- If the partner has no `dashboard_token`, `crmUrl` is `null`.

**Required change to surface the token:** `dashboard_token` is already fetched in
`PARTNER_AREA_FIELDS` but is not mapped onto the target. Add
`dashboardToken: string | null` to the `DispatchTarget` interface
(`src/lib/dispatch/types.ts`) and populate it in `toTarget`
(`src/lib/dispatch/resolver.ts`) from `area.partner.dashboard_token`. The
payload builder then derives `crmUrl` from `dashboardToken` + `language`.

Security note: `dashboard_token` is the partner dashboard credential. It is
already destined for the partner (the CRM link *is* the token), and the webhook
target is a trusted Make endpoint, so exposing it here is acceptable. It is not
added to any customer-facing field.

## Where each field lives

```jsonc
{
  "submission": {
    // ...existing...
    "ref": "P / MIRRAZAVI / 1110 Morges / 2026-07-12",
    "request_url": "https://easyrecharge.ch/fr/demande-devis/be4b2093-…"
  },
  "dispatch": {
    "targets": [
      {
        // ...existing...
        "dashboardToken": "…uuid…",
        "crmUrl": "https://easyrecharge.ch/fr/partners/…uuid…/leads"
      }
    ]
  }
}
```

## Modules touched

- `src/lib/dispatch/webhook.ts` — `parsePhone` default; `buildQuoteRef` helper;
  add `ref` + `request_url` to the `submission` block; map `crmUrl` onto each
  target in `buildQuoteWebhookPayload`; extend `QuoteWebhookParts.submission`
  with `locationPath`/`id` (already present) — no new inputs needed beyond what
  parts already carry. Reads `SITE_URL` from env.
- `src/lib/dispatch/types.ts` — add `dashboardToken: string | null` to
  `DispatchTarget`.
- `src/lib/dispatch/resolver.ts` — populate `dashboardToken` in `toTarget`.
- No change to `src/app/api/quote/route.ts` or the admin dispatch route beyond
  what the builder already receives (both pass `dispatch: dispatchResult`, whose
  targets now carry `dashboardToken`).

## Error handling

- `buildQuoteRef` never throws; missing fields → empty segments.
- `request_url` falls back to `SITE_URL` when `locationHost` is null.
- `crmUrl` is `null` when `dashboardToken` is null.

## Testing

Repo has no test framework; verify with `npx tsc --noEmit` + `npx eslint`, then
exercise against production with a manual dispatch of a test-email submission
(safe: `skipped_test`, empty targets — so `crmUrl` won't appear, but `ref` and
`request_url` and the parsed phone will) and inspect the payload. For a target
with `crmUrl`, verify via a controlled real dispatch on staging or by reading a
prior `dispatched` payload.

## Rollout

Backend-only, additive fields. No consumer breaks. Deploy via the standard
staging→main flow.
