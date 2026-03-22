# Prompt: 1:1 Port of Vehicle Brand Detail Page from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page
- **Prerequisite**: VehicleCard component should exist (created during vehicles-hub port)

## Source & Target

- **Source**: `/tmp/eRv2-source/client/src/pages/VehicleBrand.tsx` (421 lines)
- **Target**: `src/app/[lang]/[slug]/[sub1]/page.tsx` — dispatches for vehicle brand pages at `/{lang}/{vehiclesSlug}/{brandSlug}`

## Task

Port the Vehicle Brand detail page to match the source **exactly** — brand hero, model list, specs summary.

### Step 1: Read everything first
1. Read source `pages/VehicleBrand.tsx` completely
2. Read current `[slug]/[sub1]/page.tsx` dispatch logic
3. Read VehicleCard component (should exist from vehicles hub port)
4. Check data fetching for vehicle brand + models

### Step 2: Key areas to match
- **Brand hero**: Logo, name, description
- **Model grid**: VehicleCards for all models of this brand
- **Sorting/filtering**: If models can be sorted
- **Breadcrumbs**: Vehicles > Brand Name
- **MiniQuoteWidget**: CTA section
- **JSON-LD**: Structured data if source has it
- **SEO metadata**: Brand-specific title/description

## Adaptation reference

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props |
| `<Link href>` from wouter | `<Link href>` from next/link |
| `/api/cms/assets/{uuid}` | `${DIRECTUS_URL}/assets/${uuid}` |
| Route params (brand slug) | `params.sub1` from page props |
| `useDirectusPage()` | Server-side fetch |

## Critical lessons (from Home & Quote ports)

### Image sizing
```tsx
// Brand logo: medium
cmsImage(src, [200, 400], { quality: 85 })
// Vehicle model cards: ~300px
cmsImage(src, [300, 450, 600], { quality: 80 })
```

### Server component
Brand detail with model grid is mostly static — **server component** unless filtering is interactive.

## Checklist

- [ ] Read source VehicleBrand.tsx completely
- [ ] Read current Next.js `[sub1]/page.tsx` dispatch
- [ ] Port brand detail page (1:1)
- [ ] Wire up routing in `[sub1]/page.tsx`
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Test: model cards link to detail, breadcrumbs correct
- [ ] Visual comparison — should look identical to source
