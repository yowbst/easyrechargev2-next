# Prompt: 1:1 Port of Blog Post Page from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page (use as reference for patterns)

## Source & Target

- **Source**: `/tmp/eRv2-source/client/src/pages/BlogPost.tsx` (496 lines)
- **Target**: `src/app/[lang]/[slug]/[sub1]/page.tsx` — dispatches based on route. Blog posts are at `/{lang}/{blogSlug}/{categorySlug}/{postSlug}` which maps to `[slug]/[sub1]/page.tsx` or `[slug]/[sub1]/[sub2]/page.tsx` depending on nesting.

**Important**: Check the source routing to understand the URL structure. Blog post URLs may be `/{lang}/{blogSlug}/{categorySlug}/{postSlug}` (3 segments after lang) — this would map to `[slug]/[sub1]/[sub2]/page.tsx`.

## Task

Port the Blog Post page to match the source **exactly** — same article layout, same rich content rendering, same TOC, same related posts, same metadata.

### Step 1: Read everything first
1. Read source `pages/BlogPost.tsx` completely
2. Read current `[slug]/[sub1]/page.tsx` and `[slug]/[sub1]/[sub2]/page.tsx`
3. Read any existing blog post rendering components
4. Check how blog post data is fetched in `src/lib/directus-queries.ts`

### Step 2: Key areas to match
- **Article layout**: Title, author, date, reading time, category badge, hero image
- **Rich content body**: HTML from CMS — rendered with `dangerouslySetInnerHTML`
- **Table of contents (TOC)**: If source generates a sidebar TOC from headings
- **Related posts**: Cards at bottom showing related articles
- **Social sharing**: Share buttons if present
- **MiniQuoteCard/Widget**: CTA between sections or in sidebar
- **JSON-LD**: Article structured data for SEO
- **Breadcrumbs**: Navigation breadcrumbs

## Adaptation reference

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props |
| `<Link href>` from wouter | `<Link href>` from next/link |
| `useDirectusPage()` for post data | Server-side fetch, passed as props |
| `/api/cms/assets/{uuid}` | `${DIRECTUS_URL}/assets/${uuid}` |
| `parseReadingTime()` | Port from source or use existing util |
| HTML content links (`/fr/page`) | Use `resolveRouteLinks(html, lang, pageRegistry)` |

## Critical lessons (from Home & Quote ports)

### Raw Directus strings bypass interpolation
If blog post content or metadata contains `{var}` placeholders, apply interpolation manually.

### Image sizing
```tsx
// Hero image: full width
cmsImage(src, [640, 1024, 1920], { quality: 80 })
// Related post cards: ~350px
cmsImage(src, [350, 500, 700], { quality: 80 })
```

### Rich HTML content with internal links
Blog post body may contain links to other pages using Directus route IDs. Use:
```tsx
import { resolveRouteLinks } from "@/lib/pageConfig";
const safeHtml = resolveRouteLinks(post.body, lang, pageRegistry);
```

### Server component
Blog post is read-only content — should be a **server component** (no `"use client"`).
Only interactive parts (TOC scroll spy, share buttons) need client components.

## Checklist

- [ ] Read source BlogPost.tsx completely
- [ ] Read current Next.js blog post rendering
- [ ] Identify article layout, TOC, related posts, JSON-LD
- [ ] Port the blog post page (1:1)
- [ ] Wire up in the correct `[sub1]` or `[sub2]` page with routing
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Test: article renders, TOC works, related posts link correctly
- [ ] Visual comparison — should look identical to source
