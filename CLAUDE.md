# CLAUDE.md

## Project Overview

easyRecharge is a Swiss EV charging station installation marketplace. This is the Next.js App Router migration from a React SPA + Express backend (source at github.com/yowbst/eRv2-with-Directus). Deployed on Vercel.

## Commands

```
npm run dev          # Dev server on port 3000
npm run build        # Production build (generates ~800 static pages)
npm run start        # Run production build
npm run lint         # ESLint
```

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5
- **Styling:** Tailwind CSS 4, shadcn/ui (new-york style), Radix UI
- **CMS:** Directus (content, routing, i18n, form storage) — no local DB
- **Analytics:** PostHog (`@posthog/next` + `posthog-js`) — client-side events only
- **Forms:** react-hook-form + Zod 4 validation
- **Animation:** Framer Motion, Embla Carousel
- **Phone:** libphonenumber-js (validation + international formatting)
- **Maps:** `@vis.gl/react-google-maps` (PlaceAutocomplete, loaded via `next/dynamic` with `ssr: false`)
- **Themes:** next-themes (dark mode)
- **Icons:** Lucide React + react-icons/si (vehicle brand logos)
- **API docs:** swagger-ui-react at `/api-docs`
- **Deployment:** Vercel

## Environment Variables

Required in `.env.local` (not committed):
```
DIRECTUS_URL=https://cms.easyrecharge.ch
DIRECTUS_STATIC_TOKEN=<token>
SITE_URL=https://easyrecharge.ch
DIRECTUS_WEBHOOK_SECRET=<secret>
NEXT_PUBLIC_POSTHOG_API_KEY=<key>
NEXT_PUBLIC_POSTHOG_HOST=<host>
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<key>
```

Optional: `DIRECTUS_LOCALITIES_COLLECTION` (defaults to "localities")

## Design System

Swiss-inspired. Primary Electric Blue HSL(200 90% 50%) used sparingly.
Fonts: Montserrat (headings), Open Sans (body), JetBrains Mono (specs/data).
Dark mode supported. WCAG 2.1 AA compliance required.

---

## Architecture

### Routing — Generic Dynamic Segments

Routes use a generic resolver pattern, NOT explicit per-type folders:

```
src/app/
  [lang]/
    page.tsx                          # Home (fr/de)
    [slug]/
      page.tsx                        # CMS pages, blog listing, vehicles listing, quote, contact
    [slug]/[sub1]/
      page.tsx                        # Vehicle detail, vehicle brands listing, quote success/submission
    [slug]/[sub1]/[sub2]/
      page.tsx                        # Blog post, vehicle brand detail, vehicle model detail
```

**Route resolution** is in `src/lib/route-resolver.ts`. Each page calls `resolveSlugRoute()`, `resolveSub1Route()`, or `resolveSub2Route()` which looks up the Directus page registry to determine the page type, then renders the appropriate component.

Route types per level:
- **[slug]:** `cms-page | quote | contact | blog-listing | vehicles-listing`
- **[slug]/[sub1]:** `vehicle-detail | vehicle-brands | blog-listing | quote-success | quote-submission`
- **[slug]/[sub1]/[sub2]:** `blog-post | vehicle-brand-detail | vehicle-model-detail`

### Server vs Client Components

**Server Components (default):** All pages, Header, Footer, layout. Data fetched directly from Directus via `directusFetch()`.

**Client Components ("use client"):** QuoteForm, ContactForm, MiniQuoteForm, MiniQuoteCard, SwissMap, CookieBanner, PostHogProvider, LanguageSwitcher, ThemeToggle, VehicleDetailClient, VehicleFilters, PlaceAutocomplete, carousels.

**Pattern:** Server Component fetches data and passes serializable props to Client Component islands.

### Middleware

