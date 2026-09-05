# easyRecharge MCP Server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server exposing easyRecharge's CMS, forms, and admin data to LLM clients (Claude.ai, Claude Desktop, Claude Code, or any MCP-compatible client).

- **Endpoint:** `https://www.easyrecharge.ch/api/mcp` — the **`www` host is mandatory**.
  The apex domain 307-redirects to `www`, and HTTP clients drop the `Authorization`
  header on cross-origin redirects, so a connector configured with the apex URL
  completes OAuth but then gets 401 on every MCP call.
- **Transport:** streamable HTTP (via [`mcp-handler`](https://www.npmjs.com/package/mcp-handler))
- **Implementation:** `src/app/api/[transport]/route.ts` + `src/lib/mcp/`

## 1. What it is

The server registers 33 tools across six groups:

| Group | File | Tools |
|---|---|---|
| CMS content | `src/lib/mcp/tools/cms.ts` | `list_blog_posts`, `get_blog_post`, `list_vehicles`, `get_vehicle`, `list_vehicle_brands`, `list_pages`, `list_form_submissions`, `search_localities`, `get_locality_subsidies` |
| App / misc | `src/lib/mcp/tools/app.ts` | `get_form_submission`, `list_site_urls`, `get_api_docs` |
| Form submission (writes) | `src/lib/mcp/tools/forms.ts` | `submit_quote`, `submit_contact`, `submit_mini_quote` |
| Admin / billing | `src/lib/mcp/tools/admin.ts` | `get_billing`, `reconcile_billing`, `dispatch_submission`, `list_dispatches` |
| Partner invoicing | `src/lib/mcp/tools/invoicing.ts` | `preview_invoice`, `issue_invoice`, `generate_invoice_document`, `set_invoice_status`, `add_invoice_note`, `add_invoice_adjustment`, `add_invoice_manual_lead`, `list_invoices` |
| Directus generic | `src/lib/mcp/tools/directus-generic.ts` | `directus_collections`, `directus_fields`, `directus_query`, `directus_get_item`, `directus_create_item`, `directus_update_item` |

Every tool is annotated (`readOnlyHint` / `destructiveHint` / `idempotentHint`) so MCP clients can render appropriate confirmation UI. Read-only tools (`list_*`, `get_*`, `search_*`, `directus_collections|fields|query|get_item`) never mutate data. Everything else is a write:

- `submit_quote` / `submit_contact` / `submit_mini_quote` create real Directus records and (for quote/contact) fire the production webhook — real emails go out.
- `directus_create_item` / `directus_update_item` write directly to the production CMS.
- `reconcile_billing` defaults to `dryRun: true` — it only *lists* what would be locked unless called with `dryRun: false`.
- `dispatch_submission` is always live: it writes billing ledger rows and sends real partner + customer emails. It refuses to re-dispatch a submission that already has a dispatched ledger row (returns `already_dispatched` with the existing row count); `force: true` bypasses that guard.

Auth is one of:
- **Google SSO** (OAuth 2.1 + PKCE) — restricted to an email allowlist (default `yoan@easyrecharge.ch`, overridable via `MCP_ALLOWED_EMAILS`).
- **Static bearer token** (`MCP_STATIC_TOKEN`) — same access as OAuth, meant for CLI/CI use (e.g. Claude Code) and for preview deployments where the OAuth redirect URIs aren't registered.

OAuth endpoints: the authorization server lives at `/api/mcp-auth/{register,authorize,callback,token}`; discovery metadata is served at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` (plus the RFC 9728 path-suffix variant `/.well-known/oauth-protected-resource/api/mcp`, which some clients query).

## 2. Google OAuth client setup (one-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**.
2. **Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. **Authorized redirect URIs** — add both. Use the **`www`** host: the site
   canonicalizes `easyrecharge.ch` → `www.easyrecharge.ch`, so the server always
   tells Google the callback is on `www`. Registering the apex (non-`www`) URL
   causes `Error 400: redirect_uri_mismatch`.
   - `https://www.easyrecharge.ch/api/mcp-auth/callback`
   - `http://localhost:3000/api/mcp-auth/callback`
5. Create, then copy the **Client ID** and **Client secret** — these become `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` below.

Preview deployments (Vercel PR/branch URLs) are **not** in the redirect URI list, so the Google OAuth flow won't work there — use the static token against preview URLs instead.

## 3. Environment variables

Set these in Vercel (**all environments** — Production, Preview, Development) and in `.env.local` for local dev:

```
GOOGLE_OAUTH_CLIENT_ID=<from Google Cloud Console>
GOOGLE_OAUTH_CLIENT_SECRET=<from Google Cloud Console>
MCP_JWT_SECRET=<generate below>
MCP_STATIC_TOKEN=<generate below>
MCP_ALLOWED_EMAILS=yoan@easyrecharge.ch
```

Generate the two secrets locally (never hand-write a secret value into any file):

```bash
openssl rand -base64 32   # → MCP_JWT_SECRET
openssl rand -base64 32   # → MCP_STATIC_TOKEN
```

Notes:
- `MCP_JWT_SECRET` signs and verifies every OAuth token (auth codes, access tokens, refresh tokens, dynamic-client-registration IDs) via HS256. There is no server-side token store — **rotating this secret is how you revoke all outstanding tokens** (see §6).
- `MCP_STATIC_TOKEN` must be at least 16 characters; `openssl rand -base64 32` easily clears that.
- `MCP_ALLOWED_EMAILS` is a comma-separated list. Defaults to `yoan@easyrecharge.ch` if unset.

## 4. Connect claude.ai / Claude Desktop (Google SSO)

1. **Settings → Connectors → Add custom connector**.
2. URL: `https://www.easyrecharge.ch/api/mcp`
3. Claude opens the OAuth flow → redirects to Google → sign in with an allowlisted Google account (`yoan@easyrecharge.ch` by default).
4. After consent, Claude receives an access token (30-day expiry) and refresh token (90-day expiry) and the connector goes green.

## 5. Connect Claude Code (static token)

```bash
claude mcp add --transport http easyrecharge https://www.easyrecharge.ch/api/mcp \
  --header "Authorization: Bearer $MCP_STATIC_TOKEN"
```

Export `MCP_STATIC_TOKEN` in your shell first (from your password manager / Vercel env — never commit it).

## 6. Security model & caveats

- **Single-user allowlist.** OAuth SSO only grants access to emails in `MCP_ALLOWED_EMAILS`. Anyone who can sign in with an allowlisted Google account gets full tool access, including writes.
- **Stateless JWTs, no revocation list.** Access tokens live 30 days, refresh tokens 90 days. There's no server-side session store, so the only way to invalidate an outstanding token before expiry is to **rotate `MCP_JWT_SECRET`** — this immediately invalidates *every* issued token (access, refresh, and any in-flight auth codes/state), forcing all clients to re-authenticate.
- **Auth codes are short-lived but not replay-tracked.** Authorization codes expire after 5 minutes (standard OAuth code flow) but the server doesn't track single-use consumption beyond expiry — treat the 5-minute window as the only protection.
- **The static token is equivalent to the Directus admin token.** It bypasses the Google allowlist entirely and grants the same full read/write tool access as OAuth. Store and rotate it with the same care as `DIRECTUS_STATIC_TOKEN`.
- **`reconcile_billing` defaults to `dryRun: true`.** Always inspect the dry-run output before calling it with `dryRun: false` — that locks billing rows irreversibly.
- **`dispatch_submission` has no dry-run.** It always sends real partner/customer emails and writes billing ledger rows when called. Its duplicate guard refuses submissions that already have a dispatched ledger row (`already_dispatched`) — but **`force: true` bypasses the guard and risks DOUBLE-billing and DOUBLE partner/customer emails**. Only use `force` deliberately, after checking `list_dispatches` for the submission to understand why a dispatched row already exists.
- **Preview deployments work with the static token only** — the Google OAuth redirect URIs are fixed to production (`https://www.easyrecharge.ch/...`) and localhost, so PR/branch preview URLs can't complete the Google flow.

## 7. Smoke test

With `npm run dev` running locally:

```bash
MCP_STATIC_TOKEN="$(grep '^MCP_STATIC_TOKEN=' .env.local | cut -d= -f2-)" node scripts/mcp-smoke.mjs
```

Note the `cut -d= -f2-` (not `-f2`) — `openssl rand -base64` output can contain `=` padding, and `-f2` would silently truncate it at the first `=`.

The script (`scripts/mcp-smoke.mjs`):
1. Asserts an unauthenticated request gets `401`.
2. Runs `initialize` + `notifications/initialized`.
3. Runs `tools/list` and checks the expected tool names are present.
4. Calls the read-only `list_pages` tool and checks it returns data.

To run it against a deployed environment instead of local dev, set `MCP_URL`:

```bash
MCP_URL=https://www.easyrecharge.ch/api/mcp MCP_STATIC_TOKEN="..." node scripts/mcp-smoke.mjs
```
