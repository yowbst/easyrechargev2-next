# MCP Server for easyRecharge — Design

**Date:** 2026-07-16
**Status:** Approved by Yoan (auth scheme, tool scope, and allowlist confirmed)

## Goal

Expose all easyRecharge app data — app API endpoints and the full Directus CMS — as a
remote MCP server, so Claude (claude.ai custom connector, Claude Desktop, Claude Code)
can read and manipulate it. Single authorized human: `yoan@easyrecharge.ch`.

## Non-goals

- Multi-user access, roles, or scopes beyond the single allowlisted account
- Exposing infrastructure endpoints as tools (`/api/sitemap-index`, `/api/gone`,
  binary asset proxy, `/api/datamanager-token`)
- SSE transport resumability (no Redis; streamable HTTP only)

## Architecture

Everything lives in this repo and deploys with the existing Vercel pipeline.

```
src/app/api/[transport]/route.ts        MCP endpoint (URL: /api/mcp), mcp-handler
src/app/api/mcp-auth/register/route.ts  OAuth 2.1 dynamic client registration
src/app/api/mcp-auth/authorize/route.ts OAuth authorize → redirect to Google
src/app/api/mcp-auth/callback/route.ts  Google callback → verify email → issue code
src/app/api/mcp-auth/token/route.ts     Code/refresh exchange → JWT access token
src/app/.well-known/oauth-authorization-server/route.ts   AS metadata
src/app/.well-known/oauth-protected-resource/route.ts     PR metadata (RFC 9728)
src/lib/mcp/auth.ts                     JWT sign/verify, allowlist, static token check
src/lib/mcp/tools/*.ts                  Tool implementations, grouped by domain
```

- New dependency: `mcp-handler` (brings `@modelcontextprotocol/sdk`). Zod is already
  present.
- `createMcpHandler` registers tools; `withMcpAuth(handler, verifyToken, { required:
  true, resourceMetadataPath: "/.well-known/oauth-protected-resource" })` gates it.
- Next.js gives static API segments precedence, so `/api/quote` etc. are unaffected by
  the `[transport]` dynamic segment.
- Tools call existing lib functions directly (`directus-queries.ts`,
  `directus-storage.ts`, `lib/dispatch`, `lib/localities.ts`) — no HTTP round-trips to
  our own API. Where an endpoint's logic lives inline in its route handler (e.g. admin
  billing), extract the core into a lib function the route and the tool both call.

## Authentication

Two accepted credential types, checked by one `verifyToken` function:

**1. OAuth 2.1 with Google as identity provider** (for claude.ai / Claude Desktop
custom connectors). claude.ai requires dynamic client registration + PKCE; Google
supports neither DCR nor our redirect URIs, so the app is its own minimal
authorization server and delegates only *authentication* to Google:

1. `POST /api/mcp-auth/register` — accepts any registration, returns a **stateless
   client_id**: base64url of `{ redirect_uris }` + HMAC signature. Nothing stored.
2. `GET /api/mcp-auth/authorize` — validates client_id signature, exact-matches
   `redirect_uri` against those baked into the client_id, requires PKCE (S256).
   Packs the OAuth request (client_id, redirect_uri, code_challenge, state) into a
   signed `state` param and redirects to Google's auth endpoint
   (`accounts.google.com`, scope `openid email`).
3. `GET /api/mcp-auth/callback` — exchanges the Google code, verifies the ID token,
   and **rejects any email ≠ `yoan@easyrecharge.ch` (or not email_verified)** with a
   plain 403 page. On success issues an authorization code: a 5-minute JWT carrying
   `{ email, client_id, redirect_uri, code_challenge }`, and redirects back to the
   client's redirect_uri.
4. `POST /api/mcp-auth/token` — verifies the code JWT, checks the PKCE
   `code_verifier` against the embedded challenge, checks redirect_uri/client_id
   match, then issues:
   - access token: JWT, 30 days, claims `{ sub: email, typ: "access" }`
   - refresh token: JWT, 90 days, `{ sub: email, typ: "refresh", client_id }`
   `grant_type=refresh_token` rotates both.

All JWTs are HS256 signed with `MCP_JWT_SECRET`. Stateless by design: this app has no
local DB, and a Directus token table would be ceremony without benefit at single-user
scale. Trade-off accepted: no server-side revocation — rotating `MCP_JWT_SECRET`
invalidates everything if needed.

**2. Static bearer token** (for Claude Code / scripts): `Authorization: Bearer
$MCP_STATIC_TOKEN`, constant-time comparison against the env var. Same spirit as the
existing `x-admin-token` convention on admin routes.

`verifyToken` returns `AuthInfo` with the email as `clientId`; anything else → 401
with `WWW-Authenticate` pointing at the protected-resource metadata, which re-triggers
the client's OAuth flow.

### Discovery metadata