`middleware.ts` at project root handles:
1. Root `/` → 301 redirect to `/fr`
2. WordPress infrastructure paths → 410 Gone (`/wp-admin`, `/wp-login.php`, `/wp-content/`, etc.)
3. Trailing slash removal (301 redirect, except lang roots `/fr/`, `/de/`)
4. Attribution cookie middleware — mirrors ad click URL params (gclid, fbclid, msclkid, etc.) into server-set cookies to bypass Safari ITP 7-day JS cookie limit

WordPress 301 redirects (legacy URLs) are in `next.config.ts` `redirects()`.

---

## Directus Integration

### Data Fetching

All CMS data is fetched server-side via `src/lib/directus.ts`:
- `directusFetch(path, init)` — authenticated fetch with `Bearer` token, adds `next: { revalidate }` for ISR
- No client-side CMS fetching — Server Components call Directus directly
- The old Express proxy routes (`/api/cms/layout`, `/api/cms/pages/:id`, etc.) are **removed** — replaced by direct server component fetching

### Key Query Functions (`src/lib/directus-queries.ts`)

| Function | Data | Revalidation |
|---|---|---|
| `fetchLayout(locale)` | Header, footer, nav, global config | 60s |
| `fetchPage(routeId, locale)` | Page with blocks + translations | 60s |
| `fetchPageRegistry()` | All pages with route_id + slugs | 60s |
| `fetchBlogPosts(locale)` | Published blog posts | 300s |
| `fetchBlogPost(slug, locale)` | Single blog post | 300s |
| `fetchVehicles(locale)` | All published vehicles | 300s |
| `fetchVehicle(slug, locale)` | Single vehicle | 300s |
| `fetchVehicleBrands(locale)` | All vehicle brands | 300s |

### Page Registry

Directus `pages` collection drives routing. Each page has:
- `route_id` (e.g., "home", "blog", "vehicles", "quote", "contact")
- `translations[].slug` per language (e.g., fr: "vehicules", de: "fahrzeuge")
- `translations[].seo` — SEO fields (title, description, image, noIndex)
- `blocks[]` — M2A blocks (hero, FAQ, features, etc.)

`fetchPageRegistry()` returns all published pages with their slugs per language. The route resolver matches URL segments against these slugs.

### Form Storage (`src/lib/directus-storage.ts`)

Forms persist to Directus via REST API (no local DB):
- `form_sessions` — session token, form type, locale, PostHog IDs, user agent
- `form_users` — email, first/last name, phone (create or update)
- `form_submissions` — session ref, user ref, form data, status
- Each record tagged with `environment` field ("development" | "staging" | "production") based on env

### ISR Revalidation

- **Time-based:** Content pages 60s, blog/vehicles 300s
- **On-demand:** `POST /api/webhooks/directus` receives Directus webhook events, calls `revalidatePath("/", "layout")` to invalidate affected pages

### Directus Assets

Assets require auth (403 without token). The proxy route `GET /api/cms/assets/[id]` forwards the auth token. All OG images and SEO images use this proxy path (`/api/cms/assets/{uuid}`), NOT direct Directus URLs.

For in-page images rendered via `<Image>`, use `cmsImage()` from `src/lib/directusAssets.ts` or the proxy URL.

---

## SEO Implementation

### Architecture

SEO is split into three layers:
1. **`src/lib/seo/resolver.ts`** — Pure helper functions (no framework deps)
2. **`src/lib/seo/metadata.ts`** — Converts `SeoData` → Next.js `Metadata` object
3. **`src/lib/seo/jsonLd.ts`** — JSON-LD structured data builders
4. **Each page's `generateMetadata()`** — Orchestrates the above

### SEO Data Flow

```
Directus page.translations[].seo   →   extractItemSEO()
                                            ↓
Template SEO + Item SEO             →   mergeItemOverTemplate()   (item wins)
                                            ↓
{f:fieldName} placeholders          →   resolveSEOFieldMappings() (interpolate fieldMap)
                                            ↓
SeoData object                      →   buildMetadata()           (Next.js Metadata)
```

### Template + Field Map Pattern

Directus SEO fields can contain `{f:fieldName}` or `{field:fieldName}` placeholders. Each page type builds a `fieldMap` with content-specific values:

