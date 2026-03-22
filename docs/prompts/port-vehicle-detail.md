# Prompt: 1:1 Port of Vehicle Detail Page from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page
- **Prerequisite**: VehicleCard component should exist (from vehicles-hub port)

## Source & Target

- **Source**: `/tmp/eRv2-source/client/src/pages/VehicleDetail.tsx` (1194 lines — the largest page!)
- **Target**: `src/app/[lang]/[slug]/[sub1]/[sub2]/page.tsx` — at `/{lang}/{vehiclesSlug}/{brandSlug}/{modelSlug}`

## Task

Port the Vehicle Detail page to match the source **exactly** — same specs table, same gallery, same MiniQuoteCard, same layout. This is the largest page — read in chunks.

### Step 1: Read everything first
1. Read source `pages/VehicleDetail.tsx` in chunks (0-400, 400-800, 800-1194)
2. Read source `components/MiniQuoteCard.tsx` (353 lines) — compare with existing Next.js version
3. Read current `[slug]/[sub1]/[sub2]/page.tsx`
4. Check vehicle detail data fetching in `src/lib/directus-queries.ts`

### Step 2: Key areas to match (this page is feature-rich)
- **Hero section**: Vehicle image, brand, model, key specs badges
- **Image gallery**: Multiple vehicle photos with thumbnails
- **Specs table**: Detailed technical specifications (battery, range, charging speeds, etc.)
- **Charging section**: Connector types, charging curves, time estimates
- **MiniQuoteCard**: Sticky CTA sidebar or inline card
- **Related vehicles**: Other models from same brand or similar specs
- **Breadcrumbs**: Vehicles > Brand > Model
- **JSON-LD**: Vehicle structured data (Product schema)
- **SEO**: Model-specific metadata

### Step 3: Create/update components
- **MiniQuoteCard** (`src/components/MiniQuoteCard.tsx` — 188L exists, source is 353L): Compare and update. It's used in vehicle detail as a sticky sidebar CTA. Check all props match.

## Adaptation reference

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props |
| `<Link href>` from wouter | `<Link href>` from next/link |
| `/api/cms/assets/{uuid}` | `${DIRECTUS_URL}/assets/${uuid}` |
| Route params (brand + model slug) | `params.sub1` (brand), `params.sub2` (model) |
| `useDirectusPage()` for vehicle data | Server-side fetch |
| `usePostHog()` from `@posthog/react` | `usePostHog()` from `posthog-js/react` |
| `getPostHogIds()` | `ph?.get_distinct_id()` / `ph?.get_session_id()` |
| Image gallery with state | Client component (`"use client"`) |

## Critical lessons (from Home & Quote ports)

### Block translation content vs block root content
**WRONG**: `block?.content?.field`
**RIGHT**: `block?.translations?.[0]?.content?.field`

### Raw Directus strings bypass interpolation
Always apply vars to raw CMS strings:
```tsx
const vars = { range: vehicle.range, battery: vehicle.battery };
const text = Object.entries(vars).reduce(
  (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)), raw);
```

### Hydration — never read `window` in `useState` initializers
Gallery state, active image index — initialize with defaults, update in `useEffect`.

### Image sizing
```tsx
// Vehicle hero image: large
cmsImage(src, [640, 1024, 1400], { quality: 85 })
// Gallery thumbnails: small
cmsImage(src, [100, 200], { quality: 75 })
// Related vehicle cards: ~300px
cmsImage(src, [300, 450, 600], { quality: 80 })
```

### Server vs Client split
This page is large — split wisely:
- **Server**: Data fetching, SEO metadata, JSON-LD, specs table, breadcrumbs
- **Client**: Image gallery (state for active image), MiniQuoteCard (PostHog events)

## Checklist

- [ ] Read source VehicleDetail.tsx completely (chunk by chunk)
- [ ] Read source MiniQuoteCard.tsx — compare with Next.js version
- [ ] Read current `[sub2]/page.tsx`
- [ ] Update MiniQuoteCard if props differ
- [ ] Port vehicle detail page (1:1)
- [ ] Wire up routing in `[sub2]/page.tsx`
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Test: specs table, gallery, MiniQuoteCard, related vehicles all work
- [ ] Visual comparison — should look identical to source
