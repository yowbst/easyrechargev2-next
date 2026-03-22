# Prompt: 1:1 Port of Remaining Pages from Source to Next.js

## Context

We are migrating easyRecharge from a React SPA (Vite + Express on Replit) to Next.js App Router (on Vercel).

- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory

**Already ported (1:1)**: Home page, Quote page.
**Next.js routing**: uses `[lang]/[slug]/[sub1]/[sub2]` catch-all pattern. The `[slug]/page.tsx` already dispatches to Quote, Contact, Blog, VehicleBrands based on `pageRegistry` route IDs.

## Pages to port

Port each page below as a **1:1 match** of the source — same structure, same UI, same behavior. Not a redesign.

### Tier 1 — Key pages (port first)

| Page | Source file | Lines | Next.js target | Notes |
|------|-------------|-------|-----------------|-------|
| Header | `components/Header.tsx` | 247 | `src/components/Header.tsx` (188L) | Already exists — compare & fix |
| Footer | `components/Footer.tsx` | 323 | `src/components/Footer.tsx` (237L) | Already exists — compare & fix |
| Contact | `pages/Contact.tsx` | 730 | Rendered from `[slug]/page.tsx` | Form + telemetry + PostHog |
| Blog listing | `pages/Blog.tsx` | 582 | `src/components/BlogListing.tsx` | Category tabs, pagination |
| Blog post | `pages/BlogPost.tsx` | 496 | `[slug]/[sub1]/page.tsx` | Rich content, TOC, related posts |

### Tier 2 — Vehicle pages

| Page | Source file | Lines | Next.js target | Notes |
|------|-------------|-------|-----------------|-------|
| Vehicles hub | `pages/Vehicles.tsx` | 573 | `[slug]/page.tsx` dispatch | Filters, card grid, MiniQuoteWidget |
| Vehicle brands | `pages/VehicleBrands.tsx` | 307 | `[slug]/page.tsx` dispatch | Brand grid |
| Vehicle brand | `pages/VehicleBrand.tsx` | 421 | `[slug]/[sub1]/page.tsx` | Brand detail + model list |
| Vehicle detail | `pages/VehicleDetail.tsx` | 1194 | `[slug]/[sub1]/[sub2]/page.tsx` | Specs, gallery, MiniQuoteCard |

### Tier 3 — Supporting pages

| Page | Source file | Lines | Notes |
|------|-------------|-------|-------|
| ContentPage | `pages/ContentPage.tsx` | 191 | Generic CMS rich-text page |
| DynamicPage | `pages/DynamicPage.tsx` | 200 | Block-based page renderer |
| QuoteSuccess | `pages/QuoteSuccess.tsx` | 170 | Post-submission confirmation |
| QuoteSubmissionView | `pages/QuoteSubmissionView.tsx` | 483 | Quote review before submit |

### Key shared components

| Component | Source file | Lines | Next.js exists? | Notes |
|-----------|-------------|-------|-----------------|-------|
| BlogCard | `components/BlogCard.tsx` | 118 | Yes | Compare props |
| VehicleCard | `components/VehicleCard.tsx` | 212 | No | Create |
| VehicleFilters | `components/VehicleFilters.tsx` | 386 | No | Create — client component |
| MiniQuoteWidget | `components/MiniQuoteWidget.tsx` | 335 | No | Like MiniQuoteForm but for non-hero contexts |
| MiniQuoteCard | `components/MiniQuoteCard.tsx` | 353 | Yes (188L) | Compare & update |

---

## Methodology (proven on Home & Quote ports)

### Step 1: Read everything first

1. Read the **source** file completely (chunk by chunk if > 500 lines)
2. Read the **current Next.js target** file(s)
3. Read every sub-component the source imports — check if they already exist in Next.js, and compare prop interfaces
4. Read the parent layout/page to understand what props/data are available server-side

### Step 2: Identify adaptations needed

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props from server page |
| `t(key, { var: val })` interpolation | `t(dictionary, key, { var: val })` — 3rd arg is `vars` |
| `import.meta.env.VITE_*` | `process.env.NEXT_PUBLIC_*` |
| `useLocation()` from wouter | `usePathname()` from next/navigation |
| `setLocation(path)` from wouter | `router.push(path)` from next/navigation |
| `<Link href>` from wouter | `<Link href>` from next/link |
| `useSEO()`, `usePageRegistry()` | Server-side `generateMetadata()` |
| `useLanguageReady()`, `usePrerenderReady()` | Remove — SSR handles this |
| `useDirectusPage()`, `useLayout()` | Data fetched server-side, passed as props |
| `resolveRouteId("page-id", lang)` | `resolveRouteId(id, lang, pageRegistry)` — pass registry |
| `getPageMetaById(id)` | `pageRegistry.find(p => p.id === id)` |
| `import img from "@assets/..."` | Static files in `/public/` or CMS URLs as props |
| `/api/cms/assets/{uuid}` | `${DIRECTUS_URL}/assets/${uuid}` |
| `cmsBgImage(src)` | `cmsBgImage(src)` from `@/lib/directusAssets` |
| `cmsImage(src, widths)` | `cmsImage(src, widths)` from `@/lib/directusAssets` |
| `getPostHogIds()` | `ph?.get_distinct_id()` / `ph?.get_session_id()` |
| `usePostHog()` from `@posthog/react` | `usePostHog()` from `posthog-js/react` |
| `useFormTelemetry()` | Port or adapt — check if already exists |
| `getI18nLocale(langSlug)` | `slugToDirectusLocale(lang)` from `@/lib/i18n/config` |

### Step 3: Update sub-components first

If the source uses props that the Next.js sub-component doesn't support yet, update the sub-component first. Don't change the page until its dependencies are ready.

