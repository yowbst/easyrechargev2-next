# Data Manager Token Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/datamanager-token` that mints a `datamanager`-scoped Google access token from a service account, so Make can Bearer-auth the Data Manager `events:ingest` call without JWT signing.

**Architecture:** One Node-runtime route handler using `google-auth-library`. A module-level `GoogleAuth` client (created lazily, cached per warm instance; the library refreshes the token internally) returns a fresh access token + expiry. Gated by a dedicated `x-datamanager-secret` header.

**Tech Stack:** Next.js 16 App Router route handler, TypeScript, `google-auth-library` (new dependency).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-datamanager-token-endpoint-design.md`.
- Repo has NO test framework. Verify with `npx tsc --noEmit` + `npx eslint <files>`; runtime `curl` checks (401, and the 200 path once the service account exists) are done by the controller after deploy + env setup.
- Auth gate: header `x-datamanager-secret` must equal `process.env.DATAMANAGER_ENDPOINT_SECRET`; else `401 { error: "unauthorized" }`.
- OAuth scope EXACT: `https://www.googleapis.com/auth/datamanager`.
- SA credentials come from `process.env.DATAMANAGER_SA_JSON` (full service-account JSON string).
- Route pinned to Node runtime (`export const runtime = "nodejs"`) and `export const dynamic = "force-dynamic"`; success response carries `Cache-Control: no-store`.
- Never log the token or the SA private key.
- Additive, isolated. Deploy via staging→main flow after both tasks pass.

---

### Task 1: Token endpoint + dependency

**Files:**
- Modify: `package.json` + `package-lock.json` (add `google-auth-library`)
- Create: `src/app/api/datamanager-token/route.ts`

**Interfaces:**
- Produces the HTTP endpoint. No exported symbols consumed elsewhere.

- [ ] **Step 1: Install the dependency**

Run from repo root `/Users/yoanbasset/Code/easyrechargev2-next`:
```bash
npm install google-auth-library
```
Expected: `package.json` gains `google-auth-library` under dependencies; `package-lock.json` updated; no errors.

- [ ] **Step 2: Create the route**

Create `src/app/api/datamanager-token/route.ts`:

```ts
import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { serverLog } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATAMANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager";

// Lazily-created, cached per warm instance. google-auth-library caches the
// access token and refreshes it internally, so per-request calls are cheap.
let auth: GoogleAuth | null = null;
function getAuth(): GoogleAuth {
  if (auth) return auth;
  const raw = process.env.DATAMANAGER_SA_JSON;
  if (!raw) throw new Error("DATAMANAGER_SA_JSON is not set");
  auth = new GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: [DATAMANAGER_SCOPE],
  });
  return auth;
}

/**
 * Mints a short-lived datamanager-scoped access token for Make to Bearer-auth
 * the Data Manager events:ingest call. Gated by DATAMANAGER_ENDPOINT_SECRET.
 *
 *   curl -H "x-datamanager-secret: $DATAMANAGER_ENDPOINT_SECRET" \
 *     "https://easyrecharge.ch/api/datamanager-token"
 */
export async function GET(req: Request) {
  const secret = process.env.DATAMANAGER_ENDPOINT_SECRET;
  const header = req.headers.get("x-datamanager-secret");
  if (!secret || header !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const client = await getAuth().getClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("no access token returned");
    const expiryMs = client.credentials?.expiry_date ?? null;
    const expires_at =
      typeof expiryMs === "number" ? new Date(expiryMs).toISOString() : null;
    return NextResponse.json(
      { access_token: token, expires_at },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    serverLog("ERROR", "datamanager-token mint failed", {
      route: "datamanager-token",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/api/datamanager-token/route.ts"`
Expected: no errors. If `client.credentials` is flagged because `getClient()` returns a union type, narrow it — replace the expiry line with:
```ts
    const creds = (client as { credentials?: { expiry_date?: number | null } }).credentials;
    const expiryMs = creds?.expiry_date ?? null;
```

- [ ] **Step 4: Local sanity — the 401 path (no creds needed)**

The 401 path needs no service account. Start the dev server and confirm the guard:
```bash
npm run dev   # in one shell
# in another:
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/datamanager-token"                              # expect 401
curl -s -o /dev/null -w "%{http_code}\n" -H "x-datamanager-secret: wrong" "http://localhost:3000/api/datamanager-token"  # expect 401
```
Expected: both `401`. (The 200 path requires a real service account + env vars and is verified by the controller after deploy — do not block on it here.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json "src/app/api/datamanager-token/route.ts"
git commit -m "feat(datamanager): token endpoint for Make (service-account access token)"
```

---

### Task 2: Document the endpoint + config

**Files:**
- Modify: `docs/operations/partner-dispatch.md` (append a section)

- [ ] **Step 1: Append the operations section**

Append to `docs/operations/partner-dispatch.md`:

```markdown
## Google Ads conversions via the Data Manager API (token endpoint)

Google is moving offline click-conversion uploads off the Google Ads API to the
Data Manager API. Make can't sign the service-account JWT the Data Manager API
needs, so the app mints the token instead:

    GET /api/datamanager-token
    Header: x-datamanager-secret: <DATAMANAGER_ENDPOINT_SECRET>
    -> { "access_token": "...", "expires_at": "<ISO>" }

Make calls this once before the `events:ingest` request and uses
`access_token` as `Authorization: Bearer`. It can cache the token until
`expires_at` minus ~60s.

**Env vars** (set in Vercel Production and `.env.local`):
- `DATAMANAGER_SA_JSON` — the full service-account JSON (single-line).
- `DATAMANAGER_ENDPOINT_SECRET` — random secret shared with Make.

**One-time Google setup** (not code):
1. Enable the **Data Manager API** in a Google Cloud project.
2. Create a **service account**; download its JSON key into `DATAMANAGER_SA_JSON`.
3. In the **Google Ads UI** (Admin → Access and security), add the service
   account's `client_email` with an access level that can edit conversions.

The scope minted is `https://www.googleapis.com/auth/datamanager`. Verify the
token by calling `events:ingest` with `"validateOnly": true`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations/partner-dispatch.md
git commit -m "docs(datamanager): document token endpoint + setup"
```

---

## Self-Review

**Spec coverage:**
- `GET /api/datamanager-token`, dedicated-secret gate, 401/500/200 contract → Task 1 route. ✓
- Node runtime + `force-dynamic` + `no-store` → Task 1 route directives/headers. ✓
- Module-level `GoogleAuth`, scope, `DATAMANAGER_SA_JSON` creds, `expires_at` from `expiry_date` → Task 1. ✓
- Never log token/private key → Task 1 logs only the error message. ✓
- `google-auth-library` dependency → Task 1 Step 1. ✓
- Env vars + Make usage + Google setup docs → Task 2. ✓
- Testing (tsc/eslint + 401 curl; 200 deferred to real SA) → Task 1 Steps 3-4. ✓

**Placeholder scan:** No TBD/TODO. The `<ISO>` / `<DATAMANAGER_ENDPOINT_SECRET>` in docs are runtime values, not code placeholders.

**Type consistency:** `DATAMANAGER_SCOPE` constant, `getAuth()` → `GoogleAuth`, `getClient()` → `getAccessToken()` returning `{ token }`, and `client.credentials.expiry_date` used consistently; Step 3 provides the exact narrowing fallback if the union type complains.
