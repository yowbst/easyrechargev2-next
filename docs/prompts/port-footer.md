# Prompt: 1:1 Port of Footer from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page (use as reference for patterns)

## Source & Target

- **Source**: `/tmp/eRv2-source/client/src/components/Footer.tsx` (323 lines)
- **Target**: `src/components/Footer.tsx` (already exists, 237 lines)
- **Rendered by**: `src/app/[lang]/layout.tsx` — receives `lang`, `layoutData`, `dictionary`, `pageRegistry`

## Task

Compare source Footer with existing Next.js Footer. Fix any differences so the Next.js version matches the source **exactly** — same columns, same links, same legal text, same social icons.

## What to check

1. **Column layout**: Same number of columns? Same groupings?
2. **Link sections**: All link groups present? (Services, Company, Legal, etc.)
3. **Social icons**: Same platforms, same URLs?
4. **Logo & tagline**: Present and matching?
5. **Legal/copyright**: Same text, same year logic?
6. **Newsletter signup**: If source has one, is it ported?
7. **Trustpilot/ratings widget**: If present in source
8. **Contact info**: Phone, email, address if shown

## Adaptation reference

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props |
| `<Link href>` from wouter | `<Link href>` from next/link |
| `resolveRouteId("page-id", lang)` | `resolveRouteId(id, lang, pageRegistry)` |
| `useLayout()` for global config | `layoutData` prop from server layout |
| `/api/cms/assets/{uuid}` | `${DIRECTUS_URL}/assets/${uuid}` or pass as prop |

## Critical lessons (from Home & Quote ports)

### Missing translation key detection
`t(dictionary, key)` returns the raw key when missing. Check: `val === key || val.startsWith("[")`

### Route resolution
```tsx
import { resolveRouteId } from "@/lib/pageConfig";
const href = resolveRouteId("quote", lang, pageRegistry); // "/fr/demande-devis"
```

### Server vs Client
Footer is mostly static links — can be a **server component** (no `"use client"`).
Only add `"use client"` if it has interactive elements.

## Checklist

- [ ] Read source Footer.tsx completely
- [ ] Read current Next.js Footer.tsx completely
- [ ] Compare columns, links, social icons, legal text
- [ ] Fix all differences
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Visual comparison — should look identical to source
