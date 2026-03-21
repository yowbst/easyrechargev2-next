# Next.js Migration Plan — easyRecharge

## Context

easyRecharge is a Swiss EV charging marketplace with ~800 pages (content, blog, vehicles) served as a React SPA + Express backend. Despite server-side SEO meta tag injection, the HTML body requires JavaScript to render. This causes:

1. **"Discovered — not crawled"** in Google Search Console — Googlebot must schedule a JS rendering pass for every page, and with 800 pages the queue is long
2. **AI/GEO invisibility** — GPTBot, PerplexityBot, and similar crawlers don't execute JS at all, so they see empty content
3. **Poor Core Web Vitals** — no image optimization, no streaming, full JS bundle required for first paint

**Decision:** Big-bang migration to Next.js App Router on Vercel. Directus CMS stays where it is (now also handles form storage — Neon DB and Drizzle ORM were removed) — only the application layer moves. Form telemetry events are now tracked client-side via PostHog custom events, eliminating the server-side telemetry endpoint.

---

## 1. Project Structure

```
easyrecharge-next/
├── app/
│   ├── layout.tsx                          # Root: <html>, fonts, theme, PostHog provider
│   ├── not-found.tsx                       # Global 404
│   ├── sitemap.ts                          # Sitemap index → sub-sitemaps
│   ├── robots.ts                           # robots.txt
│   ├── [lang]/
│   │   ├── layout.tsx                      # Language layout: Header, Footer, lang context
│   │   ├── page.tsx                        # Home (Server Component)
│   │   ├── [slug]/
│   │   │   └── page.tsx                    # DynamicPage resolver (CMS pages, blog listing, contact, quote)
│   │   ├── [blogSlug]/[categorySlug]/[postSlug]/
│   │   │   └── page.tsx                    # Blog post (Server Component)
│   │   ├── vehicules/
│   │   │   ├── marques/
│   │   │   │   ├── page.tsx                # Vehicle brands list (fr)
│   │   │   │   └── [brandSlug]/page.tsx    # Vehicle brand detail (fr)
│   │   │   └── [vehicleSlug]/page.tsx      # Vehicle detail (fr)
│   │   ├── fahrzeuge/
│   │   │   ├── marken/
│   │   │   │   ├── page.tsx                # Vehicle brands list (de)
│   │   │   │   └── [brandSlug]/page.tsx    # Vehicle brand detail (de)
│   │   │   └── [vehicleSlug]/page.tsx      # Vehicle detail (de)
│   │   ├── demande-devis/confirmation/page.tsx   # Quote success (fr)
│   │   └── offertenanfrage/bestaetigung/page.tsx # Quote success (de)
│   └── api/
│       ├── quote/route.ts                  # POST form submission → Directus
│       ├── contact/route.ts                # POST contact form → Directus
│       ├── form-submissions/
│       │   └── [id]/route.ts              # GET submission by ID (QuoteSuccess page)
│       ├── webhooks/directus/route.ts      # POST → revalidatePath/revalidateTag
│       └── cms/
│           ├── assets/[id]/route.ts        # Image proxy (fallback only)
│           └── localities/route.ts         # Locality search for Quote form
├── lib/
│   ├── directus.ts                         # Server-side Directus fetch (port server/directus.ts)
│   ├── directus-storage.ts                 # Form storage via Directus REST (port server/directus-storage.ts) — tags each record with environment (development/production)
│   ├── directus-queries.ts                 # Typed query builders (port server/routes/cms.ts)
│   ├── seo/
│   │   ├── resolver.ts                     # SEO resolution logic (port server/seo/seoResolver.ts)
│   │   ├── jsonLd.ts                       # JSON-LD builders (copy server/seo/jsonLd.ts)
│   │   └── metadata.ts                     # generateMetadata helpers → Next.js Metadata objects
│   ├── i18n/
│   │   ├── config.ts                       # Language codes, locale mapping (port localeMap.ts)
│   │   ├── dictionaries.ts                 # Server-side translation loading (port i18n.ts flatten logic)
│   │   └── slug-mapping.ts                 # Cross-language URL mapping (port slugMapping.ts)
│   └── sitemap/                            # Sitemap registries (port server/sitemap/*.ts)
├── components/
│   ├── ui/                                 # shadcn/ui (copy as-is, framework-agnostic)
│   ├── Header.tsx                          # Server Component
│   ├── Footer.tsx                          # Server Component
│   ├── Hero.tsx                            # Server Component with Client Component islands
│   ├── CookieBanner.tsx                    # Client Component ("use client")
│   ├── quote/                              # All Client Components
│   │   ├── QuoteForm.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── PlaceAutocomplete.tsx
│   │   └── ...
│   └── ...                                 # Other components migrated per-page
├── hooks/                                  # Client-only hooks (subset)
├── shared/                                 # Zod schemas, Swiss data, types
├── public/                                 # Static assets (logo, favicons)
├── middleware.ts                           # i18n routing, WP redirects, trailing slashes
├── next.config.ts                          # Redirects, image domains, headers
├── tailwind.config.ts                      # Port existing config
└── tsconfig.json
```

