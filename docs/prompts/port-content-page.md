# Prompt: 1:1 Port of ContentPage from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page

## Source & Target

- **Source**: `/tmp/eRv2-source/client/src/pages/ContentPage.tsx` (191 lines)
- **Target**: Rendered via `src/app/[lang]/[slug]/page.tsx` for generic CMS pages (legal, privacy, terms, etc.)

## Task

Port the ContentPage — a generic CMS rich-text page renderer. Matches pages like Privacy Policy, Terms, About, etc. that have a simple title + body layout.

### Step 1: Read everything first
1. Read source `pages/ContentPage.tsx` (191 lines — small)
2. Read the current `[slug]/page.tsx` to see if there's already a content page fallback
3. Check how CMS page body content is fetched

### Step 2: Key areas to match
- **Title + subtitle**: From page translation
- **Rich text body**: HTML content from CMS, rendered with `dangerouslySetInnerHTML`
- **Internal links**: Process with `resolveRouteLinks()` for correct URLs
- **Breadcrumbs**: Simple Home > Page Name
- **No interactive elements**: This should be a pure **server component**

## Adaptation reference

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props |
| `useDirectusPage()` for body | Server-side fetch, body in dictionary or direct |
| HTML content links | `resolveRouteLinks(html, lang, pageRegistry)` |

## Checklist

- [ ] Read source ContentPage.tsx completely
- [ ] Read current `[slug]/page.tsx` fallback
- [ ] Port content page rendering (1:1)
- [ ] Test with a real CMS page (e.g., privacy policy)
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Visual comparison — should look identical to source
