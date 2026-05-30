# User Language Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track the URL language (`fr`/`de`) each user was browsing when submitting a form, stored on the `form_users` record and included in webhook payloads.

**Architecture:** Client components already have `lang` (from URL path) as a prop. We add it to the main API payloads for quote and contact forms (mini-quote already sends it). Server-side, we pass it through to `createOrUpdateFormUser()` which stores it as a new `language` field on `form_users`. Webhook payloads include the language in the `user` section.

**Tech Stack:** Next.js API routes, Directus CMS (manual column creation), TypeScript shared types.

---

## Directus CMS Setup (Manual, pre-requisite)

Add a `language` field to the `form_users` collection in Directus:
- **Field name:** `language`
- **Type:** String (varchar, max 5)
- **Default:** null
- **Nullable:** yes

---

### Task 1: Update shared types

**Files:**
- Modify: `src/shared/types.ts:16-25`

- [ ] **Step 1: Add `language` to `FormUser` interface**

```ts
export interface FormUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  language: string | null;
  submission_count: number;
  date_created: string;
  date_updated: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add language field to FormUser type"
```

---

### Task 2: Update storage layer to accept and persist `language`

**Files:**
- Modify: `src/lib/directus-storage.ts:43-49` (CreateUserData interface)
- Modify: `src/lib/directus-storage.ts:108-153` (createOrUpdateFormUser method)

- [ ] **Step 1: Add `language` to `CreateUserData` interface**

In `src/lib/directus-storage.ts`, add to the `CreateUserData` interface:

```ts
interface CreateUserData {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  language?: string | null;
  date_terms_accepted?: string | null;
}
```

- [ ] **Step 2: Persist `language` in `createOrUpdateFormUser`**

In the PATCH call (updating existing user), add `language` — update it if provided (latest submission language wins):

```ts
const result = await directusFetch<{ data: FormUser }>(
  `/items/form_users/${user.id}`,
  {
    method: "PATCH",
    body: JSON.stringify({
      first_name: data.first_name || user.first_name,
      last_name: data.last_name || user.last_name,
      phone: normalizePhone(data.phone) || user.phone,
      language: data.language || user.language,
      submission_count: (user.submission_count || 0) + 1,
      ...(data.date_terms_accepted && { date_terms_accepted: data.date_terms_accepted }),
    }),
    next: { revalidate: 0 },
  },
);
```

In the POST call (creating new user), add `language`:

```ts
const result = await directusFetch<{ data: FormUser }>(
  "/items/form_users",
  {
    method: "POST",
    body: JSON.stringify({
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      phone: normalizePhone(data.phone),
      language: data.language || null,
      date_terms_accepted: data.date_terms_accepted || null,
      submission_count: 1,
      environment: getEnvironment(),
    }),
    next: { revalidate: 0 },
  },
);
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/directus-storage.ts
git commit -m "feat: persist language field on form_users"
```

---

### Task 3: Send `lang` from QuoteForm client and handle in API route

**Files:**
- Modify: `src/components/quote/QuoteForm.tsx:1747` (fetch payload)
- Modify: `src/app/api/quote/route.ts:38,79-85,124-155` (extract lang, pass to storage, add to webhook)

- [ ] **Step 1: Add `lang` to QuoteForm fetch payload**

In `src/components/quote/QuoteForm.tsx` line 1747, add `lang` to the payload:

```ts
body: JSON.stringify({ ...formData, lang, attribution, posthog: phIds, ...(miniQuoteSessionTokenRef.current && { miniQuoteSessionToken: miniQuoteSessionTokenRef.current }) }),
```

- [ ] **Step 2: Extract `lang` in quote API route and pass to storage**

In `src/app/api/quote/route.ts` line 38, add `lang` to destructuring:

```ts
const { firstName, lastName, email, phone, phoneCountry, lang } = body;
```

Line 79-85, pass `language` to `createOrUpdateFormUser`:

```ts
const formUser = await storage.createOrUpdateFormUser({
  email,
  first_name: firstName ?? null,
  last_name: lastName ?? null,
  phone: phone ?? null,
  language: lang ?? null,
  date_terms_accepted: body.acceptTerms ? new Date().toISOString() : null,
});
```

Also update the session locale (line 70) to prefer the client-sent `lang` over the accept-language header:

```ts
locale: lang ?? req.headers.get("accept-language")?.split(",")[0] ?? null,
```

- [ ] **Step 3: Add `language` to quote webhook payload**

In the webhook `user` section (~line 137), add language:

```ts
user: {
  id: formUser.id,
  email,
  firstName,
  lastName,
  phone: parsePhone(phone, phoneCountry),
  language: lang ?? null,
},
```

