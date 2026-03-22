# Prompt: 1:1 Port of Quote Success & Submission Pages from Source to Next.js

## Context

Migrating easyRecharge from React SPA (Vite + Express on Replit) to Next.js App Router (Vercel).
- **Source repo**: `/tmp/eRv2-source/client/src/`
- **Next.js repo**: current working directory
- **Already ported**: Home page, Quote page (form itself)

## Source & Target

- **Source**: `/tmp/eRv2-source/client/src/pages/QuoteSuccess.tsx` (170 lines)
- **Source**: `/tmp/eRv2-source/client/src/pages/QuoteSubmissionView.tsx` (483 lines)
- **Source**: `/tmp/eRv2-source/client/src/pages/QuoteLegacyView.tsx` (261 lines)
- **Target**: These may be sub-routes of the quote page or separate pages. Check source routing to understand URL structure.

## Task

Port the quote post-submission pages:
- **QuoteSubmissionView**: Shows quote summary/review before final submission
- **QuoteSuccess**: Confirmation page after successful submission
- **QuoteLegacyView**: Legacy quote format view (may be for existing/older quotes)

### Step 1: Read everything first
1. Read source `pages/QuoteSuccess.tsx` (170 lines)
2. Read source `pages/QuoteSubmissionView.tsx` (483 lines)
3. Read source `pages/QuoteLegacyView.tsx` (261 lines)
4. Read the current Quote form component to understand how submission flows
5. Check source routing to understand URL patterns for these pages

### Step 2: Key areas to match
- **QuoteSuccess**: Thank you message, confirmation number, next steps, PostHog conversion event
- **QuoteSubmissionView**: Summary of submitted data, status tracking, edit link
- **QuoteLegacyView**: Older quote format — may be for viewing saved quotes via link

## Adaptation reference

| Source (SPA) | Next.js equivalent |
|---|---|
| `useTranslation()` / `t(key)` | `t(dictionary, key)` via props |
| `<Link href>` from wouter | `<Link href>` from next/link |
| `useLocation()` / URL params | `useSearchParams()` or `params` from page props |
| `usePostHog()` from `@posthog/react` | `usePostHog()` from `posthog-js/react` |
| `getPostHogIds()` | `ph?.get_distinct_id()` / `ph?.get_session_id()` |

## Critical lessons (from Home & Quote ports)

### Hydration — never read `window` in `useState` initializers
Quote success may read submission ID from URL params. Use `useEffect`.

### Layout chrome
Quote success likely uses the **focused header** (same as quote form) with `data-hide-layout`.

## Checklist

- [ ] Read all three source files completely
- [ ] Understand the submission flow from quote form to these pages
- [ ] Port QuoteSuccess (1:1)
- [ ] Port QuoteSubmissionView (1:1)
- [ ] Port QuoteLegacyView if still needed (1:1)
- [ ] Wire up routing
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Test: complete a quote submission → see success page
- [ ] Visual comparison — should look identical to source
