# Webhook Payload Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the quote webhook payload with `submission.ref`, `submission.request_url`, per-target `crmUrl`, and a `CH` phone-parse fallback — all computed in the shared payload builder so both the quote route and the manual-dispatch route benefit.

**Architecture:** Two tasks. Task 1 surfaces the partner `dashboardToken` onto `DispatchTarget` (data-model change in the dispatch lib). Task 2 does all the enrichment inside `buildQuoteWebhookPayload` (parsePhone default, `buildQuoteRef` helper, `ref` + `request_url` on the submission block, `crmUrl` mapped onto each target), consuming Task 1's `dashboardToken`.

**Tech Stack:** TypeScript, Next.js server code, libphonenumber-js. No runtime deps added.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-webhook-payload-enrichment-design.md`.
- Repo has NO test framework. Verify every task with `npx tsc --noEmit` and `npx eslint <changed files>`; runtime-verify via a manual dispatch against staging/prod (safe: a test-email submission → `skipped_test`).
- Additive only — no existing payload field may change value or shape. New keys: `submission.ref`, `submission.request_url`, `targets[].crmUrl`, `targets[].dashboardToken`.
- `ref` format EXACT: `P / {UPPER(trim(lastName))} / {postalCode} {locality} / {YYYY-MM-DD(submittedAt)}` — e.g. `P / MIRRAZAVI / 1110 Morges / 2026-07-12`. Missing pieces render empty; the `P / … / … / …` skeleton is always present.
- `request_url` = `{host}{locationPath}/{id}` with `host = locationHost ? "https://"+locationHost : SITE_URL`. `SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch"`.
- `crmUrl` = `${SITE_URL}/${target.language}/partners/${dashboardToken}/leads`, or `null` when `dashboardToken` is null.
- Deploy via standard staging→main flow after both tasks pass.

---

### Task 1: Surface `dashboardToken` on the dispatch target

**Files:**
- Modify: `src/lib/dispatch/types.ts` (`DispatchTarget` interface)
- Modify: `src/lib/dispatch/resolver.ts` (`toTarget` return object)

**Interfaces:**
- Produces: `DispatchTarget.dashboardToken: string | null` — the partner's `dashboard_token`, used by Task 2 to build `crmUrl`.

- [ ] **Step 1: Add the field to `DispatchTarget`**

In `src/lib/dispatch/types.ts`, add to the `DispatchTarget` interface, right after the `address: TargetAddress;` line:

```ts
  address: TargetAddress;
  // Partner dashboard credential — surfaced so the webhook can build the
  // partner's CRM URL. Null when the partner has no token.
  dashboardToken: string | null;
```

- [ ] **Step 2: Populate it in `toTarget`**

In `src/lib/dispatch/resolver.ts`, in the object returned by `toTarget`, add `dashboardToken` right after the `address: { ... }` block (before `priceChf`):

