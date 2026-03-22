# Prompt: 1:1 Port of DynamicPage from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page

## Source & Target

- **Source**: `/tmp/eRv2-source/client/src/pages/DynamicPage.tsx` (200 lines)
- **Target**: Rendered via `src/app/[lang]/[slug]/page.tsx` for CMS pages that use block-based layouts.

## Task

Port the DynamicPage — a block-based page renderer that dynamically renders CMS blocks (Hero, Features, FAQ, Testimonials, GetQuote, etc.) based on what's configured in Directus.

### Step 1: Read everything first
1. Read source `pages/DynamicPage.tsx` (200 lines)
2. Read the current `[slug]/page.tsx` to see if blocks are already handled
3. Understand which block components are already ported (Hero, Features, ProcessSteps, FAQ, Testimonials, GetQuote, GuideCarousel, SwissMap)

### Step 2: Key areas to match
- **Block renderer**: Loop through `page.blocks` and render the matching component for each
- **Block mapping**: `block_hero` → Hero, `block_features` → Features, etc.
- **Block props**: Each block extracts title, subtitle, image, config from its junction item
- **Dictionary**: `extractPageDictionary` already handles blocks

This is essentially a generalized version of the Home page — instead of hardcoding the block order, it reads it from CMS.

## Adaptation reference

Same as Home page — all block components already exist. The DynamicPage just needs to:
1. Fetch the page by slug
2. Loop through blocks
3. Render each block component with correct props

## Checklist

- [ ] Read source DynamicPage.tsx completely
- [ ] Read current `[slug]/page.tsx` for existing block handling
- [ ] Port block renderer logic
- [ ] Test with a CMS page that uses blocks
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Visual comparison — blocks render in correct order
