# Data Manager Token Endpoint — Design

**Date:** 2026-07-12
**Status:** Approved (pending spec review)

## Goal

Expose `GET /api/datamanager-token`: a token-gated endpoint that mints a
short-lived Google `datamanager`-scoped OAuth access token from a service
account. It lets the Make scenario `Bearer`-authenticate the Data Manager API
`events:ingest` call **without** doing JWT signing in Make (which Make can't do
cleanly with a service-account key).

Context: this is the auth half of the Google Ads offline-conversion migration
(Upload Click Conversion Service → Data Manager API). Make orchestrates the
ingest call; this endpoint only supplies the token.

## Non-goals

- No ingest call here — the actual `events:ingest` POST stays in Make.
- No Google Cloud / Google Ads account setup — enabling the Data Manager API,
  creating the service account, and granting it Google Ads write access are
  one-time manual prerequisites, not code.
- No token persistence/caching layer of our own — `google-auth-library` caches
  and refreshes internally.

## Endpoint contract

```
GET /api/datamanager-token
Header: x-datamanager-secret: <DATAMANAGER_ENDPOINT_SECRET>
```

| Status | When | Body |
|---|---|---|
| `401` | missing/wrong `x-datamanager-secret` | `{ "error": "unauthorized" }` |
| `500` | SA creds missing/invalid, or token mint fails | `{ "error": "<message>" }` |
| `200` | token minted | `{ "access_token": "<token>", "expires_at": "<ISO 8601>" }` |

- Response carries `Cache-Control: no-store`.
- Route pinned to the **Node.js runtime** (`google-auth-library` is not
  edge-compatible) via `export const runtime = "nodejs"`, and
  `export const dynamic = "force-dynamic"` so Next never caches it.

## How it works

- A **module-level** `GoogleAuth` client (created once per warm instance):
  ```ts
  const auth = new GoogleAuth({
    credentials: JSON.parse(process.env.DATAMANAGER_SA_JSON!),
    scopes: ["https://www.googleapis.com/auth/datamanager"],
  });
  ```
- Per request: `const client = await auth.getClient(); const { token } = await client.getAccessToken();`
  The library caches the token and auto-refreshes when it nears expiry, so
  per-lead calls are cheap (no network round-trip while a valid token is
  cached).
- `expires_at` = ISO string from `client.credentials.expiry_date` (ms epoch);
  if unavailable, omit or set null.
- Creating the client is wrapped so a missing/invalid `DATAMANAGER_SA_JSON`
  surfaces as a `500` with a clear message rather than crashing the module.

## Auth

- Gated by a **dedicated** secret `DATAMANAGER_ENDPOINT_SECRET` (distinct from
  `DIRECTUS_STATIC_TOKEN`). Least privilege: this endpoint mints Google Ads
  write-capable tokens, a separate trust boundary; a leak is rotated
  independently.
- Constant-string header compare (`header !== process.env.DATAMANAGER_ENDPOINT_SECRET`),
  matching the existing admin-endpoint pattern.

## Config

- **New dependency:** `google-auth-library`.
- **New env vars** (Vercel Production + `.env.local`):
  - `DATAMANAGER_SA_JSON` — the full service-account JSON (single-line string).
  - `DATAMANAGER_ENDPOINT_SECRET` — random secret shared with Make.

## Make usage (documentation, not code)

1. HTTP `GET /api/datamanager-token` with the `x-datamanager-secret` header.
2. Read `access_token`; use as `Authorization: Bearer <token>` on the
   `POST https://datamanager.googleapis.com/v1/events:ingest` call.
3. Optionally cache the token in Make until `expires_at` minus ~60s to avoid
   re-fetching every run.

## Error handling

- Missing/invalid secret → `401`, no token minting attempted.
- `DATAMANAGER_SA_JSON` absent or unparseable → `500` with a clear error; logged
  via `serverLog`.
- `getAccessToken()` failure (e.g. SA lacks access, API not enabled) → `500`
  with the underlying error message; logged.
- Never log the token itself or the raw SA private key.

## Testing

Repo has no test framework. Verify with `npx tsc --noEmit` + `npx eslint`, then:
- `curl` with the correct secret → expect `200 { access_token, expires_at }`.
- `curl` with a wrong/missing secret → expect `401`.
- End-to-end: use the returned token to call `events:ingest` with
  `"validateOnly": true` — a `200 { requestId }` confirms the token is valid and
  scoped correctly.

## Rollout

- Add the two env vars in Vercel before deploying (or the endpoint returns `500`
  until they exist — harmless, no other route depends on it).
- Additive, isolated new route. Deploy via the standard staging→main flow.
