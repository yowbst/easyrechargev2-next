# Prompt: 1:1 Port of Header from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page (use as reference for patterns)

## Source & Target

- **Source**: `/tmp/eRv2-source/client/src/components/Header.tsx` (247 lines)
- **Target**: `src/components/Header.tsx` (already exists, 188 lines)
- **Rendered by**: `src/app/[lang]/layout.tsx` — receives `lang`, `layoutData`, `dictionary`, `pageRegistry`

## Task

Compare source Header with existing Next.js Header. Fix any differences so the Next.js version matches the source **exactly** — same structure, same nav items, same mobile menu, same behavior. This is a 1:1 port, not a redesign.

## What to check

1. **Nav items**: Are all navigation links present? Same order? Same conditional visibility?
2. **Logo**: Source may use imported asset; Next.js should use CMS logo from `layoutData` or static file
3. **Language switcher**: Same behavior? Same link generation?
4. **Mobile menu**: Same hamburger menu, same animation, same items?
5. **Active nav state**: Does current page highlight correctly?
6. **CTA button**: Same "Get Quote" button in header?
7. **Theme toggle**: Present in both?
8. **Badge counts**: Source may show counts (e.g., blog post count) on nav items

## Adaptation reference

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props |
| `useLocation()` from wouter | `usePathname()` from next/navigation |
| `<Link href>` from wouter | `<Link href>` from next/link |
| `resolveRouteId("page-id", lang)` | `resolveRouteId(id, lang, pageRegistry)` |
| `getPageMetaById(id)` | `pageRegistry.find(p => p.id === id)` |
| `import logo from "@assets/..."` | Logo URL from layoutData or `/public/` |
| `useLayout()` for global config | `layoutData` prop from server layout |

## Critical lessons (from Home & Quote ports)

### Missing translation key detection
`t(dictionary, key)` returns the raw key when missing, not `[key]`. Check:
```tsx
const val = t(dictionary, key);
const isMissing = val === key || val.startsWith("[");
```

### Hydration — never read `window` in `useState` initializers
Use `useEffect` to read `window.location`, `localStorage`, etc.

### Server vs Client
Header needs interactivity (mobile menu toggle, scroll detection) → `"use client"`.
Data is passed as props from the server layout.

## Checklist

- [ ] Read source Header.tsx completely
- [ ] Read current Next.js Header.tsx completely
- [ ] Compare nav items, logo, CTA, mobile menu, language switcher
- [ ] Fix all differences
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Test in browser — no hydration errors, all nav links work
- [ ] Visual comparison — should look identical to source