```ts
    address: {
      streetName: p.street_name ?? null,
      streetNumber: p.street_number ?? null,
      postalCode: p.postal_code ?? null,
      locality: p.locality ?? null,
      canton: p.canton?.code ?? null,
    },
    dashboardToken: p.dashboard_token ?? null,
    priceChf,
    leadCategory,
    gift,
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/lib/dispatch/types.ts src/lib/dispatch/resolver.ts`
Expected: no errors. (`p.dashboard_token` is a valid field on the `Partner` type and is already fetched via `PARTNER_AREA_FIELDS`.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/dispatch/types.ts src/lib/dispatch/resolver.ts
git commit -m "feat(dispatch): surface dashboardToken on DispatchTarget"
```

---

### Task 2: Enrich the webhook payload

**Files:**
- Modify: `src/lib/dispatch/webhook.ts` (`parsePhone` signature; add `buildQuoteRef`; extend `buildQuoteWebhookPayload`)

**Interfaces:**
- Consumes: `DispatchTarget.dashboardToken` (Task 1); `DispatchTarget.language`.
- Produces: `buildQuoteRef(input): string`; payload gains `submission.ref`, `submission.request_url`, `dispatch.targets[].crmUrl`.

- [ ] **Step 1: Default `parsePhone` country to `CH`**

In `src/lib/dispatch/webhook.ts`, change the `parsePhone` signature (line ~9):

```ts
export function parsePhone(raw: string | null | undefined, defaultCountry: string = "CH") {
```

(Body unchanged. The quote route passes an explicit country, so this only changes callers that omit it — the manual-dispatch route.)

- [ ] **Step 2: Add the `buildQuoteRef` helper**

In `src/lib/dispatch/webhook.ts`, add this exported function above `buildQuoteWebhookPayload`:

```ts
/**
 * Human-readable reference shown in partner emails/SMS. Format:
 *   P / {UPPER(trim(lastName))} / {postalCode} {locality} / {YYYY-MM-DD}
 * Missing pieces render as empty segments; the skeleton is always present.
 */
export function buildQuoteRef(input: {
  lastName: string | null;
  postalCode: string | null;
  locality: string | null;
  submittedAt: string;
}): string {
  const last = (input.lastName ?? "").trim().toUpperCase();
  const postal = (input.postalCode ?? "").trim();
  const loc = (input.locality ?? "").trim();
  const date = (input.submittedAt ?? "").slice(0, 10);
  return `P / ${last} / ${postal} ${loc} / ${date}`;
}
```

- [ ] **Step 3: Extend `buildQuoteWebhookPayload`**

Replace the entire `buildQuoteWebhookPayload` function body with:

```ts
export function buildQuoteWebhookPayload(parts: QuoteWebhookParts) {
  const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";
  const data = parts.submission.data;
  const postalCode = typeof data.postalCode === "string" ? data.postalCode : "";
  const locality = typeof data.locality === "string" ? data.locality : "";

  const ref = buildQuoteRef({
    lastName: parts.user.lastName,
    postalCode,
    locality,
    submittedAt: parts.submission.submittedAt,
  });

  const host = parts.submission.locationHost
    ? `https://${parts.submission.locationHost}`
    : SITE_URL;
  const request_url = `${host}${parts.submission.locationPath ?? ""}/${parts.submission.id}`;

  const dispatch = {
    ...parts.dispatch,
    targets: parts.dispatch.targets.map((t) => ({
      ...t,
      crmUrl: t.dashboardToken
        ? `${SITE_URL}/${t.language}/partners/${t.dashboardToken}/leads`
        : null,
    })),
  };

  return {
    submission: {
      id: parts.submission.id,
      formType: "quote",
      locationRoute: "quote",
      locationHost: parts.submission.locationHost,
      locationPath: parts.submission.locationPath,
      submittedAt: parts.submission.submittedAt,
      environment: parts.submission.environment,
      miniQuoteSessionToken: parts.submission.miniQuoteSessionToken,
      product: "ecp",
      leadCategory: parts.submission.leadCategory,
      isRepeat: parts.submission.isRepeat,
      trigger: parts.trigger,
      ref,
      request_url,
      data: parts.submission.data,
    },
    user: parts.user,
    session: parts.session,
    posthog: parts.posthog,
    attribution: parts.attribution,
    dispatch,
  };
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/lib/dispatch/webhook.ts`
Expected: no errors. Confirm the only additions vs. before are `submission.ref`, `submission.request_url`, and `targets[].crmUrl`; every pre-existing key/value is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dispatch/webhook.ts
git commit -m "feat(dispatch): add ref, request_url, crmUrl + CH phone fallback to webhook payload"
```

- [ ] **Step 6: Runtime verification (controller, after deploy)**

Deploy to staging, then manually dispatch a test-email submission and inspect the payload delivered to Make:
- `user.phone.international` is now populated (e.g. `+41 78 951 44 97`) and `countryCode: "CH"`.
- `submission.ref` matches `P / {UPPER(lastName)} / {postalCode} {locality} / {YYYY-MM-DD}`.
- `submission.request_url` is a fully-qualified `https://…{locationPath}/{id}` URL.
- `targets[].crmUrl` — a test-email dispatch has empty targets, so verify this on a real dispatched target (staging real-email submission, or by reading a prior real payload). Expected: `https://easyrecharge.ch/{lang}/partners/{token}/leads`.

---

## Self-Review

**Spec coverage:**
- Phone country fallback → Task 2 Step 1. ✓
- `submission.ref` (exact format, trim lastName) → Task 2 Steps 2-3 (`buildQuoteRef`). ✓
- `submission.request_url` (locationHost || SITE_URL) → Task 2 Step 3. ✓
- `targets[].crmUrl` (needs `dashboardToken`) → Task 1 (surface token) + Task 2 Step 3 (build url). ✓
- Additive only → payload builder preserves all prior keys verbatim; verified in Step 4. ✓

**Placeholder scan:** No TBD/TODO. The `{lang}`/`{token}` in the verification step are runtime values, not code placeholders.

**Type consistency:** `dashboardToken: string | null` defined on `DispatchTarget` in Task 1 and read as `t.dashboardToken` in Task 2. `buildQuoteRef` signature `{ lastName, postalCode, locality, submittedAt } → string` defined and called consistently in Task 2. `t.language` is the existing `Language` field on `DispatchTarget`. `SITE_URL` fallback string identical in both request_url and crmUrl derivations.
