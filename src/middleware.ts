import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPPORTED_LANGS = new Set(["fr", "de", "en"]);
const DEFAULT_LANG = "fr";

// ── WordPress infrastructure paths → 410 Gone ──────────────────────────

const GONE_PREFIXES = [
  "/wp-admin",
  "/wp-login.php",
  "/wp-content/",
  "/wp-includes/",
  "/feed",
  "/xmlrpc.php",
  "/wp-json/",
];

// ── Attribution cookie config ───────────────────────────────────────────

const AD_CLICK_PARAMS: Record<
  string,
  { cookie: string; maxAgeDays: number; transform?: "fbc" }
> = {
  gclid: { cookie: "_gcl_aw", maxAgeDays: 90 },
  gbraid: { cookie: "_gcl_gb", maxAgeDays: 90 },
  wbraid: { cookie: "_gcl_wb", maxAgeDays: 90 },
  dclid: { cookie: "_dclid", maxAgeDays: 90 },
  fbclid: { cookie: "_fbc", maxAgeDays: 90, transform: "fbc" },
  msclkid: { cookie: "_msclkid", maxAgeDays: 90 },
  ttclid: { cookie: "_ttclid", maxAgeDays: 90 },
  li_fat_id: { cookie: "_li_fat_id", maxAgeDays: 30 },
  twclid: { cookie: "_twclid", maxAgeDays: 90 },
  ScCid: { cookie: "_sccid", maxAgeDays: 90 },
  epik: { cookie: "_epik", maxAgeDays: 90 },
  rdt_cid: { cookie: "_rdt_cid", maxAgeDays: 90 },
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Skip static files and API routes ──────────────────────────────
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.match(/\.\w+$/)
  ) {
    return NextResponse.next();
  }

  // ── 1. WordPress infrastructure → 410 Gone ───────────────────────
  for (const prefix of GONE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix)) {
      return new NextResponse("Gone", { status: 410 });
    }
  }

  // ── 2. Root → redirect to default language ────────────────────────
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = `/${DEFAULT_LANG}`;
    return NextResponse.redirect(url, 301);
  }

  // ── 3. Extract language from first segment ────────────────────────
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];

  // ── 4. Trailing slash removal (except language roots) ─────────────
  const isLangRoot = /^\/[a-z]{2}\/?$/.test(pathname);
  if (pathname.length > 1 && pathname.endsWith("/") && !isLangRoot) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(0, -1);
    return NextResponse.redirect(url, 301);
  }

  // ── 5. Validate language ──────────────────────────────────────────
  if (!SUPPORTED_LANGS.has(firstSegment)) {
    // Not a known language prefix — let Next.js handle (will 404)
    return NextResponse.next();
  }

  const lang = firstSegment;
  const locale = lang === "de" ? "de-DE" : "fr-FR";

  // ── 6. Set headers for downstream layouts ─────────────────────────
  const response = NextResponse.next();
  response.headers.set("x-lang", lang);
  response.headers.set("x-locale", locale);

  // ── 7. Attribution cookies (server-set to bypass Safari ITP) ──────
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    const url = request.nextUrl;
    for (const [param, config] of Object.entries(AD_CLICK_PARAMS)) {
      const value = url.searchParams.get(param);
      if (!value) continue;

      let cookieValue = value;
      if (config.transform === "fbc") {
        cookieValue = `fb.1.${Date.now()}.${value}`;
      }

      response.cookies.set(config.cookie, cookieValue, {
        maxAge: config.maxAgeDays * 86400,
        path: "/",
        sameSite: "lax",
        httpOnly: false,
        secure: request.nextUrl.protocol === "https:",
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
