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
