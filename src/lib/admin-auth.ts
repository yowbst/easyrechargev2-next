import { timingSafeEqual } from "node:crypto";

/**
 * The admin gate shared by every `/api/admin/*` route: a static
 * `x-admin-token` header equal to DIRECTUS_STATIC_TOKEN, no session. Refuses
 * everything when the token is unset. Compared in constant time.
 *
 *   curl -H "x-admin-token: $DIRECTUS_STATIC_TOKEN" https://easyrecharge.ch/api/admin/...
 */
export function assertAdmin(req: Request): boolean {
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  const header = req.headers.get("x-admin-token");
  if (!token || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