### Step 4: Write the component

- Keep the exact same JSX structure, class names, conditional logic
- Adapt only framework-specific parts (i18n, routing, data fetching)
- Use `"use client"` only when the component has interactive elements (state, effects, event handlers)
- Server components are the default — prefer them for data fetching

### Step 5: Wire up in the parent page

For pages routed via `[slug]/page.tsx`:
- The router already dispatches based on `routeId` from `pageRegistry`
- Add a new case in the switch/conditional for the page
- Pass dictionary, layoutData, pageRegistry, lang as props

### Step 6: Type-check

Run `npx tsc --noEmit` after every major change. Fix errors immediately.

---

## Critical lessons from Home & Quote ports

### 1. Block translation content vs block root content

**WRONG**: `heroBlock?.content?.checks` — reads from block item's root `content`
**RIGHT**: `heroBlock?.translations?.[0]?.content?.checks` — reads from block translation's `content`

The dictionary is built from `bt.content` (block translation), not `item.content` (block config). When reading block data directly (not via dictionary), always use the translation.

### 2. Raw Directus strings bypass `t()` interpolation

When using `heroTranslation?.subheadline || t(dictionary, key)`, the Directus string may contain `{var}` placeholders that never get interpolated because it skips `t()`.

**Fix**: Always apply interpolation to raw strings too:
```tsx
const slaVars = { quote_request_duration: slas?.quote_request_duration?.value ?? 3 };
const rawText = translation?.subheadline || t(dictionary, key);
const text = Object.entries(slaVars).reduce(
  (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
  rawText,
);
```

### 3. Missing translation key detection

`t(dictionary, key)` returns the **raw key** when missing (e.g., `"pages.home.blocks.hero.title"`), not `[key]`. Check for missing keys:
```tsx
const val = t(dictionary, fullKey);
const isMissing = val === fullKey || val.startsWith("[");
```

### 4. Hydration — never read `window` in `useState` initializers

**Bad** (different server vs client value):
```tsx
const [step, setStep] = useState(() => {
  if (typeof window === "undefined") return 0;
  return parseInt(new URLSearchParams(window.location.search).get("step") ?? "0");
});
```

**Good**:
```tsx
const [step, setStep] = useState(0);
useEffect(() => {
  const s = parseInt(new URLSearchParams(window.location.search).get("step") ?? "0");
  if (!isNaN(s) && s !== 0) setStep(s);
}, []);
```

### 5. Image sizing — request what you render

`cmsImage(src, [400, 600])` requests max 600px, but if the container is wider on desktop the image is upscaled and pixelated. Match widths to actual rendered size:
```tsx
// Sidebar image in 2-col layout → max ~500px rendered
cmsImage(src, [480, 640, 800], { quality: 80 })

// Full-width hero → up to viewport width
cmsImage(src, [640, 1024, 1920], { quality: 80 })
```

### 6. Layout chrome (header/footer)

The `[lang]/layout.tsx` renders Header + Footer around all pages. Most pages use the standard layout.

For **immersive pages** (like Quote) that need their own header:
- Add `data-hide-layout` to the outermost div
- CSS in `globals.css` hides the parent header/footer
- Render your own focused header inside the component
- Pass `logoSrc`, `logoDarkSrc`, `pageRegistry` props

### 7. Dictionary building for blocks

`extractPageDictionary(routeId, page, locale)` automatically flattens:
- Page translation `content` → `pages.{routeId}.{path}`
- Block translation `content` → `pages.{routeId}.blocks.{blockKey}.{path}`
- Block `headline` → `pages.{routeId}.blocks.{blockKey}.title` (aliased)
- Block `subheadline` → `pages.{routeId}.blocks.{blockKey}.subtitle` (aliased)
- Block CTAs → `pages.{routeId}.blocks.{blockKey}.cta.label`
- Arrays of strings → `pages.{routeId}.blocks.{blockKey}.items.0`, `.1`, etc.
- Arrays of objects with `id` → `pages.{routeId}.blocks.{blockKey}.items.{id}.{field}`

Block key mapping: `getquote` → `get-quote`, `miniquote` → `mini-quote`

### 8. Route resolution

```tsx
import { resolveRouteId } from "@/lib/pageConfig";

// Resolve a route ID to a URL path
const href = resolveRouteId("quote", lang, pageRegistry); // → "/fr/demande-devis"

// Or manually
const entry = pageRegistry.find(p => p.id === "blog");
const blogSlug = entry?.slugs[lang] || "blog";
const href = `/${lang}/${blogSlug}`;
```

### 9. Server vs Client component split

- **Server** (default): data fetching, SEO metadata, dictionary building, JSON-LD
- **Client** (`"use client"`): forms, carousels, maps, autocomplete, anything with `useState`/`useEffect`

Pattern: Server page fetches data → passes props to client component:
```tsx
// page.tsx (server)
export default async function Page({ params }) {
  const data = await fetchData();
  return <ClientComponent data={data} dictionary={dictionary} />;
}

// ClientComponent.tsx
"use client";
export function ClientComponent({ data, dictionary }) { ... }
```

### 10. PostHog in client components

```tsx
import { usePostHog } from "posthog-js/react";
const ph = usePostHog();
ph?.capture("event_name", { ...properties });
```

---

## Checklist (per page)

- [ ] Read source file completely
- [ ] Read current Next.js target (if exists)
- [ ] Identify all sub-components — check existence and prop interfaces
- [ ] Update/create sub-components if needed
- [ ] Write the page component (1:1 port)
- [ ] Wire up in parent server page with correct props
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Test in browser — no hydration errors in console
- [ ] Visual comparison with source — should look identical
