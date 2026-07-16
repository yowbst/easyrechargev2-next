# easyRecharge MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A remote MCP server at `/api/mcp` inside this Next.js app, exposing all app API endpoints and full Directus CMS read/write, gated by Google SSO OAuth (allowlist `yoan@easyrecharge.ch`) plus a static bearer token fallback.

**Architecture:** `mcp-handler` route at `src/app/api/[transport]/route.ts` wrapped in `withMcpAuth`; a minimal stateless OAuth 2.1 authorization server under `/api/mcp-auth/*` that delegates identity to Google (using the already-installed `google-auth-library`); all tokens are HS256 JWTs signed with `MCP_JWT_SECRET` (no DB). Tools call existing lib functions directly; inline route logic is first extracted into lib functions shared by route and tool. The three form-submission tools call our own public HTTP endpoints instead (their orchestration is 170 lines of inline side effects — HTTP preserves behavior exactly).

**Tech Stack:** Next.js 16.2.1 (App Router, `src/` dir), TypeScript 5 strict, zod ^4.3.6, `mcp-handler` (new), `google-auth-library` ^10.9.0 (already installed), vitest (new dev dep), Directus REST via `directusFetch`.

**Spec:** `docs/superpowers/specs/2026-07-16-mcp-server-design.md`

## Global Constraints

- Path aliases: `@/*` → `./src/*`, `@shared/*` → `./src/shared/*`. The repo uses `src/`.
- zod is **v4** (`^4.3.6`) — v4 API only. If `mcp-handler` peer-requires zod v3, see Task 1 Step 2 contingency.
- Middleware lives at `src/proxy.ts` (NOT `middleware.ts`). Do not modify it — it already passes `/api/*` and `/.well-known/*` through.
- Existing route behavior must be preserved byte-for-byte when extracting logic (same status codes, same JSON shapes, same error semantics — e.g. the subsidies route returns `{ hasChargingSubsidy: false }` with HTTP 200 on ANY error).
- Never print or commit secret values (`MCP_JWT_SECRET`, `MCP_STATIC_TOKEN`, `DIRECTUS_STATIC_TOKEN`, Google client secret). `.env.local` is gitignored — verify before any commit that no secret appears in staged files.
- Allowlist default is exactly `yoan@easyrecharge.ch` (overridable via `MCP_ALLOWED_EMAILS`, comma-separated).
- Token lifetimes: authorization code 5 min, OAuth state 10 min, access token 30 days, refresh token 90 days.
- All new tool outputs are JSON text content. Errors return `isError: true` content, never throw out of a tool handler.
- Commit after each task with a conventional-commits message. Do NOT `git push` (user pushes in batches).
- Run `npm run lint` before each commit.

---

### Task 1: Tooling — dependencies, vitest, local secrets

**Files:**
- Modify: `package.json` (deps + `test` script)
- Create: `vitest.config.ts`
- Create: `src/lib/mcp/sanity.test.ts` (deleted again in Task 2)
- Modify: `.env.local` (append two generated secrets — NOT committed)

**Interfaces:**
- Produces: `npm test` runs vitest; `mcp-handler` importable; `MCP_JWT_SECRET` + `MCP_STATIC_TOKEN` set locally.

- [ ] **Step 1: Install dependencies**

```bash
npm install mcp-handler
npm install -D vitest
```

- [ ] **Step 2: Verify zod peer compatibility**

Run: `npm ls zod && node -e "console.log(require('mcp-handler/package.json').peerDependencies)"`
Expected: no `invalid`/`UNMET PEER` in `npm ls zod` output.
Contingency: if mcp-handler peer-requires zod v3 only, install anyway with `npm install mcp-handler --legacy-peer-deps`, note it in the commit message, and rely on the Task 13 smoke test to prove runtime compatibility (the SDK added zod v4 support in 2025; peer ranges sometimes lag).

- [ ] **Step 3: Add test script to package.json**

In `package.json` scripts, after `"lint": "eslint"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
});
```

- [ ] **Step 5: Write a sanity test proving alias resolution**

Create `src/lib/mcp/sanity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeName } from "@/lib/form-hygiene";

describe("vitest setup", () => {
  it("resolves @/ alias against existing code", () => {
    expect(normalizeName("jean dupont")).toBe("Jean Dupont");
  });
});
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 7: Generate local secrets (values never echoed/committed)**

```bash
printf '\n# MCP server (added 2026-07-16)\nMCP_JWT_SECRET=%s\nMCP_STATIC_TOKEN=%s\nMCP_ALLOWED_EMAILS=yoan@easyrecharge.ch\n' "$(openssl rand -base64 32 | tr -d '\n')" "$(openssl rand -base64 32 | tr -d '\n')" >> .env.local
```

Verify with `grep -c '^MCP_' .env.local` (expected: 3) — do not cat the file.

- [ ] **Step 8: Commit (package.json, package-lock.json, vitest.config.ts, sanity test only)**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/mcp/sanity.test.ts
git commit -m "chore(mcp): add mcp-handler + vitest tooling"
```

---

### Task 2: JWT module

**Files:**
- Create: `src/lib/mcp/jwt.ts`
- Create: `src/lib/mcp/jwt.test.ts`
- Delete: `src/lib/mcp/sanity.test.ts`

**Interfaces:**
- Produces: `signJwt(claims: Record<string, unknown>, secret: string, expiresInSeconds: number): string` and `verifyJwt(token: string, secret: string): JwtClaims | null` (`export type JwtClaims = Record<string, unknown> & { iat: number; exp: number }`). `verifyJwt` returns `null` for bad signature, malformed token, wrong alg, or expiry — it never throws.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/mcp/jwt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signJwt, verifyJwt } from "./jwt";

const SECRET = "test-secret-0123456789abcdef";