| Page Type | Template route_id | FieldMap Keys |
|---|---|---|
| Home | `"home"` | (none) |
| Blog post | `"blog-post"` | title, excerpt, category, slug, readingTime, image, takeaways |
| Vehicle detail | `"vehicle"` | brand, model, name, slug, battery, range, efficiency, acPower, dcPower, chargeTime, dcTime, chargePort, rangeMin, rangeMax, acceleration, topSpeed, power |
| Vehicle brand | `"vehicle-brand"` | name, count, slug |
| Vehicle brands listing | `"vehicle-brands"` | count, vehicles |
| Vehicles listing | `"vehicles"` | count, brands |
| Generic CMS page | (by route_id) | (none) |

### OG Image Resolution

Three-tier priority (in `resolveOgImage()`):
1. SEO image field from resolved CMS SEO
2. Content-specific image (blog post image, vehicle thumbnail, brand thumbnail)
3. Hero block image from template page

All images go through `/api/cms/assets/{uuid}` proxy (Directus assets require auth).

### Key Functions

- `normalizeTitle(raw)` — strips existing brand suffix, truncates to ~45 chars, appends " | easyRecharge"
- `truncate(text, 155)` — word-boundary truncation for descriptions
- `extractItemSEO(seoRaw)` — safely extracts CmsSEO from Directus, handles field name variants (noIndex/no_index, description/meta_description, image/og_image)
- `mergeItemOverTemplate(item, template)` — item fields override template, noIndex uses null-coalescing
- `resolveSEOFieldMappings(seo, fieldMap)` — resolves `{f:x}` placeholders, cleans up whitespace/punctuation artifacts
- `buildAlternates(langPaths)` — builds hreflang array from `{ fr: "/fr/...", de: "/de/..." }`

### noIndex

Pages can be flagged `noIndex: true` in their Directus SEO object. This flows through the entire SEO chain and results in `<meta name="robots" content="noindex, nofollow">`.

### JSON-LD

Generated per page type in Server Components via `<script type="application/ld+json">`:
- **Home:** Organization + WebSite
- **Blog post:** BlogPosting
- **Vehicle:** Product
- **FAQ pages:** FAQPage
- **All pages:** BreadcrumbList

---

## i18n

### Languages

French (`fr`, locale `fr-FR`) and German (`de`, locale `de-DE`). No English yet.

### How It Works

- **No i18next** — translations come from Directus, used as plain objects
- Server Components fetch translations via `fetchPage(routeId, locale)` → `extractPageDictionary()`
- Client Components receive a `dictionary` prop with a simple `t(key)` lookup function
- `slugToDirectusLocale(lang)` converts URL lang to Directus locale code
- `getRouteSlug(lang, routeType)` returns language-specific URL segments (e.g., "vehicules"/"fahrzeuge", "marques"/"marken")

### SLA Interpolation

Dictionary strings can contain `{quote_request_duration}`, `{first_contact}`, `{quote_delivery_timeline}` — these are pre-interpolated from `layoutData.global_config.slas` before passing to components.

### Language Switching

