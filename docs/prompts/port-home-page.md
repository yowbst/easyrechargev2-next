# Prompt: 1:1 Port of Home Page from Source to Next.js

## Context

We are migrating easyRecharge from a React SPA (Vite + Express on Replit) to Next.js App Router (on Vercel). The source repo is at `/tmp/eRv2-source/client/src/`. The Next.js repo is the current working directory.

The Quote page has already been ported successfully. Now port the **Home page** using the same methodology.

## Source file

`/tmp/eRv2-source/client/src/pages/Home.tsx`

## Target

Rewrite the existing Next.js home page to match the source **exactly** — same structure, same UI, same behavior. This is a 1:1 port, not a redesign.

## Methodology (proven on Quote port)

### Step 1: Read everything first

1. Read the **source** file completely (chunk by chunk if > 500 lines)
2. Read the **current Next.js target** file(s) for the home page
3. Read every sub-component the source imports — check if they already exist in Next.js, and compare their prop interfaces
4. Read the parent layout/page that renders the home page to understand what props are available server-side

### Step 2: Identify adaptations needed

The source uses SPA patterns. Map each to Next.js equivalents:

| Source (SPA)                          | Next.js equivalent                              |
|---------------------------------------|--------------------------------------------------|
| `useTranslation()` / `t(key)`        | `t(dictionary, key)` via props from server page  |
| `import.meta.env.VITE_*`             | `process.env.NEXT_PUBLIC_*`                      |
| `useLocation()` from wouter           | `usePathname()` from next/navigation             |
| `<Link href>` from wouter             | `<Link href>` from next/link                     |
| `useSEO()`, `usePageRegistry()`       | Handled by server page `generateMetadata()`      |
| `useLanguageReady()`, `usePrerenderReady()` | Remove — SSR handles this              |
| `useDirectusPage()`, `useLayout()`    | Data fetched server-side, passed as props         |
| `resolveRouteId("page-id", lang)`     | Use `registry` from server to build hrefs        |
| `import logo from "@assets/..."`      | Pass logo URLs as props from layoutData           |
| `getPostHogIds()`                     | `ph?.get_distinct_id()` / `ph?.get_session_id()` |

### Step 3: Update sub-components first

If the source uses props that the Next.js sub-component doesn't support yet, update the sub-component first. Example from Quote port:
- `IconButtonGroup` needed `disabledValues` prop
- `SliderWithCheckbox` needed `tooltip`, `tooltipImage`, `tickInterval`, `showEdgeLabels`

### Step 4: Write the component

- Keep the exact same JSX structure, class names, conditional logic
- Adapt only the framework-specific parts (i18n, routing, data fetching)
- Use `"use client"` directive since home page likely has interactive elements

### Step 5: Wire up in the parent page

- Pass all needed data from the server page component (dictionary, layoutData, heroImage, etc.)
- Use the same pattern as Quote: `<HomePage lang={lang} dictionary={dictionary} ... />`

### Step 6: Type-check

Run `npx tsc --noEmit` after every major change. Fix errors immediately.

## Critical lessons from Quote port

### Hydration

**Never read `window` in `useState` initializers.** This causes hydration mismatches because the server returns a different value than the client.

Bad:
```tsx
const [step, setStep] = useState(() => {
  if (typeof window === "undefined") return 0;
  return parseInt(new URLSearchParams(window.location.search).get("step") ?? "0", 10);
});
```

Good:
```tsx
const [step, setStep] = useState(0);
useEffect(() => {
  const s = parseInt(new URLSearchParams(window.location.search).get("step") ?? "0", 10);
  if (!isNaN(s) && s !== 0) setStep(s);
}, []);
```

### Missing translation keys

The `t(dictionary, key)` function returns the **raw key** when missing (not `[key]` like react-i18next). So `tqOpt` must compare against the full key:

```tsx
const tqOpt = (key: string) => {
  const fullKey = `pages.home.${key}`;
  const v = t(dictionary, fullKey);
  return (v === fullKey || v.startsWith("[")) ? undefined : v;
};
```

### Layout chrome (header/footer)

If the page needs a different header/footer (like Quote's focused header):
- Add `data-hide-layout` to the outermost div
- CSS in `globals.css` hides the parent `<header>` and `<footer>`:
  ```css
  body:has([data-hide-layout]) > header,
  body:has([data-hide-layout]) > footer {
    display: none !important;
  }
  ```
- Render your own header inside the component
- Pass `logoSrc`, `logoDarkSrc`, `pageRegistry` props for the focused header

**The home page probably uses the standard layout (header + footer), so you likely do NOT need `data-hide-layout`.** Only use it for immersive/focused pages.

### Images from Directus

Source uses `/api/cms/assets/{uuid}` or `cmsBgImage()`. In Next.js, use `${DIRECTUS_URL}/assets/${uuid}` and pass the URL as a prop from the server page. Use `next/image` with `Image` component where possible.

### PostHog

Source imports from `@posthog/react`, Next.js uses `posthog-js/react`:
```tsx
import { usePostHog } from "posthog-js/react";
```

### Google Maps APIProvider

If the home page uses Google Places (e.g., in a hero form), the `APIProvider` must wrap only the component that needs it, and the key comes from `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

## Checklist

- [ ] Read source Home.tsx completely
- [ ] Read current Next.js home page
- [ ] Identify all sub-components used — check if they exist and have matching props
- [ ] Update sub-components if needed
- [ ] Write the home page component (1:1 port)
- [ ] Wire it up in the parent server page with correct props
- [ ] Run `npx tsc --noEmit` — zero errors
- [ ] Test in browser — no hydration errors in console
- [ ] Visual comparison with source — should look identical