describe("jwt", () => {
  it("round-trips claims", () => {
    const token = signJwt({ sub: "yoan@easyrecharge.ch", typ: "access" }, SECRET, 60);
    const claims = verifyJwt(token, SECRET);
    expect(claims?.sub).toBe("yoan@easyrecharge.ch");
    expect(claims?.typ).toBe("access");
    expect(typeof claims?.exp).toBe("number");
  });

  it("rejects a tampered payload", () => {
    const token = signJwt({ sub: "a" }, SECRET, 60);
    const [h, p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "b", exp: 9999999999 })).toString("base64url");
    expect(verifyJwt(`${h}.${forged}.${s}`, SECRET)).toBeNull();
  });

  it("rejects the wrong secret", () => {
    const token = signJwt({ sub: "a" }, SECRET, 60);
    expect(verifyJwt(token, "other-secret-0123456789abcdef")).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signJwt({ sub: "a" }, SECRET, -10);
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it("rejects garbage without throwing", () => {
    expect(verifyJwt("", SECRET)).toBeNull();
    expect(verifyJwt("a.b", SECRET)).toBeNull();
    expect(verifyJwt("a.b.c", SECRET)).toBeNull();
  });

  it("rejects alg=none header swaps", () => {
    const token = signJwt({ sub: "a" }, SECRET, 60);
    const [, p, s] = token.split(".");
    const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    expect(verifyJwt(`${noneHeader}.${p}.${s}`, SECRET)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./jwt`.

- [ ] **Step 3: Implement src/lib/mcp/jwt.ts**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export type JwtClaims = Record<string, unknown> & { iat: number; exp: number };

function hmac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signJwt(
  claims: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ ...claims, iat: now, exp: now + expiresInSeconds }),
  ).toString("base64url");
  const sig = hmac(`${header}.${payload}`, secret).toString("base64url");
  return `${header}.${payload}.${sig}`;
}

export function verifyJwt(token: string, secret: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  let actual: Buffer;
  try {
    actual = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  const expected = hmac(`${header}.${payload}`, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const h = JSON.parse(Buffer.from(header, "base64url").toString());
    if (h.alg !== "HS256") return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as JwtClaims;
    if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests, delete sanity test**

Run: `npm test` — expected: all pass. Then `rm src/lib/mcp/sanity.test.ts` and run `npm test` again (still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/jwt.ts src/lib/mcp/jwt.test.ts
git rm src/lib/mcp/sanity.test.ts
git commit -m "feat(mcp): HS256 JWT sign/verify module"
```

---

### Task 3: Auth module — client_id codec, PKCE, allowlist, tokens, verifyMcpToken

**Files:**
- Create: `src/lib/mcp/auth.ts`
- Create: `src/lib/mcp/auth.test.ts`

**Interfaces:**
- Consumes: `signJwt`/`verifyJwt` from `@/lib/mcp/jwt` (Task 2).
- Produces (all from `@/lib/mcp/auth`, used by Tasks 6, 7, 13):
  - `interface McpClient { redirect_uris: string[] }`
  - `encodeClientId(client: McpClient): string` / `decodeClientId(clientId: string): McpClient | null`
  - `verifyPkceS256(verifier: string, challenge: string): boolean`
  - `isAllowedEmail(email: string | null | undefined): boolean`
  - `signState(s: { cid: string; uri: string; cch: string; st: string }): string` / `readState(raw: string): { cid: string; uri: string; cch: string; st: string } | null`
  - `issueAuthCode(c: { email: string; clientId: string; redirectUri: string; codeChallenge: string }): string` / `readAuthCode(code: string): { email: string; clientId: string; redirectUri: string; codeChallenge: string } | null`
  - `issueTokens(email: string, clientId: string): { access_token: string; token_type: "bearer"; expires_in: number; refresh_token: string; scope: "mcp" }`
  - `readRefreshToken(token: string): { email: string; clientId: string } | null`
  - `checkStaticToken(token: string): boolean`
  - `verifyMcpToken(req: Request, bearerToken?: string): Promise<AuthInfo | undefined>` (`AuthInfo` from `@modelcontextprotocol/sdk/server/auth/types.js`; `clientId` is the email, or `"static-token"`)
  - `requestBaseUrl(req: Request): string` (origin from `x-forwarded-proto`/`x-forwarded-host`/`host`, http for localhost)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/mcp/auth.test.ts`:

```ts
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.MCP_JWT_SECRET = "test-jwt-secret-0123456789abcdef";
  process.env.MCP_STATIC_TOKEN = "test-static-token-0123456789abcdef";
  delete process.env.MCP_ALLOWED_EMAILS;
});

describe("auth", () => {
  it("client_id round-trips and rejects tampering", async () => {
    const { encodeClientId, decodeClientId } = await import("./auth");
    const cid = encodeClientId({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
    expect(decodeClientId(cid)?.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
    expect(decodeClientId(cid.slice(0, -2) + "xx")).toBeNull();
    expect(decodeClientId("garbage")).toBeNull();
  });

  it("verifies PKCE S256", async () => {
    const { verifyPkceS256 } = await import("./auth");
    const verifier = "some-verifier-string-that-is-long-enough-42";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256("wrong-verifier", challenge)).toBe(false);
  });

  it("allowlists only the configured email (default yoan@easyrecharge.ch)", async () => {
    const { isAllowedEmail } = await import("./auth");
    expect(isAllowedEmail("yoan@easyrecharge.ch")).toBe(true);
    expect(isAllowedEmail("YOAN@easyrecharge.ch")).toBe(true);
    expect(isAllowedEmail("someone@easyrecharge.ch")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
  });

  it("auth code round-trips its claims", async () => {
    const { issueAuthCode, readAuthCode } = await import("./auth");
    const code = issueAuthCode({
      email: "yoan@easyrecharge.ch",
      clientId: "cid",
      redirectUri: "https://claude.ai/cb",
      codeChallenge: "cch",
    });
    expect(readAuthCode(code)).toEqual({
      email: "yoan@easyrecharge.ch",
      clientId: "cid",
      redirectUri: "https://claude.ai/cb",
      codeChallenge: "cch",
    });
  });

  it("an access token is not accepted as a refresh token (typ confusion)", async () => {
    const { issueTokens, readRefreshToken } = await import("./auth");
    const t = issueTokens("yoan@easyrecharge.ch", "cid");
    expect(readRefreshToken(t.access_token)).toBeNull();
    expect(readRefreshToken(t.refresh_token)).toEqual({ email: "yoan@easyrecharge.ch", clientId: "cid" });
  });

  it("verifyMcpToken accepts static token, OAuth access token; rejects junk and refresh tokens", async () => {
    const { verifyMcpToken, issueTokens } = await import("./auth");
    const req = new Request("http://localhost/api/mcp");
    expect(await verifyMcpToken(req, process.env.MCP_STATIC_TOKEN)).toMatchObject({ clientId: "static-token" });
    const t = issueTokens("yoan@easyrecharge.ch", "cid");
    expect(await verifyMcpToken(req, t.access_token)).toMatchObject({ clientId: "yoan@easyrecharge.ch" });
    expect(await verifyMcpToken(req, t.refresh_token)).toBeUndefined();
    expect(await verifyMcpToken(req, "nonsense")).toBeUndefined();
    expect(await verifyMcpToken(req, undefined)).toBeUndefined();
  });

  it("requestBaseUrl honors forwarded headers and localhost", async () => {
    const { requestBaseUrl } = await import("./auth");
    expect(
      requestBaseUrl(
        new Request("http://internal/api/x", {
          headers: { "x-forwarded-host": "easyrecharge.ch", "x-forwarded-proto": "https" },
        }),
      ),
    ).toBe("https://easyrecharge.ch");
    expect(requestBaseUrl(new Request("http://localhost:3000/api/x", { headers: { host: "localhost:3000" } }))).toBe(
      "http://localhost:3000",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — expected: FAIL, cannot resolve `./auth`.

- [ ] **Step 3: Implement src/lib/mcp/auth.ts**

```ts
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { signJwt, verifyJwt } from "./jwt";

const DEFAULT_ALLOWED = "yoan@easyrecharge.ch";
const ACCESS_TTL = 30 * 24 * 3600;
const REFRESH_TTL = 90 * 24 * 3600;
const CODE_TTL = 300;
const STATE_TTL = 600;

function secret(): string {
  const s = process.env.MCP_JWT_SECRET;
  if (!s) throw new Error("MCP_JWT_SECRET is not set");
  return s;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ── Stateless dynamic client registration ──────────────────────────────
export interface McpClient {
  redirect_uris: string[];
}

export function encodeClientId(client: McpClient): string {
  const body = Buffer.from(JSON.stringify({ redirect_uris: client.redirect_uris })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(`client:${body}`).digest("base64url").slice(0, 24);
  return `${body}.${sig}`;
}

export function decodeClientId(clientId: string): McpClient | null {
  const dot = clientId.lastIndexOf(".");
  if (dot < 1) return null;
  const body = clientId.slice(0, dot);
  const sig = clientId.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(`client:${body}`).digest("base64url").slice(0, 24);
  if (!safeEqual(sig, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!Array.isArray(parsed.redirect_uris) || parsed.redirect_uris.some((u: unknown) => typeof u !== "string"))
      return null;
    return { redirect_uris: parsed.redirect_uris };
  } catch {
    return null;
  }
}

// ── PKCE (S256 only) ───────────────────────────────────────────────────
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const digest = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(digest, challenge);
}

// ── Allowlist ──────────────────────────────────────────────────────────
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.MCP_ALLOWED_EMAILS || DEFAULT_ALLOWED)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

// ── OAuth state (authorize → Google → callback) ────────────────────────
export function signState(s: { cid: string; uri: string; cch: string; st: string }): string {
  return signJwt({ typ: "state", ...s }, secret(), STATE_TTL);
}

export function readState(raw: string): { cid: string; uri: string; cch: string; st: string } | null {
  const c = verifyJwt(raw, secret());
  if (!c || c.typ !== "state") return null;
  if (typeof c.cid !== "string" || typeof c.uri !== "string" || typeof c.cch !== "string" || typeof c.st !== "string")
    return null;
  return { cid: c.cid, uri: c.uri, cch: c.cch, st: c.st };
}

// ── Authorization codes ────────────────────────────────────────────────
export function issueAuthCode(c: {
  email: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}): string {
  return signJwt(
    { typ: "code", sub: c.email, cid: c.clientId, uri: c.redirectUri, cch: c.codeChallenge },
    secret(),
    CODE_TTL,
  );
}

export function readAuthCode(
  code: string,
): { email: string; clientId: string; redirectUri: string; codeChallenge: string } | null {
  const c = verifyJwt(code, secret());
  if (!c || c.typ !== "code") return null;
  if (typeof c.sub !== "string" || typeof c.cid !== "string" || typeof c.uri !== "string" || typeof c.cch !== "string")
    return null;
  return { email: c.sub, clientId: c.cid, redirectUri: c.uri, codeChallenge: c.cch };
}

// ── Access / refresh tokens ────────────────────────────────────────────
export function issueTokens(email: string, clientId: string) {
  return {
    access_token: signJwt({ typ: "access", sub: email }, secret(), ACCESS_TTL),
    token_type: "bearer" as const,
    expires_in: ACCESS_TTL,
    refresh_token: signJwt({ typ: "refresh", sub: email, cid: clientId }, secret(), REFRESH_TTL),
    scope: "mcp" as const,
  };
}

export function readRefreshToken(token: string): { email: string; clientId: string } | null {
  const c = verifyJwt(token, secret());
  if (!c || c.typ !== "refresh" || typeof c.sub !== "string" || typeof c.cid !== "string") return null;
  return { email: c.sub, clientId: c.cid };
}

// ── Static bearer fallback ─────────────────────────────────────────────
export function checkStaticToken(token: string): boolean {
  const expected = process.env.MCP_STATIC_TOKEN;
  if (!expected || expected.length < 16) return false;
  return safeEqual(token, expected);
}

// ── verifyToken for withMcpAuth ────────────────────────────────────────
export async function verifyMcpToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  if (checkStaticToken(bearerToken)) {
    return { token: bearerToken, scopes: ["mcp"], clientId: "static-token", extra: { method: "static" } };
  }
  const c = verifyJwt(bearerToken, secret());
  if (!c || c.typ !== "access" || typeof c.sub !== "string" || !isAllowedEmail(c.sub)) return undefined;
  return { token: bearerToken, scopes: ["mcp"], clientId: c.sub, extra: { method: "oauth", email: c.sub } };
}

// ── Request origin (works behind Vercel proxy and locally) ─────────────
export function requestBaseUrl(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const isLocal = host.startsWith("localhost") || host.startsWith("127.");
  const proto = req.headers.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test` — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/auth.ts src/lib/mcp/auth.test.ts
git commit -m "feat(mcp): stateless OAuth primitives + token verification"
```

---

### Task 4: Google identity helper

**Files:**
- Create: `src/lib/mcp/google.ts`
- Create: `src/lib/mcp/google.test.ts`

**Interfaces:**
- Produces: `googleAuthUrl(state: string, redirectUri: string): string`; `exchangeGoogleCode(code: string, redirectUri: string): Promise<{ email: string | null; emailVerified: boolean }>` (throws on network/exchange failure — caller maps to 502).
- Consumes: `google-auth-library` `OAuth2Client` (already installed), env `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.

- [ ] **Step 1: Write the failing test (URL builder only — the exchange hits Google and is covered by mocking in Task 7 and manually E2E)**

Create `src/lib/mcp/google.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client.apps.googleusercontent.com";
});

describe("googleAuthUrl", () => {
  it("builds the Google authorize URL with openid email scope and state", async () => {
    const { googleAuthUrl } = await import("./google");
    const url = new URL(googleAuthUrl("STATE123", "https://easyrecharge.ch/api/mcp-auth/callback"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-client.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe("https://easyrecharge.ch/api/mcp-auth/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("state")).toBe("STATE123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` — expected: FAIL, cannot resolve `./google`.

- [ ] **Step 3: Implement src/lib/mcp/google.ts**

```ts
import { OAuth2Client } from "google-auth-library";

function clientId(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not set");
  return v;
}

export function googleAuthUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<{ email: string | null; emailVerified: boolean }> {
  const client = new OAuth2Client(clientId(), process.env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) return { email: null, emailVerified: false };
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId() });
  const payload = ticket.getPayload();
  return { email: payload?.email ?? null, emailVerified: payload?.email_verified ?? false };
}
```

- [ ] **Step 4: Run tests, commit**

Run: `npm test` — all pass.

```bash
git add src/lib/mcp/google.ts src/lib/mcp/google.test.ts
git commit -m "feat(mcp): Google OAuth identity helper"
```

---

### Task 5: OAuth discovery metadata routes

**Files:**
- Create: `src/lib/mcp/metadata.ts`
- Create: `src/app/.well-known/oauth-authorization-server/route.ts`
- Create: `src/app/.well-known/oauth-protected-resource/route.ts`
- Create: `src/app/.well-known/oauth-protected-resource/api/mcp/route.ts` (RFC 9728 path-suffixed variant some clients request)
- Create: `src/lib/mcp/metadata.test.ts`

**Interfaces:**
- Consumes: `requestBaseUrl` from `@/lib/mcp/auth` (Task 3).
- Produces: `authorizationServerMetadata(base: string)` and `protectedResourceMetadata(base: string)` from `@/lib/mcp/metadata`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/metadata.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { authorizationServerMetadata, protectedResourceMetadata } from "./metadata";

describe("oauth metadata", () => {
  it("authorization server metadata points at mcp-auth endpoints", () => {
    const m = authorizationServerMetadata("https://easyrecharge.ch");
    expect(m.issuer).toBe("https://easyrecharge.ch");
    expect(m.authorization_endpoint).toBe("https://easyrecharge.ch/api/mcp-auth/authorize");
    expect(m.token_endpoint).toBe("https://easyrecharge.ch/api/mcp-auth/token");
    expect(m.registration_endpoint).toBe("https://easyrecharge.ch/api/mcp-auth/register");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(m.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });

  it("protected resource metadata names /api/mcp and the AS", () => {
    const m = protectedResourceMetadata("https://easyrecharge.ch");
    expect(m.resource).toBe("https://easyrecharge.ch/api/mcp");
    expect(m.authorization_servers).toEqual(["https://easyrecharge.ch"]);
    expect(m.bearer_methods_supported).toEqual(["header"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` — expected: FAIL.

- [ ] **Step 3: Implement src/lib/mcp/metadata.ts**

```ts
export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/mcp-auth/authorize`,
    token_endpoint: `${base}/api/mcp-auth/token`,
    registration_endpoint: `${base}/api/mcp-auth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}

export function protectedResourceMetadata(base: string) {
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  };
}
```

- [ ] **Step 4: Create the three routes (identical pattern)**

`src/app/.well-known/oauth-authorization-server/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requestBaseUrl } from "@/lib/mcp/auth";
import { authorizationServerMetadata } from "@/lib/mcp/metadata";

export async function GET(req: Request) {
  return NextResponse.json(authorizationServerMetadata(requestBaseUrl(req)));
}
```

`src/app/.well-known/oauth-protected-resource/route.ts` and `src/app/.well-known/oauth-protected-resource/api/mcp/route.ts` (same content in both):

```ts
import { NextResponse } from "next/server";
import { requestBaseUrl } from "@/lib/mcp/auth";
import { protectedResourceMetadata } from "@/lib/mcp/metadata";

export async function GET(req: Request) {
  return NextResponse.json(protectedResourceMetadata(requestBaseUrl(req)));
}
```

- [ ] **Step 5: Run tests + verify routes serve**

Run: `npm test` — all pass.
Run: `npm run dev` in background, then `curl -s http://localhost:3000/.well-known/oauth-authorization-server | head -c 200` — expected JSON with `"issuer":"http://localhost:3000"`. Also curl `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/api/mcp`. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/metadata.ts src/lib/mcp/metadata.test.ts src/app/.well-known
git commit -m "feat(mcp): OAuth discovery metadata routes"
```

---

### Task 6: OAuth register + authorize routes

**Files:**
- Create: `src/app/api/mcp-auth/register/route.ts`
- Create: `src/app/api/mcp-auth/authorize/route.ts`
- Create: `src/app/api/mcp-auth/register/route.test.ts`
- Create: `src/app/api/mcp-auth/authorize/route.test.ts`

**Interfaces:**
- Consumes: `encodeClientId`, `decodeClientId`, `signState`, `requestBaseUrl` (Task 3); `googleAuthUrl` (Task 4).
- Produces: `POST /api/mcp-auth/register`, `GET /api/mcp-auth/authorize`.

- [ ] **Step 1: Write the failing tests**

`src/app/api/mcp-auth/register/route.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.MCP_JWT_SECRET = "test-jwt-secret-0123456789abcdef";
});

const post = async (body: unknown) => {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost:3000/api/mcp-auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
};

describe("POST /api/mcp-auth/register", () => {
  it("registers a client with https redirect uris", async () => {
    const res = await post({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], client_name: "Claude" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(typeof json.client_id).toBe("string");
    expect(json.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
    expect(json.token_endpoint_auth_method).toBe("none");
    const { decodeClientId } = await import("@/lib/mcp/auth");
    expect(decodeClientId(json.client_id)?.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
  });

  it("rejects non-https (non-localhost) redirect uris and empty lists", async () => {
    expect((await post({ redirect_uris: ["http://evil.com/cb"] })).status).toBe(400);
    expect((await post({ redirect_uris: [] })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it("accepts localhost http for dev clients", async () => {
    expect((await post({ redirect_uris: ["http://localhost:33418/cb"] })).status).toBe(201);
  });
});
```

`src/app/api/mcp-auth/authorize/route.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.MCP_JWT_SECRET = "test-jwt-secret-0123456789abcdef";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client.apps.googleusercontent.com";
});

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

async function authorize(overrides: Record<string, string | null> = {}) {
  const { encodeClientId } = await import("@/lib/mcp/auth");
  const { GET } = await import("./route");
  const params: Record<string, string> = {
    client_id: encodeClientId({ redirect_uris: [CALLBACK] }),
    redirect_uri: CALLBACK,
    response_type: "code",
    code_challenge: "fake-challenge-value",
    code_challenge_method: "S256",
    state: "client-state-1",
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) delete params[k];
    else params[k] = v;
  }
  const url = `http://localhost:3000/api/mcp-auth/authorize?${new URLSearchParams(params)}`;
  return GET(new Request(url, { headers: { host: "localhost:3000" } }));
}

describe("GET /api/mcp-auth/authorize", () => {
  it("redirects a valid request to Google with a signed state", async () => {
    const res = await authorize();
    expect(res.status).toBeGreaterThanOrEqual(302);
    expect(res.status).toBeLessThan(400);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(loc.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/mcp-auth/callback");
    const { readState } = await import("@/lib/mcp/auth");
    const st = readState(loc.searchParams.get("state")!);
    expect(st?.uri).toBe(CALLBACK);
    expect(st?.cch).toBe("fake-challenge-value");
    expect(st?.st).toBe("client-state-1");
  });

  it("400s on an invalid client_id", async () => {
    expect((await authorize({ client_id: "forged" })).status).toBe(400);
  });

  it("400s on a redirect_uri not registered in the client_id", async () => {
    expect((await authorize({ redirect_uri: "https://evil.com/cb" })).status).toBe(400);
  });

  it("redirects back with error=invalid_request when PKCE is missing or not S256", async () => {
    for (const bad of [{ code_challenge: null }, { code_challenge_method: "plain" }]) {
      const res = await authorize(bad as Record<string, string | null>);
      const loc = new URL(res.headers.get("location")!);
      expect(loc.origin).toBe("https://claude.ai");
      expect(loc.searchParams.get("error")).toBe("invalid_request");
      expect(loc.searchParams.get("state")).toBe("client-state-1");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement register route**

`src/app/api/mcp-auth/register/route.ts`:

```ts
import { NextResponse } from "next/server";
import { encodeClientId } from "@/lib/mcp/auth";

function isAcceptableRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }
  const uris = Array.isArray(body?.redirect_uris)
    ? (body.redirect_uris as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  if (uris.length === 0 || !uris.every(isAcceptableRedirect)) {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }
  return NextResponse.json(
    {
      client_id: encodeClientId({ redirect_uris: uris }),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      ...(typeof body.client_name === "string" ? { client_name: body.client_name } : {}),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 4: Implement authorize route**

`src/app/api/mcp-auth/authorize/route.ts`:

```ts
import { NextResponse } from "next/server";
import { decodeClientId, requestBaseUrl, signState } from "@/lib/mcp/auth";
import { googleAuthUrl } from "@/lib/mcp/google";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri") ?? "";
  const state = q.get("state") ?? "";

  const client = decodeClientId(clientId);
  if (!client) return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  if (!client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  // redirect_uri is trusted from here on — protocol errors go back to the client
  if (q.get("response_type") !== "code" || !q.get("code_challenge") || q.get("code_challenge_method") !== "S256") {
    const u = new URL(redirectUri);
    u.searchParams.set("error", "invalid_request");
    if (state) u.searchParams.set("state", state);
    return NextResponse.redirect(u);
  }

  const googleState = signState({ cid: clientId, uri: redirectUri, cch: q.get("code_challenge")!, st: state });
  const callback = `${requestBaseUrl(req)}/api/mcp-auth/callback`;
  return NextResponse.redirect(googleAuthUrl(googleState, callback));
}
```

- [ ] **Step 5: Run tests**

Run: `npm test` — all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mcp-auth/register src/app/api/mcp-auth/authorize
git commit -m "feat(mcp): OAuth dynamic client registration + authorize endpoints"
```

---

### Task 7: OAuth callback + token routes

**Files:**
- Create: `src/app/api/mcp-auth/callback/route.ts`
- Create: `src/app/api/mcp-auth/token/route.ts`
- Create: `src/app/api/mcp-auth/callback/route.test.ts`
- Create: `src/app/api/mcp-auth/token/route.test.ts`

**Interfaces:**
- Consumes: `readState`, `issueAuthCode`, `readAuthCode`, `verifyPkceS256`, `issueTokens`, `readRefreshToken`, `isAllowedEmail`, `requestBaseUrl` (Task 3); `exchangeGoogleCode` (Task 4).
- Produces: `GET /api/mcp-auth/callback`, `POST /api/mcp-auth/token` (accepts form-encoded and JSON bodies).

- [ ] **Step 1: Write the failing tests**

`src/app/api/mcp-auth/callback/route.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";

const exchangeGoogleCode = vi.fn();
vi.mock("@/lib/mcp/google", () => ({
  exchangeGoogleCode: (...args: unknown[]) => exchangeGoogleCode(...args),
  googleAuthUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
}));

beforeAll(() => {
  process.env.MCP_JWT_SECRET = "test-jwt-secret-0123456789abcdef";
  delete process.env.MCP_ALLOWED_EMAILS;
});

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

async function hitCallback() {
  const { signState } = await import("@/lib/mcp/auth");
  const { GET } = await import("./route");
  const state = signState({ cid: "cid-1", uri: CALLBACK, cch: "cch-1", st: "client-state" });
  const url = `http://localhost:3000/api/mcp-auth/callback?code=googlecode&state=${encodeURIComponent(state)}`;
  return GET(new Request(url, { headers: { host: "localhost:3000" } }));
}

describe("GET /api/mcp-auth/callback", () => {
  it("issues an auth code and redirects for the allowlisted account", async () => {
    exchangeGoogleCode.mockResolvedValueOnce({ email: "yoan@easyrecharge.ch", emailVerified: true });
    const res = await hitCallback();
    expect(res.status).toBeGreaterThanOrEqual(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe(CALLBACK);
    expect(loc.searchParams.get("state")).toBe("client-state");
    const { readAuthCode } = await import("@/lib/mcp/auth");
    const code = readAuthCode(loc.searchParams.get("code")!);
    expect(code).toEqual({
      email: "yoan@easyrecharge.ch",
      clientId: "cid-1",
      redirectUri: CALLBACK,
      codeChallenge: "cch-1",
    });
  });

  it("403s any other Google account", async () => {
    exchangeGoogleCode.mockResolvedValueOnce({ email: "intruder@gmail.com", emailVerified: true });
    expect((await hitCallback()).status).toBe(403);
  });

  it("403s unverified emails", async () => {
    exchangeGoogleCode.mockResolvedValueOnce({ email: "yoan@easyrecharge.ch", emailVerified: false });
    expect((await hitCallback()).status).toBe(403);
  });

  it("400s a bad state and 502s a failed Google exchange", async () => {
    const { GET } = await import("./route");
    const bad = await GET(new Request("http://localhost:3000/api/mcp-auth/callback?code=x&state=forged"));
    expect(bad.status).toBe(400);
    exchangeGoogleCode.mockRejectedValueOnce(new Error("boom"));
    expect((await hitCallback()).status).toBe(502);
  });
});
```

`src/app/api/mcp-auth/token/route.test.ts`:

```ts
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.MCP_JWT_SECRET = "test-jwt-secret-0123456789abcdef";
  process.env.MCP_STATIC_TOKEN = "test-static-token-0123456789abcdef";
  delete process.env.MCP_ALLOWED_EMAILS;
});

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "verifier-string-that-is-long-enough-for-pkce-42";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

async function postToken(params: Record<string, string>) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost:3000/api/mcp-auth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    }),
  );
}

async function freshCode() {
  const { issueAuthCode } = await import("@/lib/mcp/auth");
  return issueAuthCode({
    email: "yoan@easyrecharge.ch",
    clientId: "cid-1",
    redirectUri: CALLBACK,
    codeChallenge: CHALLENGE,
  });
}

describe("POST /api/mcp-auth/token", () => {
  it("exchanges a valid code + PKCE verifier for tokens usable against the MCP endpoint", async () => {
    const res = await postToken({
      grant_type: "authorization_code",
      code: await freshCode(),
      code_verifier: VERIFIER,
      client_id: "cid-1",
      redirect_uri: CALLBACK,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token_type).toBe("bearer");
    const { verifyMcpToken } = await import("@/lib/mcp/auth");
    const info = await verifyMcpToken(new Request("http://x"), json.access_token);
    expect(info?.clientId).toBe("yoan@easyrecharge.ch");
    expect(typeof json.refresh_token).toBe("string");
  });

  it("rejects a wrong PKCE verifier", async () => {
    const res = await postToken({
      grant_type: "authorization_code",
      code: await freshCode(),
      code_verifier: "wrong-verifier",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("rejects mismatched client_id / redirect_uri when supplied", async () => {
    const base = { grant_type: "authorization_code", code: await freshCode(), code_verifier: VERIFIER };
    expect((await postToken({ ...base, client_id: "other" })).status).toBe(401);
    expect((await postToken({ ...base, redirect_uri: "https://evil.com/cb" })).status).toBe(400);
  });

  it("refresh_token grant rotates tokens", async () => {
    const first = await (
      await postToken({ grant_type: "authorization_code", code: await freshCode(), code_verifier: VERIFIER })
    ).json();
    const res = await postToken({ grant_type: "refresh_token", refresh_token: first.refresh_token });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.access_token).toBe("string");
  });

  it("rejects unknown grants and garbage codes", async () => {
    expect((await postToken({ grant_type: "password" })).status).toBe(400);
    expect(
      (await postToken({ grant_type: "authorization_code", code: "junk", code_verifier: VERIFIER })).status,
    ).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — expected: FAIL.

- [ ] **Step 3: Implement callback route**

`src/app/api/mcp-auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isAllowedEmail, issueAuthCode, readState, requestBaseUrl } from "@/lib/mcp/auth";
import { exchangeGoogleCode } from "@/lib/mcp/google";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const code = q.get("code");
  const state = readState(q.get("state") ?? "");
  if (!state || !code) {
    return new NextResponse("Invalid or expired OAuth state. Please retry connecting.", { status: 400 });
  }

  let email: string | null;
  let emailVerified: boolean;
  try {
    ({ email, emailVerified } = await exchangeGoogleCode(code, `${requestBaseUrl(req)}/api/mcp-auth/callback`));
  } catch {
    return new NextResponse("Google sign-in failed. Please retry.", { status: 502 });
  }

  if (!email || !emailVerified || !isAllowedEmail(email)) {
    return new NextResponse(
      `Access denied for ${email ?? "unknown account"}. This MCP server is restricted to authorized accounts.`,
      { status: 403 },
    );
  }

  const authCode = issueAuthCode({
    email,
    clientId: state.cid,
    redirectUri: state.uri,
    codeChallenge: state.cch,
  });
  const target = new URL(state.uri);
  target.searchParams.set("code", authCode);
  if (state.st) target.searchParams.set("state", state.st);
  return NextResponse.redirect(target);
}
```

- [ ] **Step 4: Implement token route**

`src/app/api/mcp-auth/token/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isAllowedEmail, issueTokens, readAuthCode, readRefreshToken, verifyPkceS256 } from "@/lib/mcp/auth";

function oauthError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function readParams(req: Request): Promise<URLSearchParams | null> {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await req.json()) as Record<string, unknown>;
      return new URLSearchParams(
        Object.entries(j).filter((e): e is [string, string] => typeof e[1] === "string"),
      );
    }
    return new URLSearchParams(await req.text());
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const p = await readParams(req);
  if (!p) return oauthError("invalid_request");

  const grant = p.get("grant_type");

  if (grant === "authorization_code") {
    const code = readAuthCode(p.get("code") ?? "");
    if (!code) return oauthError("invalid_grant");
    if (!verifyPkceS256(p.get("code_verifier") ?? "", code.codeChallenge)) return oauthError("invalid_grant");
    const clientId = p.get("client_id");
    if (clientId && clientId !== code.clientId) return oauthError("invalid_client", 401);
    const redirectUri = p.get("redirect_uri");
    if (redirectUri && redirectUri !== code.redirectUri) return oauthError("invalid_grant");
    return NextResponse.json(issueTokens(code.email, code.clientId));
  }

  if (grant === "refresh_token") {
    const r = readRefreshToken(p.get("refresh_token") ?? "");
    if (!r || !isAllowedEmail(r.email)) return oauthError("invalid_grant");
    return NextResponse.json(issueTokens(r.email, r.clientId));
  }

  return oauthError("unsupported_grant_type");
}
```

- [ ] **Step 5: Run tests**

Run: `npm test` — all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mcp-auth/callback src/app/api/mcp-auth/token
git commit -m "feat(mcp): OAuth callback (Google identity + allowlist) and token endpoints"
```

---

### Task 8: Extract read-domain logic — site URLs, localities, list-submissions

**Files:**
- Create: `src/lib/sitemap/list-urls.ts`
- Create: `src/lib/localities-server.ts`
- Modify: `src/lib/directus-storage.ts` (add `listSubmissions` method)
- Modify: `src/app/api/debug/urls/route.ts`
- Modify: `src/app/api/cms/localities/route.ts`
- Modify: `src/app/api/cms/localities/[id]/subsidies/route.ts`

**Interfaces:**
- Produces (consumed by Task 10 tools):
  - `listSiteUrls(opts?: { type?: string; lang?: "fr" | "de" }): Promise<{ summary: Record<string, { total: number; fr: number; de: number }>; totalUrls: number; urls: string[] }>` in `@/lib/sitemap/list-urls`
  - `searchLocalitiesDirectus(search: string, opts?: { limit?: number; locale?: string }): Promise<{ data: unknown[]; meta?: { note: string } }>` in `@/lib/localities-server`
  - `hasChargingSubsidy(localityId: string): Promise<boolean>` in `@/lib/localities-server` (throws on Directus failure — the ROUTE keeps its swallow-to-false behavior; the tool surfaces the error)
  - `storage.listSubmissions(opts?: { limit?: number; formType?: string; status?: string; environment?: string }): Promise<FormSubmission[]>`

- [ ] **Step 1: Create src/lib/sitemap/list-urls.ts by moving the body of the GET handler in `src/app/api/debug/urls/route.ts` (lines ~9-66) verbatim**

Move the fetcher map ({ cms: getCmsEntries, blog: getBlogEntries, vehicles: getVehicleEntries }), type selection, per-entry lang filtering, URL→pathname flattening (keeping the fall-back-to-raw-string on unparseable URLs), and summary counting into:

```ts
import { getBlogEntries, getCmsEntries, getVehicleEntries } from "./registries";

export async function listSiteUrls(
  opts: { type?: string; lang?: "fr" | "de" } = {},
): Promise<{ summary: Record<string, { total: number; fr: number; de: number }>; totalUrls: number; urls: string[] }> {
  // ← moved route logic goes here, param reads replaced by opts.type / opts.lang
}
```

Preserve exactly: unknown `type` values silently yield empty results; `lang` filters the `urls` array but NOT the summary counts.

- [ ] **Step 2: Reduce the debug/urls route to a thin wrapper**

`src/app/api/debug/urls/route.ts` becomes (keep the existing PostHog/serverLog error-path imports and calls exactly as they are today):

```ts
import { NextResponse } from "next/server";
import { listSiteUrls } from "@/lib/sitemap/list-urls";
// ...keep the route's existing error-handling imports (serverLog, getPostHogServer, after)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    const result = await listSiteUrls({
      type: searchParams.get("type") ?? undefined,
      lang: (searchParams.get("lang") as "fr" | "de" | null) ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    // ← keep the route's existing catch body (serverLog + captureException + after(flush) + 500 JSON) unchanged
  }
}
```

- [ ] **Step 3: Create src/lib/localities-server.ts by moving the Directus queries out of the two locality routes verbatim**

```ts
import { directusFetch } from "@/lib/directus";
import { DIRECTUS_DEFAULT_LOCALE } from "@/lib/directus";

export async function searchLocalitiesDirectus(
  search: string,
  opts: { limit?: number; locale?: string } = {},
): Promise<{ data: unknown[]; meta?: { note: string } }> {
  const trimmed = search.trim();
  if (trimmed.length < 2) return { data: [], meta: { note: "search too short" } };
  // ← move the buildParams + directusFetch call from src/app/api/cms/localities/route.ts (lines ~8-59) here,
  //    including DIRECTUS_LOCALITIES_COLLECTION fallback, fields list, _or filter, deep canton translation
  //    filter (opts.locale ?? DIRECTUS_DEFAULT_LOCALE), sort, limit clamp [1,50] default 8, revalidate 86400.
}

export async function hasChargingSubsidy(localityId: string): Promise<boolean> {
  // ← move the fetch + .some() predicate from src/app/api/cms/localities/[id]/subsidies/route.ts (lines ~10-44)
  //    here WITHOUT the try/catch — this function throws on Directus failure.
  //    Predicate: translations.some(t => (t.subsidies || []).some(s =>
  //      s.category === "charging-infrastructure" && s.audiences?.includes("personal")))
}
```

- [ ] **Step 4: Reduce both locality routes to thin wrappers preserving exact behavior**

- `src/app/api/cms/localities/route.ts`: parse `search`/`limit`/`locale` params as today, call `searchLocalitiesDirectus`, return `NextResponse.json(result)` with today's `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` header on success; keep the existing catch (serverLog + captureException + 500 `{ error: "Failed to fetch localities" }`).
- `src/app/api/cms/localities/[id]/subsidies/route.ts`: `try { const result = await hasChargingSubsidy(id); return NextResponse.json({ hasChargingSubsidy: result }, ...); } catch { /* today's serverLog call */ return NextResponse.json({ hasChargingSubsidy: false }); }` — errors STILL produce `{ hasChargingSubsidy: false }` with 200; keep today's success Cache-Control header.

- [ ] **Step 5: Add listSubmissions to DirectusStorage**

In `src/lib/directus-storage.ts`, add next to `getSubmissionById`:

```ts
async listSubmissions(
  opts: { limit?: number; formType?: string; status?: string; environment?: string } = {},
): Promise<FormSubmission[]> {
  const params = new URLSearchParams();
  params.set("fields", "*,user.*,session.*");
  params.set("sort", "-date_created");
  params.set("limit", String(Math.min(Math.max(opts.limit ?? 20, 1), 200)));
  const env = opts.environment ?? getEnvironment();
  if (env !== "all") params.set("filter[environment][_eq]", env);
  if (opts.formType) params.set("filter[form_type][_eq]", opts.formType);
  if (opts.status) params.set("filter[status][_eq]", opts.status);
  const res = await directusFetch<{ data: FormSubmission[] }>(`/items/form_submissions?${params.toString()}`, {
    next: { revalidate: 0 },
  });
  return res?.data ?? [];
}
```

(Follow the file's existing import style — `directusFetch` is already imported there.)

- [ ] **Step 6: Verify behavior preserved**

Run: `npm run lint && npm run build` — expected: clean.
Run dev server; `curl -s "http://localhost:3000/api/debug/urls?type=cms" | head -c 300` (JSON with summary/urls), `curl -s "http://localhost:3000/api/cms/localities?search=lau"` (locality rows), `curl -s "http://localhost:3000/api/cms/localities/BAD-ID/subsidies"` (expect `{"hasChargingSubsidy":false}` HTTP 200). Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sitemap/list-urls.ts src/lib/localities-server.ts src/lib/directus-storage.ts src/app/api/debug/urls src/app/api/cms/localities
git commit -m "refactor(api): extract site-urls/localities/list-submissions into lib functions"
```

---

### Task 9: Extract admin-domain logic — billing, reconcile, dispatch listing, manual dispatch

**Files:**
- Create: `src/lib/dispatch/admin.ts`
- Create: `src/lib/dispatch/manual-dispatch.ts`
- Modify: `src/app/api/admin/billing/route.ts`
- Modify: `src/app/api/admin/reconcile-billing/route.ts`
- Modify: `src/app/api/admin/dispatch/[submissionId]/route.ts`
- Modify: `src/app/api/debug/dispatches/route.ts`
- Create: `src/lib/dispatch/admin.test.ts`

**Interfaces:**
- Produces (consumed by Task 11 tools):
  - `getMonthlyBilling(month: string): Promise<{ month: string; rows: { partnerId: string; leadCount: number; totalChf: number }[]; totalChf: number }>` — throws `Error("invalid_month")` unless `/^\d{4}-\d{2}$/`.
  - `reconcileBilling(opts?: { dryRun?: boolean; now?: Date }): Promise<{ locked: number; ids: string[]; dryRun: boolean }>` — when `dryRun: true`, computes candidates but performs NO PATCHes.
  - `listDispatches(opts?: { limit?: number; canton?: string | null; status?: string | null; partner?: string | null; env?: string | null }): Promise<{ count: number; environment: string; rows: DispatchRow[] }>` (export `interface DispatchRow` matching today's response rows).
  - `manualDispatch(submissionId: string, opts?: { force?: boolean }): Promise<{ ok: true; submissionId: string; mode: DispatchMode; isTest: boolean; targetCount: number; webhookFired: boolean; dispatch: DispatchResult } | { ok: false; error: "not_found" } | { ok: false; error: "already_dispatched"; existing: number }>`

- [ ] **Step 1: Write the failing test for the pure/validation parts**

Create `src/lib/dispatch/admin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getMonthlyBilling } from "./admin";

describe("getMonthlyBilling", () => {
  it("rejects malformed months before touching Directus", async () => {
    for (const bad of ["2026", "26-05", "2026-5", "2026-13x", ""]) {
      await expect(getMonthlyBilling(bad)).rejects.toThrow("invalid_month");
    }
  });
});
```

(Directus-hitting paths are covered by the route curls in Step 6 and the smoke test in Task 13 — do not mock `directusFetch`.)

- [ ] **Step 2: Run test to verify it fails, then create src/lib/dispatch/admin.ts**

Move logic verbatim from the three route files:

```ts
import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import { fetchDispatchConfig } from "./queries";
import { isAcceptanceExpired } from "./billing";

export async function getMonthlyBilling(month: string) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error("invalid_month");
  // ← move the aggregate query + parseInt coercion + totalChf reduce from
  //    src/app/api/admin/billing/route.ts (lines ~33-61) here, unchanged.
}

export async function reconcileBilling(opts: { dryRun?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  // ← move candidate fetch + isAcceptanceExpired filter from
  //    src/app/api/admin/reconcile-billing/route.ts (lines ~30-61) here, unchanged.
  // Then: if (!dryRun) run the existing sequential PATCH loop (lines ~63-72).
  // return { locked: ids.length, ids, dryRun };
}

export interface DispatchRow {
  id: string;
  dispatched_at: string;
  status: string;
  canton: string;
  mode_used: string;
  month_bucket: string;
  environment: string;
  submission: string;
  partner: { id: string; slug: string; name: string; notification_email: string } | null;
}

export async function listDispatches(
  opts: { limit?: number; canton?: string | null; status?: string | null; partner?: string | null; env?: string | null } = {},
): Promise<{ count: number; environment: string; rows: DispatchRow[] }> {
  // ← move DISPATCH_FIELDS const + query building + env-filter semantics from
  //    src/app/api/debug/dispatches/route.ts (lines ~5-58) here, unchanged:
  //    limit default 20 clamped ≤200; canton uppercased; env === "all" skips the filter,
  //    otherwise filter[environment][_eq] = opts.env ?? getEnvironment(); sort -dispatched_at.
}
```

- [ ] **Step 3: Create src/lib/dispatch/manual-dispatch.ts**

Move the orchestration from `src/app/api/admin/dispatch/[submissionId]/route.ts` (lines ~34-155) verbatim into:

```ts
import type { DispatchMode, DispatchResult } from "./types";

export type ManualDispatchResult =
  | { ok: true; submissionId: string; mode: DispatchMode; isTest: boolean; targetCount: number; webhookFired: boolean; dispatch: DispatchResult }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "already_dispatched"; existing: number };

export async function manualDispatch(submissionId: string, opts: { force?: boolean } = {}): Promise<ManualDispatchResult> {
  // ← moved route logic: already-dispatched guard (skipped when opts.force),
  //    storage.getSubmissionById → not_found, deriveLeadCategory + normalizeCanton input rebuild,
  //    runDispatch({ ..., product: "ecp", modeOverride: "live" }),
  //    webhook payload assembly via buildQuoteWebhookPayload (trigger: "manual_dispatch") + fireQuoteWebhook,
  //    serverLog warnings for no_webhook_url | no_email — all unchanged.
}
```

Keep the hardcoded PostHog dashboard URL and all serverLog calls exactly as they are in the route today.

- [ ] **Step 4: Reduce the four routes to thin wrappers**

Each keeps ONLY: the `x-admin-token` gate (admin routes), query/path param parsing, and mapping of lib results to today's exact HTTP responses:

- billing: 401 gate → `getMonthlyBilling(month)` → 200 JSON; catch `invalid_month` → 400 `{ error: "invalid_month" }`.
- reconcile-billing: 401 gate → `reconcileBilling({ dryRun: false })` → 200 `{ locked, ids }` (do NOT include `dryRun` in the route response — today's shape has only locked/ids).
- dispatch/[submissionId]: 401 gate → `manualDispatch(id, { force: q.get("force") === "1" })` → map `not_found`→404, `already_dispatched`→409 `{ error, existing }`, ok→200 (spread the ok object minus the `ok` key exactly as today: `{ ok: true, submissionId, mode, isTest, targetCount, webhookFired, dispatch }` — today's 200 body includes ok: true, keep it).
- debug/dispatches: parse params → `listDispatches(...)` → 200 JSON; keep today's catch → 500 `{ error: "Failed to fetch dispatches", message }`.

- [ ] **Step 5: Run tests + lint + build**

Run: `npm test && npm run lint && npm run build` — expected: clean.

- [ ] **Step 6: Verify preserved behavior against dev server**

Run dev server, then (reads only — do NOT hit reconcile or dispatch, they mutate):

```bash
curl -s "http://localhost:3000/api/debug/dispatches?limit=3" | head -c 300
curl -s -H "x-admin-token: $(grep '^DIRECTUS_STATIC_TOKEN=' .env.local | cut -d= -f2)" "http://localhost:3000/api/admin/billing?month=2026-06" | head -c 300
curl -s "http://localhost:3000/api/admin/billing?month=2026-06" # expect {"error":"unauthorized"} 401
```

Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dispatch/admin.ts src/lib/dispatch/manual-dispatch.ts src/lib/dispatch/admin.test.ts src/app/api/admin src/app/api/debug/dispatches
git commit -m "refactor(dispatch): extract billing/reconcile/listing/manual-dispatch into lib"
```

---

### Task 10: MCP tool helpers + CMS and app-data tools

**Files:**
- Create: `src/lib/mcp/tools/helpers.ts`
- Create: `src/lib/mcp/tools/cms.ts`
- Create: `src/lib/mcp/tools/app.ts`
- Create: `src/lib/mcp/tools/helpers.test.ts`

**Interfaces:**
- Consumes: Task 8 lib functions; `directus-queries.ts` fetchers; `storage`; `slugToDirectusLocale` from `@/lib/i18n/config`; `getOpenApiSpec` from `@/app/api/docs/openapi`.
- Produces: `registerCmsTools(server: McpServer)`, `registerAppTools(server: McpServer)`; helpers `ok(data): ToolResult`, `err(message, hint?): ToolResult`, `run(fn, hint?): Promise<ToolResult>`.

- [ ] **Step 1: Write the failing helper test**

Create `src/lib/mcp/tools/helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { err, ok, run } from "./helpers";

describe("tool helpers", () => {
  it("ok wraps data as JSON text content", () => {
    const r = ok({ a: 1 });
    expect(r.content[0].type).toBe("text");
    expect(JSON.parse(r.content[0].text)).toEqual({ a: 1 });
    expect(r.isError).toBeUndefined();
  });

  it("err flags isError and carries a hint", () => {
    const r = err("boom", "try directus_collections");
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0].text)).toEqual({ error: "boom", hint: "try directus_collections" });
  });

  it("run catches thrown errors into err results", async () => {
    const good = await run(async () => ({ fine: true }));
    expect(good.isError).toBeUndefined();
    const bad = await run(async () => {
      throw new Error("directus exploded");
    }, "check the id");
    expect(bad.isError).toBe(true);
    expect(JSON.parse(bad.content[0].text).error).toContain("directus exploded");
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement src/lib/mcp/tools/helpers.ts**

```ts
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function err(message: string, hint?: string): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(hint ? { error: message, hint } : { error: message }) }],
  };
}

export async function run(fn: () => Promise<unknown>, hint?: string): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), hint);
  }
}
```

(The index-signature on `ToolResult` keeps it assignable to the SDK's `CallToolResult`.)

- [ ] **Step 3: Implement src/lib/mcp/tools/cms.ts**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fetchBlogPost,
  fetchBlogPosts,
  fetchPageRegistry,
  fetchVehicle,
  fetchVehicleBrands,
  fetchVehicles,
  fetchVehiclesByBrand,
} from "@/lib/directus-queries";
import { storage } from "@/lib/directus-storage";
import { slugToDirectusLocale } from "@/lib/i18n/config";
import { hasChargingSubsidy, searchLocalitiesDirectus } from "@/lib/localities-server";
import { run } from "./helpers";

const locale = z.enum(["fr", "de"]).default("fr").describe("Content language");

export function registerCmsTools(server: McpServer) {
  server.registerTool(
    "list_blog_posts",
    {
      title: "List blog posts",
      description: "Published blog posts with translations, category, tags, author.",
      inputSchema: { locale, category: z.string().optional().describe("Category id filter") },
      annotations: { readOnlyHint: true },
    },
    async ({ locale: lang, category }) => run(() => fetchBlogPosts(slugToDirectusLocale(lang), category)),
  );

  server.registerTool(
    "get_blog_post",
    {
      title: "Get blog post",
      description: "One published blog post by slug (slug matches any language).",
      inputSchema: { slug: z.string(), locale },
      annotations: { readOnlyHint: true },
    },
    async ({ slug, locale: lang }) =>
      run(async () => (await fetchBlogPost(slug, slugToDirectusLocale(lang))) ?? { notFound: slug }),
  );

  server.registerTool(
    "list_vehicles",
    {
      title: "List vehicles",
      description: "All published EVs (list fields: model, battery, range, charging, brand). Optional brand filter.",
      inputSchema: { locale, brand: z.string().optional().describe("Brand slug, e.g. 'tesla'") },
      annotations: { readOnlyHint: true },
    },
    async ({ locale: lang, brand }) =>
      run(() =>
        brand ? fetchVehiclesByBrand(brand, slugToDirectusLocale(lang)) : fetchVehicles(slugToDirectusLocale(lang)),
      ),
  );

  server.registerTool(
    "get_vehicle",
    {
      title: "Get vehicle",
      description: "Full spec sheet of one published vehicle by slug.",
      inputSchema: { slug: z.string(), locale },
      annotations: { readOnlyHint: true },
    },
    async ({ slug, locale: lang }) =>
      run(async () => (await fetchVehicle(slug, slugToDirectusLocale(lang))) ?? { notFound: slug }),
  );

  server.registerTool(
    "list_vehicle_brands",
    {
      title: "List vehicle brands",
      description: "All published vehicle brands.",
      inputSchema: { locale },
      annotations: { readOnlyHint: true },
    },
    async ({ locale: lang }) => run(() => fetchVehicleBrands(slugToDirectusLocale(lang))),
  );

  server.registerTool(
    "list_pages",
    {
      title: "List CMS pages",
      description: "Page registry: route_id, page type, and fr/de slugs for every page.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => fetchPageRegistry()),
  );

  server.registerTool(
    "list_form_submissions",
    {
      title: "List form submissions",
      description:
        "Recent form submissions (quote/contact/mini-quote) with user + session expanded. Contains client PII — handle accordingly. environment defaults to the current deploy environment; pass 'all' to disable the filter.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(20),
        formType: z.enum(["quote", "contact", "mini-quote-card"]).optional(),
        status: z.string().optional(),
        environment: z.enum(["development", "staging", "production", "all"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => run(() => storage.listSubmissions(args)),
  );

  server.registerTool(
    "search_localities",
    {
      title: "Search Swiss localities",
      description: "Search localities by name or postal code (min 2 chars).",
      inputSchema: { query: z.string(), limit: z.number().int().min(1).max(50).default(8), locale },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit, locale: lang }) =>
      run(() => searchLocalitiesDirectus(query, { limit, locale: slugToDirectusLocale(lang) })),
  );

  server.registerTool(
    "get_locality_subsidies",
    {
      title: "Check locality charging subsidy",
      description: "Whether a locality (by Directus id) has a personal charging-infrastructure subsidy.",
      inputSchema: { localityId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ localityId }) =>
      run(async () => ({ localityId, hasChargingSubsidy: await hasChargingSubsidy(localityId) })),
  );
}
```

- [ ] **Step 4: Implement src/lib/mcp/tools/app.ts**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOpenApiSpec } from "@/app/api/docs/openapi";
import { storage } from "@/lib/directus-storage";
import { listSiteUrls } from "@/lib/sitemap/list-urls";
import { run } from "./helpers";

export function registerAppTools(server: McpServer) {
  server.registerTool(
    "get_form_submission",
    {
      title: "Get form submission",
      description: "One form submission by id, with user and session expanded. Contains client PII.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => run(async () => (await storage.getSubmissionById(id)) ?? { notFound: id }),
  );

  server.registerTool(
    "list_site_urls",
    {
      title: "List site URLs",
      description: "All generated site URLs by type (cms | blog | vehicles | all) with fr/de counts.",
      inputSchema: {
        type: z.enum(["cms", "blog", "vehicles", "all"]).default("all"),
        lang: z.enum(["fr", "de"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ type, lang }) => run(() => listSiteUrls({ type, lang })),
  );

  server.registerTool(
    "get_api_docs",
    {
      title: "Get API docs",
      description: "The app's OpenAPI 3.0 specification (all public API endpoints).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(async () => getOpenApiSpec()),
  );
}
```

- [ ] **Step 5: Run tests + lint**

Run: `npm test && npm run lint` — expected: clean. (Type errors here usually mean zod v4/SDK mismatch — see Task 1 Step 2 contingency.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/tools
git commit -m "feat(mcp): tool helpers + CMS and app-data tools"
```

---

### Task 11: Form-submission and admin tools

**Files:**
- Create: `src/lib/mcp/tools/forms.ts`
- Create: `src/lib/mcp/tools/admin.ts`

**Interfaces:**
- Consumes: Task 9 lib functions (`getMonthlyBilling`, `reconcileBilling`, `listDispatches`, `manualDispatch`); public form endpoints over HTTP.
- Produces: `registerFormTools(server: McpServer)`, `registerAdminTools(server: McpServer)`.

- [ ] **Step 1: Implement src/lib/mcp/tools/forms.ts (self-HTTP — preserves the routes' full orchestration: session/user/submission chain, dispatch, webhooks, PostHog)**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { run } from "./helpers";

function appOrigin(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.MCP_SELF_ORIGIN ?? "http://localhost:3000";
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${appOrigin()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "easyrecharge-mcp" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} responded ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const submitAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

export function registerFormTools(server: McpServer) {
  server.registerTool(
    "submit_quote",
    {
      title: "Submit quote request",
      description:
        "Create a real quote submission (persists to Directus, may dispatch to partners per DISPATCH_MODE, and fires the Make webhook → customer/partner emails). Use test-flagged emails for testing.",
      inputSchema: {
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
        phone: z.string().optional(),
        phoneCountry: z.string().optional(),
        lang: z.enum(["fr", "de"]).optional(),
        acceptTerms: z.boolean().optional(),
        extra: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Additional quote fields stored in submission data: canton, postalCode, locality, housingStatus, solarEquipment, …"),
      },
      annotations: submitAnnotations,
    },
    async ({ extra, ...fields }) => run(() => post("/api/quote", { ...(extra ?? {}), ...fields })),
  );

  server.registerTool(
    "submit_contact",
    {
      title: "Submit contact message",
      description: "Create a real contact submission (persists to Directus and fires the contact webhook).",
      inputSchema: {
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
        message: z.string(),
        phone: z.string().optional(),
        phoneCountry: z.string().optional(),
        lang: z.enum(["fr", "de"]).optional(),
        extra: z.record(z.string(), z.unknown()).optional().describe("subject, company, address fields, …"),
      },
      annotations: submitAnnotations,
    },
    async ({ extra, ...fields }) => run(() => post("/api/contact", { ...(extra ?? {}), ...fields })),
  );

  server.registerTool(
    "submit_mini_quote",
    {
      title: "Submit mini-quote",
      description: "Create a mini-quote session (no user record, no webhook). Returns the session token.",
      inputSchema: {
        housingStatus: z.string(),
        postalCode: z.string(),
        locality: z.string().optional(),
        canton: z.string().optional(),
        formType: z.string().optional(),
        pageId: z.string().optional(),
        locale: z.enum(["fr", "de"]).optional(),
      },
      annotations: submitAnnotations,
    },
    async (args) => run(() => post("/api/mini-quote", args)),
  );
}
```

- [ ] **Step 2: Implement src/lib/mcp/tools/admin.ts**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMonthlyBilling, listDispatches, reconcileBilling } from "@/lib/dispatch/admin";
import { manualDispatch } from "@/lib/dispatch/manual-dispatch";
import { run } from "./helpers";

export function registerAdminTools(server: McpServer) {
  server.registerTool(
    "get_billing",
    {
      title: "Get monthly billing",
      description: "Per-partner billable lead counts and CHF totals for a month (YYYY-MM). Read-only.",
      inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM") },
      annotations: { readOnlyHint: true },
    },
    async ({ month }) => run(() => getMonthlyBilling(month)),
  );

  server.registerTool(
    "reconcile_billing",
    {
      title: "Reconcile billing",
      description:
        "Lock billable=true on dispatches whose acceptance window elapsed. dryRun=true (default) only lists what WOULD lock; dryRun=false performs the irreversible billing lock.",
      inputSchema: { dryRun: z.boolean().default(true) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ dryRun }) => run(() => reconcileBilling({ dryRun })),
  );

  server.registerTool(
    "dispatch_submission",
    {
      title: "Dispatch submission to partners",
      description:
        "Manually dispatch a stored quote submission to partners in LIVE mode: writes billing ledger rows and sends real partner + customer emails via the Make webhook. force=true bypasses the already-dispatched guard (double-billing risk).",
      inputSchema: { submissionId: z.string(), force: z.boolean().default(false) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ submissionId, force }) => run(() => manualDispatch(submissionId, { force })),
  );

  server.registerTool(
    "list_dispatches",
    {
      title: "List partner dispatches",
      description:
        "Partner dispatch ledger, newest first. env defaults to the current deploy environment; pass 'all' to disable the filter.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(20),
        canton: z.string().optional(),
        status: z.string().optional().describe("dispatched | skipped_quota | skipped_no_partner | skipped_test | skipped_dedup"),
        partner: z.string().optional().describe("Partner slug"),
        env: z.enum(["development", "staging", "production", "all"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => run(() => listDispatches(args)),
  );
}
```

- [ ] **Step 3: Lint + typecheck via build**

Run: `npm run lint && npm run build` — expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mcp/tools/forms.ts src/lib/mcp/tools/admin.ts
git commit -m "feat(mcp): form-submission and admin tools"
```

---

### Task 12: Generic Directus tools

**Files:**
- Create: `src/lib/mcp/tools/directus-generic.ts`

**Interfaces:**
- Consumes: `directusFetch` from `@/lib/directus`.
- Produces: `registerDirectusTools(server: McpServer)` — tools `directus_collections`, `directus_fields`, `directus_query`, `directus_get_item`, `directus_create_item`, `directus_update_item`.

- [ ] **Step 1: Implement src/lib/mcp/tools/directus-generic.ts**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { directusFetch } from "@/lib/directus";
import { run } from "./helpers";

const live = { next: { revalidate: 0 } };
const UNKNOWN_COLLECTION_HINT = "Unknown collection? Call directus_collections to list what exists.";

export function registerDirectusTools(server: McpServer) {
  server.registerTool(
    "directus_collections",
    {
      title: "List Directus collections",
      description: "All content collections in the CMS (system collections excluded). Start here for schema discovery.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      run(async () => {
        const res = await directusFetch<{
          data: Array<{ collection: string; meta?: { hidden?: boolean; note?: string | null } | null }>;
        }>("/collections", live);
        return res.data
          .filter((c) => !c.collection.startsWith("directus_"))
          .map((c) => ({ collection: c.collection, note: c.meta?.note ?? null, hidden: c.meta?.hidden ?? false }));
      }),
  );

  server.registerTool(
    "directus_fields",
    {
      title: "List collection fields",
      description: "Field names and types of one Directus collection.",
      inputSchema: { collection: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ collection }) =>
      run(async () => {
        const res = await directusFetch<{
          data: Array<{ field: string; type: string; meta?: { note?: string | null; required?: boolean } | null }>;
        }>(`/fields/${encodeURIComponent(collection)}`, live);
        return res.data.map((f) => ({
          field: f.field,
          type: f.type,
          note: f.meta?.note ?? null,
          required: f.meta?.required ?? false,
        }));
      }, UNKNOWN_COLLECTION_HINT),
  );

  server.registerTool(
    "directus_query",
    {
      title: "Query a Directus collection",
      description:
        "Read items from any collection with Directus filter/sort/search. filter uses Directus operator syntax, e.g. {\"status\":{\"_eq\":\"published\"}}.",
      inputSchema: {
        collection: z.string(),
        fields: z.string().default("*").describe("Comma-separated field list, supports dot-expansion like user.*"),
        filter: z.record(z.string(), z.unknown()).optional(),
        sort: z.string().optional().describe("e.g. -date_created"),
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
        search: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ collection, fields, filter, sort, limit, offset, search }) =>
      run(async () => {
        const params = new URLSearchParams();
        params.set("fields", fields);
        params.set("limit", String(limit));
        if (offset) params.set("offset", String(offset));
        if (sort) params.set("sort", sort);
        if (search) params.set("search", search);
        if (filter) params.set("filter", JSON.stringify(filter));
        const res = await directusFetch<{ data: unknown[] }>(
          `/items/${encodeURIComponent(collection)}?${params.toString()}`,
          live,
        );
        return res.data;
      }, UNKNOWN_COLLECTION_HINT),
  );

  server.registerTool(
    "directus_get_item",
    {
      title: "Get one Directus item",
      description: "Fetch a single item by collection and id.",
      inputSchema: { collection: z.string(), id: z.string(), fields: z.string().default("*") },
      annotations: { readOnlyHint: true },
    },
    async ({ collection, id, fields }) =>
      run(async () => {
        const res = await directusFetch<{ data: unknown }>(
          `/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`,
          live,
        );
        return res.data;
      }, UNKNOWN_COLLECTION_HINT),
  );

  server.registerTool(
    "directus_create_item",
    {
      title: "Create a Directus item",
      description: "Create one item in any collection. Writes production CMS data — check directus_fields first.",
      inputSchema: { collection: z.string(), data: z.record(z.string(), z.unknown()) },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ collection, data }) =>
      run(async () => {
        const res = await directusFetch<{ data: unknown }>(`/items/${encodeURIComponent(collection)}`, {
          ...live,
          method: "POST",
          body: JSON.stringify(data),
        });
        return res.data;
      }, UNKNOWN_COLLECTION_HINT),
  );

  server.registerTool(
    "directus_update_item",
    {
      title: "Update a Directus item",
      description: "Patch fields on one item. Writes production CMS data.",
      inputSchema: { collection: z.string(), id: z.string(), data: z.record(z.string(), z.unknown()) },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ collection, id, data }) =>
      run(async () => {
        const res = await directusFetch<{ data: unknown }>(
          `/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
          { ...live, method: "PATCH", body: JSON.stringify(data) },
        );
        return res.data;
      }, UNKNOWN_COLLECTION_HINT),
  );
}
```

Note: `directusFetch` retries HTTP 404 three times (~3s) as a Directus-restart heuristic — a genuinely missing item/collection costs ~3s then errors. Acceptable; do not change `directusFetch`.

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build` — expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mcp/tools/directus-generic.ts
git commit -m "feat(mcp): generic Directus query/write tools with schema discovery"
```

---

### Task 13: MCP endpoint wiring + smoke test

**Files:**
- Create: `src/app/api/[transport]/route.ts`
- Create: `scripts/mcp-smoke.mjs`

**Interfaces:**
- Consumes: all `register*Tools` (Tasks 10-12), `verifyMcpToken` (Task 3).
- Produces: authenticated MCP server at `POST /api/mcp` (streamable HTTP).

- [ ] **Step 1: Implement src/app/api/[transport]/route.ts**

```ts
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpToken } from "@/lib/mcp/auth";
import { registerAdminTools } from "@/lib/mcp/tools/admin";
import { registerAppTools } from "@/lib/mcp/tools/app";
import { registerCmsTools } from "@/lib/mcp/tools/cms";
import { registerDirectusTools } from "@/lib/mcp/tools/directus-generic";
import { registerFormTools } from "@/lib/mcp/tools/forms";

const handler = createMcpHandler(
  (server) => {
    registerCmsTools(server);
    registerAppTools(server);
    registerFormTools(server);
    registerAdminTools(server);
    registerDirectusTools(server);
  },
  { serverInfo: { name: "easyrecharge", version: "1.0.0" } },
  { basePath: "/api", maxDuration: 120 },
);

const authHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
```

Note: static API segments (`/api/quote`, `/api/mcp-auth/*`, …) take precedence over `[transport]` in Next routing — only `/api/mcp` (and `/api/sse`, which we don't support: no Redis) reach this handler.

- [ ] **Step 2: Write scripts/mcp-smoke.mjs**

```js
/* Smoke test: initialize → tools/list → call a read tool. Also asserts 401 without a token.
   Usage: MCP_URL=http://localhost:3000/api/mcp MCP_STATIC_TOKEN=... node scripts/mcp-smoke.mjs */
const BASE = process.env.MCP_URL ?? "http://localhost:3000/api/mcp";
const TOKEN = process.env.MCP_STATIC_TOKEN;
if (!TOKEN) {
  console.error("Set MCP_STATIC_TOKEN");
  process.exit(1);
}

let sessionId = null;

async function rpc(method, params, id) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${TOKEN}`,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  sessionId = res.headers.get("mcp-session-id") ?? sessionId;
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (id === undefined) return null; // notification, no body expected
  const payload = text.startsWith("event:") || text.includes("\ndata:") || text.startsWith("data:")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("")
    : text;
  const json = JSON.parse(payload);
  if (json.error) throw new Error(`${method} → RPC error: ${JSON.stringify(json.error)}`);
  return json.result;
}

// 1. Unauthenticated request must 401
const unauth = await fetch(BASE, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }),
});
if (unauth.status !== 401) throw new Error(`Expected 401 without token, got ${unauth.status}`);
console.log("✓ 401 without token");

// 2. Initialize
const init = await rpc(
  "initialize",
  {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.0" },
  },
  1,
);
console.log(`✓ initialized: ${init.serverInfo.name} ${init.serverInfo.version}`);
await rpc("notifications/initialized", {});

// 3. List tools
const tools = await rpc("tools/list", {}, 2);
const names = tools.tools.map((t) => t.name).sort();
console.log(`✓ ${names.length} tools: ${names.join(", ")}`);
const expected = [
  "directus_collections", "directus_create_item", "directus_fields", "directus_get_item",
  "directus_query", "directus_update_item", "dispatch_submission", "get_api_docs",
  "get_billing", "get_blog_post", "get_form_submission", "get_locality_subsidies",
  "get_vehicle", "list_blog_posts", "list_dispatches", "list_form_submissions",
  "list_pages", "list_site_urls", "list_vehicle_brands", "list_vehicles",
  "reconcile_billing", "search_localities", "submit_contact", "submit_mini_quote", "submit_quote",
];
const missing = expected.filter((n) => !names.includes(n));
if (missing.length) throw new Error(`Missing tools: ${missing.join(", ")}`);
console.log("✓ all expected tools registered");

// 4. Call a read tool
const pages = await rpc("tools/call", { name: "list_pages", arguments: {} }, 3);
const parsed = JSON.parse(pages.content[0].text);
if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("list_pages returned no pages");
console.log(`✓ list_pages returned ${parsed.length} pages (e.g. ${parsed[0].id})`);

console.log("\nSmoke test passed.");
```

- [ ] **Step 3: Run the smoke test against the dev server**

```bash
npm run dev &   # background
sleep 8
MCP_STATIC_TOKEN="$(grep '^MCP_STATIC_TOKEN=' .env.local | cut -d= -f2)" node scripts/mcp-smoke.mjs
```

Expected output ends with `Smoke test passed.` Then stop the dev server.
If tools/list fails on schema conversion, revisit the zod v4 contingency (Task 1 Step 2).

- [ ] **Step 4: Run full test suite + lint + build**

Run: `npm test && npm run lint && npm run build` — expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/[transport]" scripts/mcp-smoke.mjs
git commit -m "feat(mcp): authenticated MCP endpoint at /api/mcp + smoke test"
```

---

### Task 14: Documentation + final verification

**Files:**
- Create: `docs/mcp-setup.md`
- Modify: `CLAUDE.md` (API routes table + new env vars + short MCP section; also fix the stale `middleware.ts` reference to `src/proxy.ts`)

**Interfaces:** none (docs only).

- [ ] **Step 1: Write docs/mcp-setup.md**

Cover, in this order (concrete, copy-pasteable):

1. **What it is** — remote MCP server at `https://easyrecharge.ch/api/mcp`, tool list grouped as in the spec.
2. **Google OAuth client setup** (one-time): Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → type "Web application" → authorized redirect URIs `https://easyrecharge.ch/api/mcp-auth/callback` AND `http://localhost:3000/api/mcp-auth/callback` → copy client id + secret.
3. **Env vars** (Vercel, all environments + `.env.local`): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `MCP_JWT_SECRET` (`openssl rand -base64 32`), `MCP_STATIC_TOKEN` (`openssl rand -base64 32`), `MCP_ALLOWED_EMAILS` (default `yoan@easyrecharge.ch`).
4. **Connect claude.ai / Claude Desktop**: Settings → Connectors → Add custom connector → URL `https://easyrecharge.ch/api/mcp` → the OAuth flow opens Google → sign in with the allowlisted account.
5. **Connect Claude Code**: `claude mcp add --transport http easyrecharge https://easyrecharge.ch/api/mcp --header "Authorization: Bearer $MCP_STATIC_TOKEN"`.
6. **Security model & caveats**: single-user allowlist; stateless JWTs (30d access / 90d refresh) — revocation = rotate `MCP_JWT_SECRET`; auth codes are single-use-by-expiry (5 min) but not replay-tracked; static token grants the same access as OAuth — treat it like the Directus admin token; `reconcile_billing` defaults to dryRun; `dispatch_submission` sends real emails and writes billing rows; preview deployments work with the static token only (Google redirect URIs are fixed to production + localhost).
7. **Smoke test**: the Task 13 command line.

- [ ] **Step 2: Update CLAUDE.md**

- API routes table: add `/api/mcp` (MCP server, streamable HTTP, OAuth/static bearer), `/api/mcp-auth/*` (OAuth AS endpoints), `/.well-known/oauth-*` (discovery).
- Environment Variables section: add the 5 new vars with one-line descriptions.
- Fix "Middleware — `middleware.ts` at project root" to "`src/proxy.ts` (Next 16 proxy convention)".
- Add a short "MCP Server" architecture subsection (5-8 lines) pointing at `docs/mcp-setup.md` and `src/lib/mcp/`.

- [ ] **Step 3: Final verification**

Run: `npm test && npm run lint && npm run build` — all clean.
Re-run the Task 13 smoke test once more against `npm run dev`.
Run: `git status` — confirm `.env.local` is not staged and no secret value appears in any staged file.

- [ ] **Step 4: Commit**

```bash
git add docs/mcp-setup.md CLAUDE.md
git commit -m "docs(mcp): setup guide + CLAUDE.md updates"
```

---

## Post-plan (user actions, not tasks)

1. Create the Google OAuth client and set the 5 env vars in Vercel (see `docs/mcp-setup.md`).
2. Push `staging`, verify against the preview URL with the static token, then merge to `main` (user pushes; do not push automatically).
3. Add the claude.ai custom connector against production and complete the Google flow.
