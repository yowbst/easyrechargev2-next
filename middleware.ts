import { NextRequest, NextResponse } from "next/server";

// WordPress infrastructure paths → 410 Gone
const GONE_PREFIXES = [
  "/wp-admin",
  "/wp-login.php",
  "/wp-content/",
  "/wp-includes/",
  "/feed",
  "/xmlrpc.php",
  "/wp-json/",
];

// Ad click params → server-set cookies (Safari ITP bypass)
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
  const { pathname, searchParams } = request.nextUrl;

  // 1. Root → /fr redirect
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/fr", request.url), 301);
  }

  // 2. WordPress infrastructure → 410 Gone
  for (const prefix of GONE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix)) {
      return new NextResponse("Gone", { status: 410 });
    }
  }

  // 3. Trailing slash removal (except language roots like /fr/ or /de/)
  const isLangRoot = /^\/[a-z]{2}\/?$/.test(pathname);
  if (pathname.length > 1 && pathname.endsWith("/") && !isLangRoot) {
    const stripped = pathname.slice(0, -1);
    const url = request.nextUrl.clone();
    url.pathname = stripped;
    return NextResponse.redirect(url, 301);
  }

  // 4. Attribution cookies — mirror ad click params from URL to server-set cookies
  const response = NextResponse.next();
  let hasCookies = false;

  for (const [param, config] of Object.entries(AD_CLICK_PARAMS)) {
    const value = searchParams.get(param);
    if (!value) continue;

    let cookieValue = value;
    if (config.transform === "fbc") {
      cookieValue = `fb.1.${Date.now()}.${value}`;
    }

    response.cookies.set(config.cookie, cookieValue, {
      maxAge: config.maxAgeDays * 86400,
      path: "/",
      sameSite: "lax",
      httpOnly: false, // client JS needs to read these
      secure: true,
    });
    hasCookies = true;
  }

  if (hasCookies) return response;

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
