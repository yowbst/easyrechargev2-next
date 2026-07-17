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
export async function verifyMcpToken(req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  const rawAuth = req.headers.get("authorization");
  if (!bearerToken) {
    console.warn(`[mcp/verify] no_bearer rawAuthPresent=${!!rawAuth} rawAuthPrefix=${rawAuth?.slice(0, 7) ?? "none"}`);
    return undefined;
  }
  if (checkStaticToken(bearerToken)) {
    console.log("[mcp/verify] static_ok");
    return { token: bearerToken, scopes: ["mcp"], clientId: "static-token", extra: { method: "static" } };
  }
  const c = verifyJwt(bearerToken, secret());
  if (!c) {
    console.warn(`[mcp/verify] jwt_invalid staticConfigured=${(process.env.MCP_STATIC_TOKEN?.length ?? 0) >= 16} tokenLen=${bearerToken.length}`);
    return undefined;
  }
  if (c.typ !== "access" || typeof c.sub !== "string" || !isAllowedEmail(c.sub)) {
    console.warn(`[mcp/verify] rejected typ=${String(c.typ)} sub=${String(c.sub)} allowed=${typeof c.sub === "string" ? isAllowedEmail(c.sub) : false}`);
    return undefined;
  }
  console.log(`[mcp/verify] oauth_ok sub=${c.sub}`);
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
