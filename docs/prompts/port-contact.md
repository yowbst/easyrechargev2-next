# Prompt: 1:1 Port of Contact Page from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page (use as reference for patterns)

## Source & Target

- **Source**: `/tmp/eRv2-source/client/src/pages/Contact.tsx` (730 lines)
- **Target**: Currently rendered by `src/app/[lang]/[slug]/page.tsx` which dispatches based on `routeId === "contact"`. There may be a `src/components/ContactForm.tsx` already.

## Task

Port the Contact page to match the source **exactly** — same form fields, same validation, same layout, same behavior.

### Step 1: Read everything first
1. Read source `pages/Contact.tsx` completely (730 lines — chunk if needed)
2. Read the current Next.js `[slug]/page.tsx` to find the contact dispatch
3. Read any existing `ContactForm.tsx` component
4. Read source sub-components (form fields, validation, etc.)

### Step 2: Port

The Contact page is a **form-heavy page** similar to Quote. Key areas:
- Form fields (name, email, phone, message, subject, etc.)
- Form validation
- Form submission (to Directus via API)
- PostHog telemetry events
- Success/error states
- Page blocks (hero, FAQ, etc.) if the contact page has CMS blocks

## Adaptation reference

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props |
| `t(key, { var: val })` interpolation | `t(dictionary, key, { var: val })` — 3rd arg |
| `useLocation()` from wouter | `usePathname()` from next/navigation |
| `setLocation(path)` from wouter | `router.push(path)` from next/navigation |
| `<Link href>` from wouter | `<Link href>` from next/link |
| `useSEO()`, `usePageRegistry()` | Server-side `generateMetadata()` |
| `useDirectusPage()`, `useLayout()` | Data fetched server-side, passed as props |
| `useFormTelemetry()` | Check if exists in Next.js, port if not |
| `getPostHogIds()` | `ph?.get_distinct_id()` / `ph?.get_session_id()` |
| `usePostHog()` from `@posthog/react` | `usePostHog()` from `posthog-js/react` |
| `/api/cms/assets/{uuid}` | `${DIRECTUS_URL}/assets/${uuid}` |
| `fetch("/api/form-submissions", ...)` | Same pattern — Next.js API route or direct |

## Critical lessons (from Home & Quote ports)

### Block translation content vs block root content
**WRONG**: `block?.content?.field` — reads block root content (config)
**RIGHT**: `block?.translations?.[0]?.content?.field` — reads translation content
The dictionary is built from translation content, not root content.

### Raw Directus strings bypass interpolation
When using `translation?.subheadline || t(dictionary, key)`, the raw string may contain `{var}` placeholders. Always apply interpolation:
```tsx
const vars = { quote_request_duration: slas?.value ?? 3 };
const raw = translation?.headline || t(dictionary, key);
const text = Object.entries(vars).reduce(
  (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)), raw);
```

### Hydration — never read `window` in `useState` initializers
```tsx
// BAD: const [x, setX] = useState(() => window.location.search...)
// GOOD:
const [x, setX] = useState(defaultValue);
useEffect(() => { setX(readFromWindow()); }, []);
```

### Server vs Client split
Server page fetches data → passes to client form component:
```tsx
// [slug]/page.tsx (server) — already handles dispatch
// ContactForm.tsx (client) — "use client", receives dictionary + data as props
```

## Checklist

- [ ] Read source Contact.tsx completely
- [ ] Read current Next.js contact dispatch + ContactForm.tsx
- [ ] Identify all sub-components and form fields
- [ ] Update/create sub-components if needed
- [ ] Write the contact form component (1:1 port)
- [ ] Wire up in `[slug]/page.tsx` with correct props
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Test in browser — form submits, validation works, no hydration errors
- [ ] Visual comparison — should look identical to source
