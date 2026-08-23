# Multi-Product Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread a `product` key (currently only `"ecp"`) end-to-end — form → API → Directus storage → dispatch webhook → Google Ads conversion config — so a second quote-form product can be added later with one code-union member, one Directus config block, and one Make mapping change.

**Architecture:** A tiny product registry module (`src/lib/products.ts`) is the single source of truth for valid product keys. The Directus quote page's `pageConfig.product` declares which product a form instance is for (defaults to `"ecp"` everywhere). The API validates via `normalizeProduct()`, stores it on `form_submissions.product`, passes it to dispatch (already product-aware), and emits it in the Make webhook payload (replacing two hardcoded `"ecp"` literals). Google Ads browser config becomes nested per product: `global_config.google_ads.conversions[product][event]`.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Vitest, Directus REST API (curl + `DIRECTUS_STATIC_TOKEN` from `.env.local`).

## Global Constraints

- Working tree contains UNRELATED uncommitted work (`src/lib/directus-storage.ts` modified, `src/lib/directus-storage.test.ts` untracked) — NEVER `git add -A` / `git add .`; always add explicit file paths.
- Working tree also contains the uncommitted 2026-07-25 Google Ads refactor (`src/lib/googleAds.ts`, `src/components/quote/QuoteForm.tsx`, `src/app/[lang]/[slug]/[sub1]/page.tsx`). Task 5 modifies these same files and commits the combined result — do not commit them before Task 5.
- Do not push. Work stays on `staging`; the user batches deploys (Vercel builds on every push).
- Directus calls: `export DIRECTUS_URL=$(grep -E '^DIRECTUS_URL=' .env.local | cut -d= -f2) DIRECTUS_STATIC_TOKEN=$(grep -E '^DIRECTUS_STATIC_TOKEN=' .env.local | cut -d= -f2)` then use `/usr/bin/curl` with `-H "Authorization: Bearer $DIRECTUS_STATIC_TOKEN"`.
- `site_settings` is a Directus SINGLETON: `PATCH /items/site_settings` (no id). PATCHing the `global_config` JSON field replaces the WHOLE JSON value — always GET, modify in memory, PATCH the full object back.
- Test command: `npx vitest run <file>` (single file) or `npm test` (all). Typecheck: `npx tsc --noEmit`.
- Design decisions (locked): product keys live in a code union (a new product needs a deploy anyway); `product` column on `form_submissions` only (sessions inherit via the linked submission); quote-success page defaults to `"ecp"` (extension point documented in Task 5); `deriveLeadCategory()` stays ECP-specific (a second product brings its own categorizer — out of scope); PostHog event properties unchanged (out of scope).

---

### Task 1: Product registry module

**Files:**
- Create: `src/lib/products.ts`
- Test: `src/lib/products.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PRODUCTS: readonly ["ecp"]`, `type Product = "ecp"`, `DEFAULT_PRODUCT: Product`, `normalizeProduct(raw: unknown): Product`, `isProduct(raw: unknown): raw is Product`. All later tasks import from `@/lib/products`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/products.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PRODUCTS, DEFAULT_PRODUCT, normalizeProduct, isProduct } from "./products";

