# Manual Dispatch Endpoint — Design

**Date:** 2026-07-12
**Status:** Approved (pending spec review)

## Goal

Allow an operator to take an existing form submission that was **not** dispatched
(submitted while `DISPATCH_MODE` was `off`, or that resolved to
`no_partner_for_canton` / `skipped_dedup` / a failed dispatch) and dispatch it
manually by calling an admin endpoint. A manual dispatch behaves like a real
quote-time dispatch: it resolves partner targets, writes the `partner_dispatches`
ledger, and fires the Make webhook.

## Non-goals

- No UI. This is a token-guarded API endpoint only.
- No bulk / batch dispatch. One submission per call.
- No change to how the quote route resolves or dispatches. The quote path keeps
  its current behavior; we only extract shared webhook code from it.

## Endpoint

```
POST /api/admin/dispatch/[submissionId]?force=1
Header: x-admin-token: <DIRECTUS_STATIC_TOKEN>
```

- Auth: `x-admin-token` header must equal `process.env.DIRECTUS_STATIC_TOKEN`
  (same gate as `/api/admin/reconcile-billing` and `/api/admin/billing`).
- `?force=1` (optional): bypass the already-dispatched guard.

### Responses

| Status | When | Body |
|---|---|---|
| `401` | missing/wrong `x-admin-token` | `{ error: "unauthorized" }` |
| `404` | submission id not found | `{ error: "not_found" }` |
| `409` | submission already has a `dispatched` ledger row, and `?force=1` not set | `{ error: "already_dispatched", existing: <count> }` |
| `200` | dispatch ran (including the "nothing to dispatch" outcome) | see below |

`200` body:

```jsonc
{
  "ok": true,
  "submissionId": "<uuid>",
  "mode": "live",
  "isTest": false,
  "targetCount": 1,
  "webhookFired": true,
  "dispatch": { /* full DispatchResult */ }
}
```

## Flow

1. **Auth.** Reject with `401` unless `x-admin-token` matches.
2. **Load.** `storage.getSubmissionById(submissionId)` → `{ submission, user, session }`.
   `404` if null.
3. **Guard.** Query `partner_dispatches` filtered to this submission with
   `status = dispatched`, `limit = 1`. If a row exists and `?force=1` is not set,
   return `409`. Rows with `skipped_test` / `skipped_dedup` /
   `no_partner_for_canton` do **not** block — those submissions were processed but
   not dispatched, which is the target case.
4. **Reconstruct `runDispatch` inputs** from stored records:
   - `submissionId`
   - `rawCanton = submission.data.canton`
   - `email = user?.email ?? null`
   - `locale = user?.language === "de" ? "de" : "fr"`
   - `leadCategory = deriveLeadCategory(submission.data)`
   - `product = "ecp"` (the only product today; `form_submissions` stores no
     product field, matching the quote route which hardcodes `"ecp"`)
   - `modeOverride = "live"`
5. **Dispatch.** Call `runDispatch(...)`. Resolves targets, writes the ledger.
   Honors test-email suppression: a test-pattern email resolves to `skipped_test`
   with empty targets (no partner email, no billing).
6. **Fire webhook — always.** Build the quote webhook payload from the stored
   records + `DispatchResult` and POST it to the configured Make quote webhook.
   The webhook fires on every call regardless of `targetCount`, because it also
   drives the **customer confirmation email** — the customer must be emailed even
   when no partner is available. Wrapped in try/catch: on failure, return `200`
   with `webhookFired: false` and the error (the ledger is already written; don't
   fail the whole call).
7. **Respond** with the outcome JSON.

Missing canton → `runDispatch` returns `unknown_canton`, empty targets → `200`
with `targetCount: 0` (valid "nothing to dispatch" outcome; the webhook still
fires for the customer email).

## Webhook payload — `trigger` marker

Both routes send the same payload shape. A `trigger` field on `submission`
identifies the source so Make can branch (e.g. skip the customer confirmation
email on a manual dispatch while still notifying the partner):

| Source | `submission.trigger` |
|---|---|
| Quote route (customer submits) | `"quote_submission"` |
| Admin endpoint (operator invokes) | `"manual_dispatch"` |

The value describes the **source**, not dispatch history — it is the same answer
whether it is the submission's first or Nth dispatch. Make may ignore the field
entirely, in which case a manual dispatch behaves exactly like a fresh
submission.

## Reconstructed-payload caveat

A manually dispatched submission has no live HTTP request, so the payload is
rebuilt from stored `submission` / `user` / `session` records and is **thinner**
than a quote-time payload:

- `attribution` — empty `{}` (no cookie/query attribution available after the fact).
- `posthog.distinctId` — from `session.ph_distinct_id` if stored, else null.
- `session.userAgent` / `session.ip` — only as captured on the original session
  record.
- `phone` — from `user.phone`, re-parsed with the existing `parsePhone` helper.

Make branches that read these fields must tolerate nulls.

## Modules

- **New** `src/app/api/admin/dispatch/[submissionId]/route.ts` — auth, guard,
  input reconstruction, orchestration, response.
- **Modified** `src/lib/dispatch/index.ts` — add optional
  `modeOverride?: DispatchMode` to `RunDispatchInput`; change
  `const mode = getDispatchMode()` to `const mode = input.modeOverride ?? getDispatchMode()`.
  No behavior change for the quote route (it never passes the field).
- **New** `src/lib/dispatch/webhook.ts` — shared webhook code extracted from the
  quote route:
  - `getQuoteWebhookUrl(): Promise<string | null>`
  - `buildQuoteWebhookPayload(input): WebhookPayload` — takes a normalized input
    object that both callers produce (quote route from the live request; admin
    route from stored records). Adds the `trigger` field.
  - `fireQuoteWebhook(url, payload): Promise<{ ok: boolean; status?: number; error?: string }>`
- **Modified** `src/app/api/quote/route.ts` — refactored to call the shared
  webhook helpers, passing `trigger: "quote_submission"`. Output payload shape
  must remain identical to today's aside from the new `trigger` field.

## Error handling

- `runDispatch` never throws (it catches internally and returns an empty result).
- Webhook delivery is wrapped in try/catch; a failure returns `200` with
  `webhookFired: false`, and is logged via `serverLog` (matches the quote route's
  existing webhook error handling).
- Directus load / guard-query failures surface as `500` with a logged error.

## Testing

- Unit-test the pure pieces: input reconstruction (`deriveLeadCategory` over
  stored `data`, locale mapping, product default) and the guard decision
  (`dispatched` row present/absent × `force`).
- Verify the refactored quote-webhook payload is identical to the current output
  (snapshot the payload object before/after the extraction; only `trigger` is
  added).
- End-to-end: `curl` the endpoint against **staging** for three cases —
  (a) a not-dispatched submission with a real email → `dispatched`, webhook fired;
  (b) a test-email submission → `skipped_test`, empty targets, webhook still fired;
  (c) an already-dispatched submission → `409`, and `?force=1` → dispatches.

## Security

- Token-guarded (`x-admin-token`), same as the other admin endpoints.
- Route lives under `/api/admin/*`; ensure it is not indexed or linked.
- `force=1` is the only destructive-ish path (can double-dispatch / double-email);
  it is opt-in and logged.