Also update the session section locale (~line 146):

```ts
session: {
  id: session.id,
  token: session.session_token ?? null,
  locale: lang ?? req.headers.get("accept-language")?.split(",")[0] ?? null,
  userAgent: req.headers.get("user-agent") ?? null,
  ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
},
```

- [ ] **Step 4: Exclude `lang` from quoteData spread**

Line 87, add `lang` to the destructured exclusions so it doesn't end up in the raw `data` blob:

```ts
const { attribution: _a, posthog: _ph, firstName: _fn, lastName: _ln, email: _em, phone: _p, phoneCountry: _pc, miniQuoteSessionToken: _mqt, lang: _lang, ...quoteData } = body;
```

- [ ] **Step 5: Commit**

```bash
git add src/components/quote/QuoteForm.tsx src/app/api/quote/route.ts
git commit -m "feat: send and persist user language from quote form"
```

---

### Task 4: Send `lang` from ContactForm client and handle in API route

**Files:**
- Modify: `src/components/ContactForm.tsx:144` (fetch payload)
- Modify: `src/app/api/contact/route.ts:38,72-78,80,114-155` (extract lang, pass to storage, add to webhook)

- [ ] **Step 1: Add `lang` to ContactForm fetch payload**

In `src/components/ContactForm.tsx` line 144, add `lang` to the payload:

```ts
body: JSON.stringify({
  ...formData,
  lang,
  attribution,
  posthog: {
    phDistinctId: ph?.get_distinct_id?.() ?? null,
    phSessionId: ph?.get_session_id?.() ?? null,
  },
}),
```

- [ ] **Step 2: Extract `lang` in contact API route and pass to storage**

In `src/app/api/contact/route.ts` line 38, add `lang` to destructuring:

```ts
const { firstName, lastName, email, phone, phoneCountry, message, lang } = body;
```

Pass `language` to `createOrUpdateFormUser` (~line 72):

```ts
const formUser = await storage.createOrUpdateFormUser({
  email,
  first_name: firstName ?? null,
  last_name: lastName ?? null,
  phone: phone ?? null,
  language: lang ?? null,
  date_terms_accepted: body.acceptTerms ? new Date().toISOString() : null,
});
```

Update session locale (~line 65) to prefer client-sent `lang`:

```ts
locale: lang ?? req.headers.get("accept-language")?.split(",")[0] ?? null,
```

- [ ] **Step 3: Add `language` to contact webhook payload**

In the webhook `user` section (~line 137), add language:

```ts
user: {
  id: formUser.id,
  email,
  firstName,
  lastName,
  phone: parsePhone(phone, phoneCountry),
  language: lang ?? null,
},
```

Update webhook session locale (~line 145):

```ts
session: {
  id: session.id,
  token: session.session_token ?? null,
  locale: lang ?? req.headers.get("accept-language")?.split(",")[0] ?? null,
  userAgent: req.headers.get("user-agent") ?? null,
  ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
},
```

- [ ] **Step 4: Exclude `lang` from contactData spread**

Line 80, add `lang` to the destructured exclusions:

```ts
const { attribution: _a, firstName: _fn, lastName: _ln, email: _em, phone: _p, phoneCountry: _pc, lang: _lang, ...contactData } = body;
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ContactForm.tsx src/app/api/contact/route.ts
git commit -m "feat: send and persist user language from contact form"
```

---

### Task 5: Verify build

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 2: Verify with curl**

Start dev server and test the quote endpoint accepts `lang`:

```bash
npm run dev &
curl -s -X POST http://localhost:3000/api/quote \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"test@example.com","lang":"fr"}' \
  | python3 -m json.tool
```

Expected: `{ "success": true, "submissionId": "..." }`

Then check the created user in Directus has `language: "fr"`:

```bash
source .env.local
curl -s -H "Authorization: Bearer $DIRECTUS_STATIC_TOKEN" \
  "$DIRECTUS_URL/items/form_users?filter[email][_eq]=test@example.com&fields=id,email,language" \
  | python3 -m json.tool
```

- [ ] **Step 3: Final commit (if any fixups needed)**

---

## Files changed summary

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `language` to `FormUser` |
| `src/lib/directus-storage.ts` | Add `language` to `CreateUserData` + persist in create/update |
| `src/components/quote/QuoteForm.tsx` | Add `lang` to `/api/quote` payload |
| `src/app/api/quote/route.ts` | Extract `lang`, pass to storage, include in webhook |
| `src/components/ContactForm.tsx` | Add `lang` to `/api/contact` payload |
| `src/app/api/contact/route.ts` | Extract `lang`, pass to storage, include in webhook |