describe("products", () => {
  it("declares ecp as the default product", () => {
    expect(DEFAULT_PRODUCT).toBe("ecp");
    expect(PRODUCTS).toContain("ecp");
  });

  it("normalizeProduct passes through valid keys", () => {
    expect(normalizeProduct("ecp")).toBe("ecp");
  });

  it("normalizeProduct falls back to the default for unknown/missing input", () => {
    expect(normalizeProduct("solar")).toBe("ecp");
    expect(normalizeProduct(undefined)).toBe("ecp");
    expect(normalizeProduct(null)).toBe("ecp");
    expect(normalizeProduct(42)).toBe("ecp");
    expect(normalizeProduct({})).toBe("ecp");
  });

  it("isProduct narrows correctly", () => {
    expect(isProduct("ecp")).toBe(true);
    expect(isProduct("ECP")).toBe(false);
    expect(isProduct("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/products.test.ts`
Expected: FAIL — `Cannot find module './products'` (or equivalent resolve error).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/products.ts`:

```ts
// Single source of truth for quote-form product keys. A product is a
// distinct lead vertical (own quote funnel, own partner pricing column in
// pricing_policy.settings.prices[product][category], own Google Ads
// conversion actions). Adding one:
//   1. Append the key to PRODUCTS below.
//   2. Add global_config.google_ads.conversions.<key> in Directus.
//   3. Add the product's price column to partner pricing policies.
//   4. Map the product to its Ads conversion action in the Make scenario
//      (module "events:ingest", productDestinationId — see
//      docs/operations/partner-dispatch.md).
export const PRODUCTS = ["ecp"] as const;

export type Product = (typeof PRODUCTS)[number];

export const DEFAULT_PRODUCT: Product = "ecp";

export function isProduct(raw: unknown): raw is Product {
  return typeof raw === "string" && (PRODUCTS as readonly string[]).includes(raw);
}

/** Coerce untrusted input (form body, Directus page config, DB row) to a
 * valid product key, falling back to the default. Never throws. */
export function normalizeProduct(raw: unknown): Product {
  return isProduct(raw) ? raw : DEFAULT_PRODUCT;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/products.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/products.ts src/lib/products.test.ts
git commit -m "feat(products): product registry module (single source of product keys)"
```

---

### Task 2: Directus schema — `product` field on `form_submissions`

**Files:**
- No repo files. Live Directus schema change + backfill, executed with curl.

**Interfaces:**
- Consumes: nothing.
- Produces: `form_submissions.product` (string, default `"ecp"`) — Task 3 writes it; the Make webhook and admin tooling can read it.

- [ ] **Step 1: Create the field**

```bash
export DIRECTUS_URL=$(grep -E '^DIRECTUS_URL=' .env.local | cut -d= -f2) DIRECTUS_STATIC_TOKEN=$(grep -E '^DIRECTUS_STATIC_TOKEN=' .env.local | cut -d= -f2)
/usr/bin/curl -s -X POST "$DIRECTUS_URL/fields/form_submissions" \
  -H "Authorization: Bearer $DIRECTUS_STATIC_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "field": "product",
    "type": "string",
    "schema": { "default_value": "ecp", "is_nullable": true },
    "meta": { "interface": "input", "width": "half", "note": "Product key (see src/lib/products.ts). ecp = electric charging point." }
  }' | python3 -m json.tool | head -20
```

Expected: JSON echo of the created field (`"field": "product"`). If it returns `"code": "RECORD_NOT_UNIQUE"` or similar "already exists" error, the field is already there — continue.

- [ ] **Step 2: Backfill existing rows**

The default only applies to new rows; existing rows are `null`:

```bash
/usr/bin/curl -s -X PATCH "$DIRECTUS_URL/items/form_submissions" \
  -H "Authorization: Bearer $DIRECTUS_STATIC_TOKEN" -H "Content-Type: application/json" \
  -d '{ "query": { "filter": { "product": { "_null": true } }, "limit": -1 }, "data": { "product": "ecp" } }' \
  -o /dev/null -w "backfill status: %{http_code}\n"
```

Expected: `backfill status: 200`.

- [ ] **Step 3: Verify**

```bash
/usr/bin/curl -s "$DIRECTUS_URL/items/form_submissions?aggregate[count]=id&groupBy[]=product" \
  -H "Authorization: Bearer $DIRECTUS_STATIC_TOKEN" | python3 -m json.tool
```

Expected: every group has `"product": "ecp"` (no `null` group), counts sum to the total submission count.

No commit (no repo files changed).

---

### Task 3: Thread product through quote API, storage input, webhook payload, manual dispatch

**Files:**
- Modify: `src/lib/directus-storage.ts` (interface `FormSubmissionInput`, around line 56 — CAUTION: this file has the user's unrelated uncommitted edits; make a surgical edit, commit ONLY with `git add -p`-style precision as shown in Step 7)
- Modify: `src/lib/dispatch/webhook.ts` (`QuoteWebhookParts.submission` + `buildQuoteWebhookPayload`, lines 36-47 and 116-133)
- Modify: `src/app/api/quote/route.ts` (lines 62-95, 122-133)
- Modify: `src/lib/dispatch/manual-dispatch.ts` (lines 62-95)
- Test: `src/lib/dispatch/webhook.test.ts` (create)

**Interfaces:**
- Consumes: `normalizeProduct`, `DEFAULT_PRODUCT` from `@/lib/products` (Task 1).
- Produces: `QuoteWebhookParts.submission.product: string` (required field); webhook payload JSON `submission.product` now reflects the real product; `FormSubmissionInput.product?: string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/dispatch/webhook.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildQuoteWebhookPayload, type QuoteWebhookParts } from "./webhook";
import type { DispatchResult } from "./types";

const emptyDispatch: DispatchResult = {
  mode: "off",
  canton: "VD",
  isTest: true,
  billableRate: null,
  summary: { resolved: 0, dispatched: 0, skipped: 0, skippedDedup: 0, reasons: [] },
  targets: [],
  dedup: { skippedPartnerSlugs: [], windowDays: 0 },
};

function parts(product: string): QuoteWebhookParts {
  return {
    submission: {
      id: "sub-1",
      locationHost: "easyrecharge.ch",
      locationPath: "/fr/devis",
      submittedAt: "2026-07-25T12:00:00.000Z",
      environment: "development",
      miniQuoteSessionToken: null,
      leadCategory: "standard",
      isRepeat: false,
      product,
      data: { postalCode: "1000", locality: "Lausanne" },
    },
    user: {
      id: "u-1",
      email: "a@b.ch",
      firstName: "A",
      lastName: "B",
      phone: { raw: null, international: null, countryCode: null, countryCallingCode: null },
      language: "fr",
    },
    session: { id: "s-1", token: null, locale: "fr", userAgent: null, ip: null },
    posthog: { distinctId: null, personUrl: null },
    attribution: {},
    dispatch: emptyDispatch,
    trigger: "quote_submission",
  };
}

describe("buildQuoteWebhookPayload product passthrough", () => {
  it("emits the product it was given", () => {
    expect(buildQuoteWebhookPayload(parts("ecp")).submission.product).toBe("ecp");
    expect(buildQuoteWebhookPayload(parts("solar")).submission.product).toBe("solar");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dispatch/webhook.test.ts`
Expected: FAIL — TypeScript error `product` not in `QuoteWebhookParts["submission"]` and/or assertion failure `"solar"` vs `"ecp"` (payload currently hardcodes `product: "ecp"`).

- [ ] **Step 3: Make `webhook.ts` product-aware**

In `src/lib/dispatch/webhook.ts`, add `product` to the parts interface — inside `QuoteWebhookParts.submission` after `leadCategory: string;`:

```ts
    leadCategory: string;
    product: string;
```

And in `buildQuoteWebhookPayload`, replace the hardcoded literal (line ~126):

```ts
      product: "ecp",
```

with:

```ts
      product: parts.submission.product,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dispatch/webhook.test.ts`
Expected: PASS (1 test, 2 assertions).

- [ ] **Step 5: Thread product through the quote route**

In `src/app/api/quote/route.ts`:

Add the import (top of file, with the other `@/lib` imports):

```ts
import { normalizeProduct } from "@/lib/products";
```

After the destructuring line 62 (`const { attribution: _a, ... } = body;`), derive the product (body.product ends up in `quoteData` — that's fine, it's informative in `data` too):

```ts
    const product = normalizeProduct(body.product);
```

In the `storage.createFormSubmission({...})` call (line ~72), add the field:

```ts
    const submission = await storage.createFormSubmission({
      session: session.id,
      user: formUser.id,
      form_type: "quote",
      product,
      location_route: "quote",
```

In the `runDispatch({...})` call (line ~88), replace `product: "ecp",` with:

```ts
      product,
```

In the `buildQuoteWebhookPayload({ submission: {...} })` call (line ~122), add after `leadCategory,`:

```ts
          leadCategory,
          product,
```

- [ ] **Step 6: Storage input type + manual dispatch**

In `src/lib/directus-storage.ts`, find the `FormSubmissionInput` interface (the one containing `form_type: string;` around line 56) and add:

```ts
  product?: string;
```

(The storage layer POSTs the input object to Directus as-is, so no other change is needed — verify by checking `createFormSubmission` just spreads/passes the input.)

In `src/lib/dispatch/manual-dispatch.ts`:

Add import:

```ts
import { normalizeProduct } from "@/lib/products";
```

After line 62 (`const data = (submission.data ?? {}) as Record<string, any>;`) derive product from the stored row (backfilled in Task 2, so old rows read `"ecp"`):

```ts
  const product = normalizeProduct(submission.product);
```

Replace `product: "ecp",` in the `runDispatch({...})` call (line ~74) with:

```ts
    product,
```

In its `buildQuoteWebhookPayload({ submission: {...} })` call (line ~84), add after `leadCategory,` (line ~95):

```ts
      leadCategory,
      product,
```

If `submission` is typed and `product` errors, extend the local submission row type/`any`-cast the same way neighboring fields (e.g. `location_path`) are accessed.

- [ ] **Step 7: Typecheck + full test run**

Run: `npx tsc --noEmit && npm test`
Expected: tsc exit 0; all tests pass (existing 47 + 4 products + 1 webhook = 52).

- [ ] **Step 8: Commit (surgical — exclude the user's unrelated directus-storage edits if they overlap)**

```bash
git diff src/lib/directus-storage.ts   # confirm YOUR one-line interface addition is separable from user's WIP edits
git add src/app/api/quote/route.ts src/lib/dispatch/webhook.ts src/lib/dispatch/webhook.test.ts src/lib/dispatch/manual-dispatch.ts
git commit -m "feat(products): thread product through quote API, webhook payload, manual dispatch"
```

For `src/lib/directus-storage.ts`: if `git diff` shows ONLY your `product?: string;` line, include it in the commit above. If the user's unrelated edits are present in the same file, commit it anyway ONLY IF the user's edits are complete/passing (`npm test` covered them), otherwise leave the file uncommitted and note it in the task report. Do not attempt partial staging non-interactively.

---

### Task 4: Mini-quote route accepts product

**Files:**
- Modify: `src/app/api/mini-quote/route.ts`

**Interfaces:**
- Consumes: `normalizeProduct` from `@/lib/products`.
- Produces: mini-quote `form_submissions` rows carry `product` (default `"ecp"`), same as full quotes.

- [ ] **Step 1: Read the route, add product**

Read `src/app/api/mini-quote/route.ts` in full first (it has two submission-creation paths, `form_type: "mini-quote"` and `"mini-quote-card"`). Add the import:

```ts
import { normalizeProduct } from "@/lib/products";
```

Derive once after the body is parsed:

```ts
  const product = normalizeProduct(body.product);
```

Add `product,` to every `createFormSubmission({ ... })` (and, if the route creates sessions with their own inline object, leave sessions untouched — product lives on submissions only).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: clean / all pass. (No new unit test: the route is thin plumbing over `normalizeProduct`, which Task 1 tests; route-level behavior is covered by the Task 7 end-to-end check.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mini-quote/route.ts
git commit -m "feat(products): mini-quote submissions carry product key"
```

---

### Task 5: Product-aware Google Ads config (code + Directus)

**Files:**
- Modify: `src/lib/googleAds.ts` (uncommitted refactor from 2026-07-25 — this task supersedes and commits it)
- Modify: `src/components/quote/QuoteForm.tsx` (lines ~395, ~1817 — `adsSendTo` call sites)
- Modify: `src/components/ContactForm.tsx` (line ~206)
- Modify: `src/app/[lang]/[slug]/[sub1]/page.tsx` (line ~1068)
- Test: `src/lib/googleAds.test.ts` (create)
- Live: PATCH Directus `site_settings.global_config.google_ads` to the nested shape.

**Interfaces:**
- Consumes: `Product`, `DEFAULT_PRODUCT`, `normalizeProduct` from `@/lib/products`.
- Produces: `adsSendTo(config, event, product?)` — `(GoogleAdsConfig | undefined | null, GoogleAdsEvent, Product = DEFAULT_PRODUCT) => string | null`. Directus shape: `google_ads.conversions[product][event] = { label, action_name, category, optimization, enhanced_conversions }`.

**Config shape (target state in Directus):**

```json
{
  "account_id": "864-530-6017",
  "tag_id": "AW-360470746",
  "conversions": {
    "ecp": {
      "quote_submit": {
        "label": "6PDrCO2Zq9YcENqx8asB",
        "action_name": "ECP Quote Form Submitted (Browser)",
        "category": "Submit lead form",
        "optimization": "secondary",
        "enhanced_conversions": true
      },
      "quote_start": {
        "label": "E_CYCMaWmNYcENqx8asB",
        "action_name": "ECP Quote Form Started (Browser)",
        "category": "Page views",
        "optimization": "secondary",
        "enhanced_conversions": false
      }
    }
  },
  "offline_conversions": {
    "ecp": {
      "quote_submitted_api": {
        "action_name": "ECP Quote Form Submitted (API)",
        "category": "Submit lead form",
        "optimization": "primary",
        "source": "Make scenario 3542973 -> Data Manager API events:ingest",
        "conversion_action_id": "7076158233",
        "note": "documentation only - not read by code"
      }
    }
  },
  "labels": {
    "lead_submit": "6PDrCO2Zq9YcENqx8asB",
    "contact_submit": null,
    "quote_start": "E_CYCMaWmNYcENqx8asB"
  }
}
```

(`labels` is the legacy flat map the CURRENTLY-DEPLOYED prod code reads — keep it until this task's code deploys, then it can be deleted from Directus.)

- [ ] **Step 1: Write the failing test**

Create `src/lib/googleAds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { adsSendTo, type GoogleAdsConfig } from "./googleAds";

const nested: GoogleAdsConfig = {
  tag_id: "AW-1",
  conversions: {
    ecp: {
      quote_submit: { label: "LBL_SUBMIT" },
      quote_start: { label: "LBL_START" },
    },
  },
};

describe("adsSendTo", () => {
  it("resolves nested per-product labels (default product)", () => {
    expect(adsSendTo(nested, "quote_submit")).toBe("AW-1/LBL_SUBMIT");
    expect(adsSendTo(nested, "quote_start", "ecp")).toBe("AW-1/LBL_START");
  });

  it("returns null for an event with no label", () => {
    expect(adsSendTo(nested, "contact_submit")).toBeNull();
  });

  it("falls back to the legacy flat labels map (lead_submit alias)", () => {
    const legacy: GoogleAdsConfig = { tag_id: "AW-1", labels: { lead_submit: "OLD" } };
    expect(adsSendTo(legacy, "quote_submit")).toBe("AW-1/OLD");
  });

  it("falls back to the oldest single-label field for quote_submit only", () => {
    const oldest: GoogleAdsConfig = { tag_id: "AW-1", lead_conversion_label: "OLDEST" };
    expect(adsSendTo(oldest, "quote_submit")).toBe("AW-1/OLDEST");
    expect(adsSendTo(oldest, "quote_start")).toBeNull();
  });

  it("returns null without a tag_id", () => {
    expect(adsSendTo({ conversions: { ecp: { quote_submit: { label: "X" } } } }, "quote_submit")).toBeNull();
    expect(adsSendTo(undefined, "quote_submit")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/googleAds.test.ts`
Expected: FAIL — current (uncommitted) `GoogleAdsConfig.conversions` is keyed by event, not product; type errors and/or wrong resolution.

- [ ] **Step 3: Restructure `googleAds.ts`**

Replace the config-shape section of `src/lib/googleAds.ts` (everything from the top-of-file comment through `LEGACY_LABEL_KEYS`) with:

```ts
// Client-side Google Ads conversion helpers. The tag itself is loaded by
// GoogleAdsTag (Consent Mode v2, idle-loaded); config comes from Directus
// site_settings.global_config.google_ads:
//   { tag_id, conversions: { <product>: { <event>: { label, ...metadata } } } }
// Only `label` is functional — the other conversion fields document the
// Ads-side setup (action_name, category, optimization, enhanced_conversions).
// A conversion only fires when tag_id and the product+event label are set.

import { DEFAULT_PRODUCT, type Product } from "@/lib/products";

export type GoogleAdsEvent = "quote_submit" | "quote_start" | "contact_submit";

export interface GoogleAdsConversionEntry {
  label?: string | null;
  action_name?: string;
  category?: string;
  optimization?: "primary" | "secondary";
  enhanced_conversions?: boolean;
}

export interface GoogleAdsConfig {
  tag_id?: string | null;
  account_id?: string | null;
  conversions?: Partial<
    Record<Product, Partial<Record<GoogleAdsEvent, GoogleAdsConversionEntry | null>> | null>
  > | null;
  /** legacy flat map (pre-2026-07 config shape; `lead_submit` = today's `quote_submit`) */
  labels?: Record<string, string | null> | null;
  /** legacy single-label field, older still */
  lead_conversion_label?: string | null;
}

/** Config keys an event was previously stored under, newest shape first. */
const LEGACY_LABEL_KEYS: Partial<Record<GoogleAdsEvent, string>> = {
  quote_submit: "lead_submit",
};
```

And replace `adsSendTo` with:

```ts
export function adsSendTo(
  config: GoogleAdsConfig | undefined | null,
  event: GoogleAdsEvent,
  product: Product = DEFAULT_PRODUCT,
): string | null {
  const l =
    config?.conversions?.[product]?.[event]?.label ??
    config?.labels?.[event] ??
    config?.labels?.[LEGACY_LABEL_KEYS[event] ?? ""] ??
    (event === "quote_submit" ? config?.lead_conversion_label : null);
  return config?.tag_id && l ? `${config.tag_id}/${l}` : null;
}
```

(`AdsUserData`, `fireAdsConversion`, and the rest of the file stay unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/googleAds.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Update call sites to pass the product**

`src/components/quote/QuoteForm.tsx` — the form's product comes from the Directus page config. Near the top of the component body (where `pageConfig` is in scope), add:

```ts
  const product = normalizeProduct((pageConfig as Record<string, unknown> | undefined)?.product);
```

with import:

```ts
import { normalizeProduct } from "@/lib/products";
```

Then line ~395: `adsSendTo(gc.google_ads, "quote_start")` → `adsSendTo(gc.google_ads, "quote_start", product)`
and line ~1817: `adsSendTo(gc.google_ads, "quote_submit")` → `adsSendTo(gc.google_ads, "quote_submit", product)`.

Also include the product in the submit POST body (line ~1771), so Task 3's `body.product` is real — add `product,` to the `JSON.stringify({ ...formData, lang, attribution, ... })` object:

```ts
body: JSON.stringify({ ...formData, lang, product, attribution, posthog: phIds, ...(miniQuoteSessionTokenRef.current && { miniQuoteSessionToken: miniQuoteSessionTokenRef.current }) }),
```

`src/components/ContactForm.tsx` line ~206: leave as `adsSendTo(googleAds, "contact_submit")` — contact is not product-scoped; the default-product lookup is correct.

`src/app/[lang]/[slug]/[sub1]/page.tsx` line ~1068: leave as `adsSendTo(googleAds, "quote_submit")` (default product). Add this comment above it:

```ts
    // NOTE: quote-success doesn't know which product's funnel it terminates —
    // defaults to DEFAULT_PRODUCT. When a second product gets its own quote
    // funnel, give its success route its own product here.
```

- [ ] **Step 6: Typecheck + full tests + lint on touched files**

Run: `npx tsc --noEmit && npm test && npx eslint src/lib/googleAds.ts src/lib/googleAds.test.ts src/components/quote/QuoteForm.tsx "src/app/[lang]/[slug]/[sub1]/page.tsx"`
Expected: tsc clean; all tests pass; no NEW lint errors (the files have pre-existing warnings/errors — compare against `git stash`-free baseline only if in doubt).

- [ ] **Step 7: PATCH Directus config to the nested shape**

```bash
export DIRECTUS_URL=$(grep -E '^DIRECTUS_URL=' .env.local | cut -d= -f2) DIRECTUS_STATIC_TOKEN=$(grep -E '^DIRECTUS_STATIC_TOKEN=' .env.local | cut -d= -f2)
/usr/bin/curl -s "$DIRECTUS_URL/items/site_settings?fields=global_config" -H "Authorization: Bearer $DIRECTUS_STATIC_TOKEN" -o /tmp/gc.json
python3 - <<'EOF'
import json
d = json.load(open('/tmp/gc.json'))
gc = d['data']['global_config']
ga = gc['google_ads']
# nest existing flat v2 conversions under the product key (idempotent)
if 'conversions' in ga and 'quote_submit' in ga.get('conversions', {}):
    ga['conversions'] = {'ecp': ga['conversions']}
if 'offline_conversions' in ga and 'quote_submitted_api' in ga.get('offline_conversions', {}):
    ga['offline_conversions'] = {'ecp': ga['offline_conversions']}
json.dump({'global_config': gc}, open('/tmp/gc.patch.json', 'w'))
print(json.dumps(ga, indent=2))
EOF
/usr/bin/curl -s -X PATCH "$DIRECTUS_URL/items/site_settings" \
  -H "Authorization: Bearer $DIRECTUS_STATIC_TOKEN" -H "Content-Type: application/json" \
  --data-binary @/tmp/gc.patch.json -o /dev/null -w "PATCH status: %{http_code}\n"
```

Expected: printed `google_ads` matches the target-state JSON above; `PATCH status: 200`. Verify with a fresh GET that `conversions.ecp.quote_submit.label == "6PDrCO2Zq9YcENqx8asB"`.

- [ ] **Step 8: Commit (this commit includes the pre-existing uncommitted ads refactor)**

```bash
git add src/lib/googleAds.ts src/lib/googleAds.test.ts src/components/quote/QuoteForm.tsx src/components/ContactForm.tsx "src/app/[lang]/[slug]/[sub1]/page.tsx"
git commit -m "feat(ads): product-aware conversion config (conversions[product][event])

Includes the quote_submit rename refactor (config-driven labels moved from
flat labels map to nested per-product entries; legacy fallbacks retained)."
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/operations/partner-dispatch.md` (Google Ads / Data Manager section, after line ~208)
- Modify: `CLAUDE.md` (no dedicated ads section exists — add one line to the Architecture notes is enough; skip if it feels forced)

**Interfaces:** none (docs only).

- [ ] **Step 1: Document the product dimension in partner-dispatch.md**

Append to the "Google Ads conversions via the Data Manager API" section:

```markdown
### Product dimension

The webhook payload's `submission.product` (e.g. `"ecp"`) identifies the lead
vertical (source of truth: `src/lib/products.ts`). The Make ingest module
currently targets one conversion action (`productDestinationId: 7076158233`,
"ECP Quote Form Submitted (API)").

**When a second product launches:**
1. Create its offline conversion action in the Ads UI (primary, own category).
2. In the Make scenario, add a router switching on `submission.product` (or an
   `if()` on the `productDestinationId` field) mapping product → conversion
   action ID.
3. Add the browser conversion actions and put their labels in Directus
   `global_config.google_ads.conversions.<product>.<event>.label`.
4. Add the product column to partner pricing policies
   (`pricing_policy.settings.prices[<product>][<category>]`).
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations/partner-dispatch.md
git commit -m "docs(dispatch): product dimension and second-product runbook"
```

(If CLAUDE.md was touched, include it in the same commit.)

---

### Task 7: End-to-end verification

**Files:** none created; verification only.

- [ ] **Step 1: Full gates**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean; lint no worse than baseline (repo has pre-existing errors — compare counts against `git stash && npm run lint; git stash pop` if needed); all tests pass.

- [ ] **Step 2: Exercise the quote API end-to-end (dev server)**

```bash
npm run dev &   # or use the running dev server
sleep 8
/usr/bin/curl -s -X POST http://localhost:3000/api/quote \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"Product","email":"test-product@example.com","phone":"+41791234567","lang":"fr","canton":"VD","postalCode":"1000","locality":"Lausanne","product":"ecp","attribution":{}}'
```

Expected: `{"success":true,"submissionId":"..."}`. Then verify the stored row:

```bash
export DIRECTUS_URL=$(grep -E '^DIRECTUS_URL=' .env.local | cut -d= -f2) DIRECTUS_STATIC_TOKEN=$(grep -E '^DIRECTUS_STATIC_TOKEN=' .env.local | cut -d= -f2)
/usr/bin/curl -s "$DIRECTUS_URL/items/form_submissions/<submissionId>?fields=id,product,form_type,environment" \
  -H "Authorization: Bearer $DIRECTUS_STATIC_TOKEN" | python3 -m json.tool
```

Expected: `"product": "ecp"`, `"environment": "development"`. Also POST once with `"product":"bogus"` and verify the stored row still reads `"product": "ecp"` (normalization works). Note: these dev submissions fire the real Make webhook with `environment: "development"` — Make's test filters skip them (test-pattern email), which is the existing expected behavior.

- [ ] **Step 3: Report**

Summarize: commits made, Directus schema/config changes applied (field + backfill + nested google_ads), the deploy note (after prod deploy, delete the legacy `labels` block from Directus `google_ads`), and anything skipped.

---

## Self-Review (done at plan time)

- **Coverage:** form (QuoteForm POST body + pageConfig source) ✓ Task 5; API validation ✓ Task 3; storage ✓ Tasks 2-3; dispatch ✓ Task 3 (runDispatch already product-aware); webhook ✓ Task 3; manual dispatch ✓ Task 3; mini-quote ✓ Task 4; browser Ads config ✓ Task 5; server-side Ads (Data Manager) ✓ payload carries product now, Make mapping documented for product #2 (Task 6) — no Make change needed while one product exists.
- **Placeholders:** none — every code step shows the code.
- **Type consistency:** `Product`/`DEFAULT_PRODUCT`/`normalizeProduct` (Task 1) used in Tasks 3-5; `QuoteWebhookParts.submission.product: string` (not `Product`) because manual dispatch reads it from a DB row — normalized at both entry points; `adsSendTo(config, event, product?)` signature consistent across Task 5 test and call sites.