- `/.well-known/oauth-authorization-server`: issuer = SITE_URL, endpoints above,
  `code_challenge_methods_supported: ["S256"]`, `grant_types: ["authorization_code",
  "refresh_token"]`.
- `/.well-known/oauth-protected-resource`: resource = `${SITE_URL}/api/mcp`,
  `authorization_servers: [SITE_URL]`.

### Environment variables (new)

| Var | Purpose |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client ("Web application", redirect URI `${SITE_URL}/api/mcp-auth/callback`, plus localhost variant for dev) |
| `MCP_JWT_SECRET` | HMAC key for client_ids, codes, tokens (32+ random bytes) |
| `MCP_STATIC_TOKEN` | Static bearer for CLI use (32+ random bytes) |
| `MCP_ALLOWED_EMAILS` | Comma-separated allowlist, default `yoan@easyrecharge.ch` |

## Tools (~25)

All tools return JSON text content. Environment-scoped data (form submissions,
dispatches, partners) is filtered by the current `environment` the same way the
routes already do.

### App data (read)
| Tool | Backing code |
|---|---|
| `search_localities(query)` | `lib/localities.ts` (as `/api/cms/localities`) |
| `get_locality_subsidies(id)` | as `/api/cms/localities/[id]/subsidies` |
| `get_form_submission(id)` | as `/api/form-submissions/[id]` |
| `list_site_urls(type?)` | as `/api/debug/urls` |
| `get_api_docs()` | as `/api/docs` (OpenAPI spec) |

### Forms (write)
| Tool | Backing code |
|---|---|
| `submit_quote(data)` | `/api/quote` logic (session → user → submission → webhook) |
| `submit_contact(data)` | `/api/contact` logic |
| `submit_mini_quote(data)` | `/api/mini-quote` logic |

### Admin
| Tool | Backing code |
|---|---|
| `get_billing(month)` | `/api/admin/billing` logic |
| `reconcile_billing(month)` | `/api/admin/reconcile-billing` logic |
| `dispatch_submission(submissionId)` | `/api/admin/dispatch/[submissionId]` logic |
| `list_dispatches(filters?)` | `/api/debug/dispatches` logic |

Admin tools do NOT require the `x-admin-token` header — MCP auth already proves the
caller is Yoan; the tools call the extracted lib functions directly.

### CMS curated (read)
`list_blog_posts(locale)`, `get_blog_post(slug, locale)`, `list_vehicles(locale)`,
`get_vehicle(slug, locale)`, `list_vehicle_brands(locale)`, `list_pages()`,
`list_form_submissions(filters?, limit?)` — thin wrappers over
`directus-queries.ts` / `directus-storage.ts`.

### Directus generic (read + write, the escape hatch)
| Tool | Notes |
|---|---|
| `directus_collections()` | List collections (schema discovery) |
| `directus_fields(collection)` | List a collection's fields |
| `directus_query(collection, filter?, fields?, sort?, limit?, offset?, search?)` | Proxies `GET /items/{collection}` |
| `directus_get_item(collection, id, fields?)` | `GET /items/{collection}/{id}` |
| `directus_create_item(collection, data)` | `POST` — annotated destructive |
| `directus_update_item(collection, id, data)` | `PATCH` — annotated destructive |

No generic delete tool (YAGNI; deletion can go through Directus admin UI — add later
if wanted). Generic tools use `directusFetch` with `revalidate: 0` so reads are live,
never ISR-stale.

## Error handling

- Tool handlers wrap their body in a catch-all: failures return
  `{ isError: true }` content with a structured message (Directus error text passed
  through, plus a hint — e.g. unknown collection → "call directus_collections").
- Zod input schemas validate arguments at the protocol layer (mcp-handler does this).
- Auth: invalid/expired token → 401 + `WWW-Authenticate`; wrong Google account → 403
  page in the browser flow with the offending email named.
- OAuth endpoint errors follow RFC 6749 (`error=invalid_grant` etc.) so claude.ai's
  client surfaces something sensible.

## Testing

1. Unit tests with vitest (new dev dependency + `npm test` script; the repo has no
   test runner yet): JWT round-trip (sign/verify/expiry/typ confusion), PKCE
   verification, allowlist rejection, client_id tamper rejection, static token
   constant-time check.
2. Smoke script (`scripts/mcp-smoke.mjs`): initialize + tools/list + one read tool
   call against `npm run dev` using `MCP_STATIC_TOKEN`.
3. Manual E2E after deploy: `claude mcp add --transport http easyrecharge
   https://easyrecharge.ch/api/mcp --header "Authorization: Bearer …"`, then the
   claude.ai custom-connector OAuth flow with the Google account.

## Rollout

1. Implement + smoke locally.
2. Create the Google OAuth client (documented steps for Yoan), set the 4 env vars in
   Vercel (all environments) and `.env.local`.
3. Push `staging` → verify against the preview URL with the static token.
4. Merge to `main` → connect claude.ai custom connector against production.
