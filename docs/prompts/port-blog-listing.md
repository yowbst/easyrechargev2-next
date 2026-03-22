# Prompt: 1:1 Port of Blog Listing Page from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page (use as reference for patterns)

## Source & Target

- **Source**: `/tmp/eRv2-source/client/src/pages/Blog.tsx` (582 lines)
- **Source component**: `/tmp/eRv2-source/client/src/components/BlogCard.tsx` (118 lines)
- **Target**: Currently dispatched from `src/app/[lang]/[slug]/page.tsx` when `routeId === "blog"`. Existing `src/components/BlogListing.tsx` and `src/components/BlogCard.tsx`.

## Task

Port the Blog listing page to match the source **exactly** — same category tabs, same card grid, same pagination, same filtering behavior.

### Step 1: Read everything first
1. Read source `pages/Blog.tsx` completely
2. Read source `components/BlogCard.tsx`
3. Read current `src/components/BlogListing.tsx` and `src/components/BlogCard.tsx`
4. Read the dispatch in `[slug]/page.tsx` for the blog case
5. Check `fetchBlogPosts` in `src/lib/directus-queries.ts` for data shape

### Step 2: Key areas to match
- **Category tabs/filters**: Horizontal tab bar for blog categories
- **Blog cards**: Image, title, excerpt, reading time, category badge, tag
- **Pagination**: Page numbers or load-more
- **Empty states**: When no posts in a category
- **Spotlight/featured posts**: If source has a featured post section
- **MiniQuoteWidget**: Source may render a CTA widget between posts
- **Blog link generation**: `/${lang}/${blogSlug}/${categorySlug}/${postSlug}`

## Adaptation reference

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props |
| `<Link href>` from wouter | `<Link href>` from next/link |
| `resolveRouteId("blog", lang)` | `pageRegistry.find(p => p.id === "blog")?.slugs[lang]` |
| `useLocation()` + URL params for filters | `useSearchParams()` from next/navigation or props |
| `/api/cms/assets/{uuid}` | `${DIRECTUS_URL}/assets/${uuid}` |
| `cmsBgImage()` / `cmsImage()` | Same functions from `@/lib/directusAssets` |
| `parseReadingTime()` | Already exists in `[lang]/page.tsx` — extract to shared util if needed |

## Critical lessons (from Home & Quote ports)

### Image sizing
Match `cmsImage` widths to actual rendered card size:
```tsx
// Blog card thumbnail: ~350px wide in grid
cmsImage(src, [350, 500, 700], { quality: 80 })
```

### Missing translation key detection
`t(dictionary, key)` returns raw key when missing. Check: `val === key || val.startsWith("[")`

### Server vs Client split
- Blog listing with filters/tabs → likely needs `"use client"` for interactivity
- Blog cards → can be server components if no interactivity
- OR: Server page fetches all posts + categories, client component handles filtering

## Checklist

- [ ] Read source Blog.tsx completely
- [ ] Read source BlogCard.tsx
- [ ] Read current Next.js BlogListing.tsx and BlogCard.tsx
- [ ] Compare category tabs, card layout, pagination
- [ ] Fix BlogCard if props differ
- [ ] Port BlogListing to match source exactly
- [ ] Wire up in `[slug]/page.tsx` with correct props
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Test: category filtering, pagination, card links all work
- [ ] Visual comparison — should look identical to source