**Key decisions:**
- Vehicle routes duplicated per language (`vehicules/` vs `fahrzeuge/`) — both import same component, explicit routes enable `generateStaticParams`
- `[slug]` catch-all at `app/[lang]/[slug]/` replaces DynamicPage — resolves route_id from Directus page registry at request time
- Blog posts use `[blogSlug]/[categorySlug]/[postSlug]` matching current URL structure

---

## 2. i18n Routing

**Approach:** Custom middleware (NOT next-intl — doesn't fit Directus-driven translations).

**`middleware.ts` responsibilities:**
1. Extract `lang` from first URL segment
2. `/ ` → 301 to `/fr`
3. Validate lang ∈ `{fr, de, en}` — else pass through to 404
4. WordPress legacy redirects (port from `server/middleware/wp-redirects.ts`)
5. Trailing slash removal (301) except language roots
6. Set `x-lang` and `x-locale` headers for layouts
7. Attribution cookie logic (port from `server/middleware/attribution.ts`)

**In Server Components:**
- `params.lang` prop provides language
- No i18next — translations fetched from Directus, used directly as objects
- Create `getTranslations(routeId, locale)` → returns flat dictionary object

**In Client Components (Quote form, etc.):**
- Server Component fetches translations, passes as `dictionary` prop
- Client Component uses a simple `t(key)` lookup function against dictionary
- No i18next dependency needed

---

## 3. Directus Integration

**Current:** Client → `/api/cms/*` → Express proxy → Directus
**New:** Server Components → Directus directly (no proxy)

### `lib/directus.ts` (port from `server/directus.ts`)
- `directusFetch(path, init)` with bearer token, timeout, retry
- Add `{ next: { revalidate: 60, tags: [...] } }` for ISR

### `lib/directus-queries.ts` — typed functions replacing Express proxy:

| Function | Replaces | Revalidation |
|----------|----------|-------------|
| `fetchLayout(locale)` | GET `/api/cms/layout` | 60s + tag `layout` |
| `fetchPage(routeId, locale)` | GET `/api/cms/pages/:routeId` | 60s + tag `page-{routeId}` |
| `fetchPageRegistry()` | GET `/api/cms/page-registry` | 60s + tag `page-registry` |
| `fetchBlogPosts(locale, category?)` | GET `/api/cms/blog-posts` | 300s + tag `blog-posts` |
| `fetchBlogPost(slug, locale)` | GET `/api/cms/blog-posts/:slug` | 300s + tag `blog-post-{slug}` |
| `fetchVehicles(locale)` | GET `/api/cms/vehicles` | 300s + tag `vehicles` |
| `fetchVehicle(slug, locale)` | GET `/api/cms/vehicles/:slug` | 300s + tag `vehicle-{slug}` |
| `fetchVehicleBrands(locale)` | GET `/api/cms/vehicle-brands` | 300s + tag `vehicle-brands` |

Port `buildItemsQuery` helper from `server/routes/cms.ts` — it constructs Directus `fields`, `filter`, and `deep` params.

### Keep as API routes:
- `POST /api/quote`, `POST /api/contact` — form submissions persisted to Directus via `directus-storage.ts` (sessions, users, submissions). Each session and submission is tagged with `environment` (`"production"` or `"development"` based on `NODE_ENV`).
- `GET /api/form-submissions/[id]` — retrieve submission by ID (used by QuoteSuccess page)
- `POST /api/webhooks/directus` — on-demand revalidation
- `GET /api/cms/localities` — locality search (used by Quote form client-side)
- `GET /api/cms/assets/[id]` — image proxy (fallback if Directus assets need auth)

**Removed:** `POST /api/form-events/batch` — form telemetry now fires client-side via `posthog.capture()` custom events. No server-side telemetry endpoint needed.

---

## 4. Page Migration — Server vs Client Components

### Server Components (default — renders HTML, zero JS shipped):

| Page | Key Data Fetching |
|------|-------------------|
| Home | `fetchPage("home", locale)` + `fetchLayout(locale)` — blocks rendered server-side |
| Blog listing | `fetchPage("blog", locale)` + `fetchBlogPosts(locale)` |
| Blog post | `fetchBlogPost(slug, locale)` — article body in HTML |
| Vehicle detail | `fetchVehicle(slug, locale)` — specs table in HTML |
| Vehicle brands | `fetchVehicleBrands(locale)` |
| Vehicle brand | `fetchVehicles(locale, brand)` |
| Content pages | `fetchPage(routeId, locale)` — rich text body |
| Header | `fetchLayout(locale)` — nav items |
| Footer | `fetchLayout(locale)` — links, social |

### Client Components ("use client"):

| Component | Reason |
|-----------|--------|
| Quote form (entire page) | 6-step form, Google Maps, phone validation, telemetry |
| QuoteSuccess | URL params, PostHog tracking |
| MiniQuoteForm / MiniQuoteWidget | Interactive embedded forms |
| CookieBanner | Client-side consent |
| SwissMap | Interactive SVG hover |
| LanguageSwitcher | Client navigation |
| ThemeToggle | Client theme |
| PostHog provider | Analytics |
| Embla carousels | Interactive |
| PlaceAutocomplete | Google Maps API (`dynamic()` with `ssr: false`) |

**Pattern for mixed pages:** Server Component fetches data, renders static HTML. Interactive islands are Client Components receiving serializable props:

```tsx
// app/[lang]/page.tsx (Server Component)
export default async function Home({ params }) {
  const page = await fetchPage("home", toLocale(params.lang));
  const heroBlock = findBlock(page.blocks, "block_hero");
  return (
    <>
      <HeroContent data={heroBlock} />           {/* Server */}
      <MiniQuoteForm dictionary={quoteDictionary} /> {/* Client */}
      <SwissMap />                                  {/* Client */}
    </>
  );
}
```

---

## 5. SEO Migration

This is the highest-value part. Port `server/seo/seoResolver.ts` (887 lines) into Next.js `generateMetadata` functions.

### `lib/seo/metadata.ts` — helper to convert SEO data → Next.js Metadata:

```typescript
export function buildMetadata(seo: SeoData): Metadata {
  return {
    title: normalizeTitle(seo.title),
    description: truncate(seo.description, 155),
    alternates: {
      canonical: seo.canonical,
      languages: {
        'fr': seo.alternates?.fr,
        'de': seo.alternates?.de,
        'x-default': seo.alternates?.fr,
      },
    },
    openGraph: { title, description, images, type, locale },
    twitter: { card: 'summary_large_image', title, description, images },
    robots: seo.noIndex ? { index: false, follow: false } : undefined,
  };
}
```

**Port these pure functions as-is** (no framework dependencies):
- `resolveSEOFieldMappings()` — `{f:fieldName}` template interpolation
- `mergeItemOverTemplate()` — merge page template SEO with item SEO
- `extractItemSEO()` — extract SEO from Directus translations
- `normalizeTitle()`, `truncate()`

### Each page exports `generateMetadata`:

```typescript
// app/[lang]/[blogSlug]/[categorySlug]/[postSlug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await fetchBlogPost(params.postSlug, toLocale(params.lang));
  const templatePage = await fetchPage("blog", toLocale(params.lang));
  const seo = mergeItemOverTemplate(extractItemSEO(post), extractTemplateSEO(templatePage));
  return buildMetadata(resolveSEOFieldMappings(seo, post));
}
```

### JSON-LD

Copy `server/seo/jsonLd.ts` → `lib/seo/jsonLd.ts` (pure functions, no changes needed).
Render in Server Components:

```tsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
```

### Sitemaps

Use Next.js `app/sitemap.ts` with `generateSitemaps()` for sub-sitemaps. Port registry functions from `server/sitemap/` — they already call Directus directly.

### robots.ts

```typescript
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: 'https://easyrecharge.ch/sitemap.xml',
  };
}
```

---

## 6. Image Optimization

**Current:** Directus UUIDs → `/api/cms/assets/{uuid}` proxy, no optimization.

**New:** Next.js `<Image>` component with Vercel image optimization.

```typescript
// next.config.ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: '<directus-domain>' },
  ],
}
```

If Directus assets are public, use direct URLs:
```tsx
<Image src={`${DIRECTUS_URL}/assets/${uuid}`} width={800} height={450} alt={alt} />
```

If assets require auth, keep the `/api/cms/assets/[id]` proxy as fallback and configure `remotePatterns` for own domain.

**Benefits:** Automatic WebP/AVIF conversion, responsive srcset, lazy loading, Vercel CDN caching.

---

## 7. Redirects

### `next.config.ts` — simple 301s (port from `wp-redirects.ts`):

```typescript
async redirects() {
  return [
    { source: '/contact', destination: '/fr/contact', permanent: true },
    { source: '/mentions-legales', destination: '/fr/mentions-legales', permanent: true },
    { source: '/obtenir-un-devis', destination: '/fr/demande-devis', permanent: true },
    { source: '/obtenir-un-devis/:path*', destination: '/fr/demande-devis', permanent: true },
    { source: '/guide-recharge', destination: '/fr/blog', permanent: true },
    { source: '/guide-recharge/:slug', destination: '/fr/blog/guide-recharge/:slug', permanent: true },
    { source: '/partenaires', destination: '/fr/contact', permanent: true },
    { source: '/partenaires/:path*', destination: '/fr/contact', permanent: true },
    // ... all other WP redirects
    { source: '/sitemap-index.xml', destination: '/sitemap.xml', permanent: true },
    { source: '/wp-sitemap.xml', destination: '/sitemap.xml', permanent: true },
    // Language-prefixed redirects
    { source: '/:lang/guide-recharge/:slug', destination: '/:lang/blog/guide-recharge/:slug', permanent: true },
  ];
}
```

### `middleware.ts` — complex patterns:
- WordPress infrastructure paths (`/wp-admin`, `/wp-login.php`, `/wp-content/*`) → 410 Gone
- Root `/` → 301 `/fr`
- Trailing slash removal

---

## 8. ISR & Revalidation Strategy

### Time-based (fallback):
- Content pages: `revalidate: 60`
- Blog/vehicles: `revalidate: 300`
- Layout: `revalidate: 60`

### On-demand (primary — via Directus webhooks):

```typescript
// app/api/webhooks/directus/route.ts
import { revalidatePath, revalidateTag } from 'next/cache';

export async function POST(req: Request) {
  // Verify webhook secret
  // Parse payload to identify affected collection + item
  // Call revalidateTag('blog-post-{slug}') or revalidatePath('/{lang}/{path}')
}
```

Port `resolveAffectedPaths` from `server/seo/webhookHandler.ts` — it already maps Directus events to affected URLs.

### Static generation at build time:

```typescript
// app/[lang]/[blogSlug]/[categorySlug]/[postSlug]/page.tsx
export async function generateStaticParams() {
  const entries = await getBlogUrlEntries(); // from sitemap registry
  return entries.map(e => ({ lang: e.lang, blogSlug: e.blogSlug, categorySlug: e.categorySlug, postSlug: e.postSlug }));
}

export const dynamicParams = true; // ISR for new pages between builds
```

---

## 9. State Management Changes

### Remove:
| Library | Replacement |
|---------|-------------|
| TanStack Query | Server Component data fetching (read paths) |
| i18next / react-i18next | Server-side dictionaries passed as props |
| wouter | Next.js file-based routing |
| PageRegistry (client) | Server-side page resolution |

### Keep (Client Components only):
| Library | Usage |
|---------|-------|
| react-hook-form + Zod | Quote form, Contact form |
| Framer Motion | Animations |
| posthog-js | Analytics + form telemetry events (use `@posthog/next` for App Router) |
| next-themes | Theme switching (already a dependency!) |
| embla-carousel-react | Carousels |
| libphonenumber-js | Phone validation in Quote form |
| @vis.gl/react-google-maps | Address autocomplete |

### New:
| Library | Purpose |
|---------|---------|
| next | Framework |
| @posthog/next | PostHog App Router integration |

---

## 10. Vercel Deployment

### Setup:
1. Create GitHub repo for the Next.js project
2. Connect repo to Vercel (auto-deploys on push)
3. Set environment variables in Vercel dashboard:
   - `DIRECTUS_URL`, `DIRECTUS_STATIC_TOKEN`
   - `SITE_URL` = `https://easyrecharge.ch`
   - `DIRECTUS_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_POSTHOG_API_KEY` (renamed from `VITE_POSTHOG_API_KEY`)
   - `NEXT_PUBLIC_POSTHOG_HOST`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - `ANALYTICS_API_TOKEN`
4. Configure custom domain: point DNS A record to Vercel
5. Vercel auto-provisions SSL

### Build:
- `next build` generates static pages for all `generateStaticParams` routes
- ~800 pages, should build in <10 minutes
- If build time exceeds limits: reduce `generateStaticParams` to top pages, rely on ISR for the rest

---

## 11. Migration Steps (Execution Order)

### Step 1: Foundation (scaffold + config)
- `npx create-next-app@latest easyrecharge-next --typescript --tailwind --app --src-dir=false`
- Configure `tsconfig.json` path aliases (`@/`, `@shared/`, `@assets/`)
- Configure `tailwind.config.ts` (port existing config, CSS variables, fonts)
- Copy `shared/` directory
- Copy `components/ui/` (shadcn/ui)
- Copy static assets to `public/`
- Set up `next.config.ts` (redirects, image domains, headers)

### Step 2: Directus layer
- Port `server/directus.ts` → `lib/directus.ts`
- Port `server/directus-storage.ts` → `lib/directus-storage.ts` (form sessions, users, submissions via Directus REST)
- Create `lib/directus-queries.ts` (port query builders from `server/routes/cms.ts`)
- Create `lib/i18n/dictionaries.ts` (port flatten logic from `client/src/lib/i18n.ts`)
- Create `lib/i18n/config.ts` (port `localeMap.ts`)
- Create `lib/i18n/slug-mapping.ts` (port `slugMapping.ts`)

### Step 3: SEO layer
- Port `server/seo/seoResolver.ts` → `lib/seo/resolver.ts` (pure functions)
- Port `server/seo/jsonLd.ts` → `lib/seo/jsonLd.ts` (copy as-is)
- Create `lib/seo/metadata.ts` (SeoData → Next.js Metadata converter)

### Step 4: Middleware
- Create `middleware.ts` (language routing, WP redirects, trailing slashes, attribution)

### Step 5: Layouts
- Create `app/layout.tsx` (root — fonts, theme, PostHog, ErrorBoundary)
- Create `app/[lang]/layout.tsx` (Header, Footer — Server Components)
- Port Header, Footer components (convert to Server Components fetching layout data)

### Step 6: Content pages (highest SEO value first)
- Port Home page → `app/[lang]/page.tsx`
- Port BlogPost → `app/[lang]/[blogSlug]/[categorySlug]/[postSlug]/page.tsx`
- Port Blog listing via DynamicPage → `app/[lang]/[slug]/page.tsx`
- Port Vehicle pages → `app/[lang]/vehicules/...` and `app/[lang]/fahrzeuge/...`
- Port ContentPage (legal, privacy, etc.) via `[slug]` catch-all
- Each page: `generateMetadata` + `generateStaticParams` + JSON-LD

### Step 7: Interactive pages
- Port Quote form → `app/[lang]/[slug]/page.tsx` (Server Component wrapper) + QuoteForm Client Component
- Port Contact form similarly
- Port MiniQuoteForm, MiniQuoteWidget
- Port QuoteSuccess, QuoteSubmissionView

### Step 8: API routes
- Port form submission handlers → `app/api/quote/route.ts`, `app/api/contact/route.ts` (use `directus-storage.ts` for sessions/users/submissions)
- Port form submission lookup → `app/api/form-submissions/[id]/route.ts` (used by QuoteSuccess)
- Port Directus webhook → `app/api/webhooks/directus/route.ts` with `revalidatePath`/`revalidateTag`
- Port locality search → `app/api/cms/localities/route.ts`
- Port image proxy → `app/api/cms/assets/[id]/route.ts`
- **No telemetry endpoint needed** — form events now tracked client-side via `posthog.capture()`

### Step 9: Sitemaps & robots
- Create `app/sitemap.ts` (port registries from `server/sitemap/`)
- Create `app/robots.ts`

### Step 10: Polish & testing
- Port remaining components (SwissMap, carousels, ErrorBoundary, CookieBanner)
- Port PostHog integration (use `@posthog/next`)
- Port attribution tracking
- Verify all ~800 pages build successfully
- Compare SEO output: run old seoResolver and new generateMetadata for same URLs, diff results
- Test all forms end-to-end
- Test language switching
- Test all redirects
- Run Lighthouse on key pages
- Validate JSON-LD with Google Rich Results Test
- Validate sitemaps

### Step 12: Deploy & cutover
- Push to GitHub, connect to Vercel
- Deploy to preview URL, full regression
- Configure custom domain on Vercel
- Update Directus webhook URL to point to Vercel
- Switch DNS
- Monitor Google Search Console for indexing improvements
- Verify PostHog events flowing

---

## 12. Risk Areas & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Translation system complexity** — current i18n deeply integrated with i18next | High | Create server-side `getTranslations()` returning plain objects. For Client Components, pass dictionaries as props with simple `t(key)` lookup. |
| **SEO template field mapping** — `{f:fieldName}` interpolation must produce identical output | High | Port pure functions as-is. Write comparison script: run old resolver + new resolver on same URLs, diff results. |
| **800 pages at build time** — could hit Vercel build limits | Medium | Use ISR (`dynamicParams: true`) for less-important pages. Only `generateStaticParams` for top ~200 pages. Rest render on-demand and cache. |
| **Vehicle URL patterns per language** — duplicate route folders | Low | Both folders import same component. Small maintenance cost for explicit routing. |
| **Google Maps in SSR** — `@vis.gl/react-google-maps` may break server-side | Medium | Use `next/dynamic` with `ssr: false` for PlaceAutocomplete. Already client-only in current app. |
| **URL continuity** — any broken URL = SEO damage | Critical | Map every route from current `App.tsx` to new file-based routes. Test with full URL list from sitemaps before cutover. |
| **Directus auth for assets** — if assets need token, can't use direct URLs | Low | Check if assets are public. If not, keep proxy route as fallback. |
| **PostHog SPA behavior** — current config assumes SPA pageview tracking | Low | `@posthog/next` handles App Router navigation events. Update config. |
| **Directus as form storage** — all form data flows through Directus REST API, no direct DB | Low | `directus-storage.ts` already handles race conditions (409 on session create) and retries on 503. Port as-is. Directus provides built-in admin UI for viewing submissions. |

---

## 13. Verification Plan

1. **Build:** `next build` completes without errors, all static pages generated
2. **URL parity:** Generate URL list from current sitemaps, `curl` each on preview deployment, verify 200 status
3. **SEO parity:** Compare `<head>` content (title, description, OG, hreflang, JSON-LD) between old and new for 20 representative URLs
4. **Redirects:** Test all WordPress legacy URLs return correct 301s
5. **Forms:** Submit quote and contact forms on preview, verify Directus persistence (form_sessions, form_users, form_submissions collections) + webhook delivery. Confirm `environment` field is `"development"` on preview and `"production"` after cutover.
6. **Images:** Verify Next.js Image optimization working (check response headers for `content-type: image/webp`)
7. **Lighthouse:** Run on Home, Blog post, Vehicle detail — target LCP < 2.5s, CLS < 0.1
8. **Language switching:** Navigate between fr/de/en on all page types
9. **Sitemaps:** Validate XML structure and URL count matches current
10. **Webhooks:** Trigger Directus content update, verify page revalidates

---

## Key Files to Reuse (from current codebase)

| Current File | Reuse Strategy |
|---|---|
| `server/directus.ts` | Port `directusFetch()` — add Next.js cache options |
| `server/directus-storage.ts` | Port as-is — form sessions/users/submissions via Directus REST API. Tags records with `environment` field derived from `NODE_ENV`. |
| `server/routes/cms.ts` | Port `buildItemsQuery()` and field definitions |
| `server/seo/seoResolver.ts` | Port pure functions (resolve, merge, interpolate) |
| `server/seo/jsonLd.ts` | Copy as-is (pure functions) |
| `server/seo/webhookHandler.ts` | Port `resolveAffectedPaths()` for revalidation |
| `server/sitemap/*.ts` | Port registry functions |
| `server/middleware/wp-redirects.ts` | Port redirect rules to next.config.ts + middleware |
| `client/src/lib/i18n.ts` | Port `flattenTranslations()` for server-side dictionaries |
| `client/src/lib/localeMap.ts` | Copy locale mapping |
| `client/src/lib/slugMapping.ts` | Port for language switcher |
| `client/src/hooks/use-form-telemetry.ts` | Port as Client Component hook — now uses `posthog.capture()` instead of server API |
| `client/src/components/ui/*` | Copy as-is (shadcn/ui, framework-agnostic) |
| `client/src/components/quote/*` | Port as Client Components (minimal changes) |
| `shared/validation.ts` | Copy as-is (Zod validation schemas) |
| `shared/types.ts` | Copy as-is (plain TS interfaces for Directus collections — FormSession, FormUser, FormSubmission, Locality). FormSession and FormSubmission include `environment` field. |