`LanguageSwitcher` component uses `convertPathToLanguage()` which looks up the page registry to map slugs between languages.

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/quote` | POST | Quote form → Directus + webhook |
| `/api/contact` | POST | Contact form → Directus + webhook |
| `/api/form-submissions/[id]` | GET | Retrieve submission (QuoteSuccess page) |
| `/api/cms/localities` | GET | Swiss locality search (autocomplete) |
| `/api/cms/assets/[id]` | GET | Directus asset proxy (auth required) |
| `/api/webhooks/directus` | POST | ISR revalidation on content changes |
| `/api/docs` | GET | OpenAPI 3.0 spec (JSON) |
| `/api/debug/urls` | GET | List all generated URLs by type |
| `/api-docs` | — | Swagger UI (interactive docs page) |

Form submission routes create a session → user → submission chain in Directus, then fire a webhook to an external handler URL (configured in Directus `site_settings.global_config.webhooks`).

---

## Key Files Reference

### Lib
| File | Purpose |
|---|---|
| `lib/directus.ts` | Authenticated Directus fetch with ISR cache |
| `lib/directus-queries.ts` | Typed query functions for all collections |
| `lib/directus-storage.ts` | Form session/user/submission persistence |
| `lib/route-resolver.ts` | URL → page type resolution (SlugRoute, Sub1Route, Sub2Route) |
| `lib/vehicleTransformer.ts` | Raw Directus vehicle → UI Vehicle interface |
| `lib/pageConfig.ts` | Route ID resolution, route link builders |
| `lib/attribution.ts` | Client-side cookie reading for ad attribution |
| `lib/consent.ts` | Cookie consent state |
| `lib/phone-utils.ts` | Phone number parsing utilities |
| `lib/i18n/config.ts` | Language codes, locale mapping, route slugs |
| `lib/i18n/dictionaries.ts` | Server-side translation extraction + `t()` lookup |
| `lib/i18n/slug-mapping.ts` | Cross-language URL mapping |
| `lib/seo/resolver.ts` | SEO pure functions (extract, merge, interpolate, image URL) |
| `lib/seo/metadata.ts` | SeoData → Next.js Metadata converter |
| `lib/seo/jsonLd.ts` | JSON-LD schema builders |
| `lib/sitemap/registries.ts` | URL entry generators for sitemap (CMS, blog, vehicles) |

### Components
| Component | Type | Purpose |
|---|---|---|
| `Header.tsx` | Server | Nav with language switcher, theme toggle, mobile menu |
| `Footer.tsx` | Server | Footer links, company info |
| `Hero.tsx` | Server | Hero section with image/text |
| `quote/QuoteForm.tsx` | Client | 7-step form wizard (~1800 LOC) |
| `ContactForm.tsx` | Client | Contact form with address autocomplete |
| `MiniQuoteForm.tsx` | Client | Compact embedded quote form |
| `MiniQuoteCard.tsx` | Client | Quote CTA card |
| `SwissMap.tsx` | Client | Interactive SVG canton map |
| `BlogListing.tsx` | Client | Blog post grid |
| `VehiclesHub.tsx` | Client | Vehicle listing with filters |
| `VehicleBrandDetail.tsx` | Server | Brand detail with vehicle specs |
| `CookieBanner.tsx` | Client | GDPR consent with framer-motion |
| `PostHogProvider.tsx` | Client | Analytics provider |

---

## Conventions

### Code Style
- Server Components by default; only add "use client" when interactive behavior is needed
- ESLint config in project; run `npm run lint` before committing
- Prefer `directusFetch()` over raw `fetch()` for Directus calls (handles auth, typing, ISR)
- Use `cmsImage()` or `/api/cms/assets/{id}` for Directus images (never direct Directus URLs — they require auth)
- `// eslint-disable-next-line @typescript-eslint/no-explicit-any` is used where Directus response types are untyped

### Adding a New Page
1. Add the page in Directus with a `route_id` and translated slugs
2. It will automatically resolve via the `[slug]` catch-all
3. If it needs special rendering (not just CMS blocks), add a case in `[slug]/page.tsx`
4. Add `generateMetadata` with template SEO + fieldMap if the page has dynamic content
5. If it needs a sub-route, add resolution logic in `route-resolver.ts`

### Adding SEO to a Page
1. Fetch the template page: `fetchPage("route-id", locale)`
2. Extract template SEO: `extractItemSEO(page.translations[0].seo)`
3. Extract item SEO if applicable: `extractItemSEO(item.translations[0].seo)`
4. Merge: `mergeItemOverTemplate(itemSeo, templateSeo)`
5. Build fieldMap with content values
6. Resolve: `resolveSEOFieldMappings(merged, fieldMap)`
7. Build OG image: `resolveOgImage(resolved, contentImage, heroImage)`
8. Return: `buildMetadata({ title: normalizeTitle(...), description: truncate(...), ... })`
