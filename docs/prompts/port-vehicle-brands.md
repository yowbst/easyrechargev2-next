# Prompt: 1:1 Port of Vehicle Brands Page from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page

## Source & Target

- **Source**: `/tmp/eRv2-source/client/src/pages/VehicleBrands.tsx` (307 lines)
- **Target**: Dispatched from `src/app/[lang]/[slug]/page.tsx` when `routeId === "vehicle-brands"`. Check for existing `VehicleBrandsListView` in `src/lib/vehicles/shared.tsx`.

## Task

Port the Vehicle Brands page to match the source **exactly** — same brand grid, same logos, same links to individual brand pages.

### Step 1: Read everything first
1. Read source `pages/VehicleBrands.tsx` completely
2. Read current Next.js dispatch for vehicle-brands
3. Read any existing vehicle brand components (`src/lib/vehicles/shared.tsx`)
4. Check `fetchVehicleBrands` in `src/lib/directus-queries.ts`

### Step 2: Key areas to match
- **Brand grid**: Logo + name for each EV brand
- **Links**: Each brand links to `/{lang}/{vehiclesSlug}/{brandSlug}`
- **Sorting**: Alphabetical or by popularity?
- **Hero/header section**: Title, subtitle from CMS
- **MiniQuoteWidget**: If present as CTA
- **JSON-LD**: Structured data if source has it

## Adaptation reference

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props |
| `<Link href>` from wouter | `<Link href>` from next/link |
| `/api/cms/assets/{uuid}` | `${DIRECTUS_URL}/assets/${uuid}` |
| `resolveRouteId("vehicles", lang)` | `pageRegistry.find(p => p.id === "vehicles")?.slugs[lang]` |

## Critical lessons (from Home & Quote ports)

### Image sizing
```tsx
// Brand logos: small ~100-150px
cmsImage(src, [100, 200], { quality: 85 })
```

### Server component
Brand grid is static — should be a **server component**. No `"use client"` needed.

## Checklist

- [ ] Read source VehicleBrands.tsx completely
- [ ] Read current Next.js vehicle brands rendering
- [ ] Compare grid layout, brand cards, links
- [ ] Port to match source exactly
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Test: all brand links work correctly
- [ ] Visual comparison — should look identical to source
