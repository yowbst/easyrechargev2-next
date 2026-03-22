# Prompt: 1:1 Port of Vehicles Hub Page from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page (use as reference for patterns)

## Source & Target

- **Source page**: `/tmp/eRv2-source/client/src/pages/Vehicles.tsx` (573 lines)
- **Source components**:
  - `/tmp/eRv2-source/client/src/components/VehicleCard.tsx` (212 lines) — **needs creating**
  - `/tmp/eRv2-source/client/src/components/VehicleFilters.tsx` (386 lines) — **needs creating**
  - `/tmp/eRv2-source/client/src/components/MiniQuoteWidget.tsx` (335 lines) — **needs creating**
- **Target**: Dispatched from `src/app/[lang]/[slug]/page.tsx` when `routeId === "vehicles"`. Check if `fetchVehicles` exists in `src/lib/directus-queries.ts`.

## Task

Port the Vehicles hub page to match the source **exactly** — same filter sidebar, same vehicle card grid, same search, same MiniQuoteWidget CTA.

### Step 1: Read everything first
1. Read source `pages/Vehicles.tsx` completely (573 lines)
2. Read source `components/VehicleCard.tsx`, `VehicleFilters.tsx`, `MiniQuoteWidget.tsx`
3. Read the current dispatch in `[slug]/page.tsx` for vehicles
4. Check `fetchVehicles` in `src/lib/directus-queries.ts`
5. Check if any vehicle components already exist in Next.js

### Step 2: Create missing components first

**VehicleCard.tsx** (212 lines in source):
- Vehicle image, brand, model, battery, range, connector type
- Link to vehicle detail page
- Adapt: wouter Link → next/link, asset URLs, translations

**VehicleFilters.tsx** (386 lines in source):
- Brand filter, connector type, range slider, search
- This is a **client component** (`"use client"`) — has state for filter values
- Adapt: translations via dictionary prop, controlled inputs

**MiniQuoteWidget.tsx** (335 lines in source):
- Similar to MiniQuoteForm but for inline contexts (not hero)
- Simplified quote CTA with housing status + locality
- Adapt same patterns as MiniQuoteForm (already ported)

### Step 3: Port the page
- Filter state management
- Vehicle data (server-fetched, client-filtered or all client)
- Pagination or infinite scroll
- MiniQuoteWidget placement between vehicle rows

## Adaptation reference

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props |
| `<Link href>` from wouter | `<Link href>` from next/link |
| `useDirectusPage()` for page data | Server-side fetch, passed as props |
| `useLocation()` + query params | `useSearchParams()` from next/navigation |
| `/api/cms/assets/{uuid}` | `${DIRECTUS_URL}/assets/${uuid}` |
| `MiniQuoteWidget` with `useLayout()` | Pass SLA data as `tOptions` prop (same pattern as MiniQuoteForm) |

## Critical lessons (from Home & Quote ports)

### Hydration — never read `window` in `useState` initializers
Filter state from URL params must use `useEffect`:
```tsx
const [filters, setFilters] = useState(defaultFilters);
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  // update filters from params
}, []);
```

### Server vs Client split
- Server page: fetch all vehicles + page data + dictionary
- Client component: VehicleFilters + VehicleCard grid (filtering is interactive)
- Or: fetch all vehicles server-side, pass to client component for client-side filtering

### Image sizing
```tsx
// Vehicle card images: ~300px wide in grid
cmsImage(src, [300, 450, 600], { quality: 80 })
```

## Checklist

- [ ] Read source Vehicles.tsx completely
- [ ] Read source VehicleCard.tsx, VehicleFilters.tsx, MiniQuoteWidget.tsx
- [ ] Read current Next.js vehicles dispatch
- [ ] Create VehicleCard component
- [ ] Create VehicleFilters component
- [ ] Create MiniQuoteWidget component (or adapt MiniQuoteForm)
- [ ] Port the vehicles hub page (1:1)
- [ ] Wire up in `[slug]/page.tsx` with correct props
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Test: filters work, cards link to detail, pagination works
- [ ] Visual comparison — should look identical to source
