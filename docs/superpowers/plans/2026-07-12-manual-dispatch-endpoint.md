# Manual Dispatch Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/admin/dispatch/[submissionId]` so an operator can dispatch an existing form submission that was never dispatched — resolving partner targets, writing the ledger, and firing the Make webhook.

**Architecture:** Extract the quote route's webhook code into a shared `src/lib/dispatch/webhook.ts` used by both the quote route and the new admin route (one payload shape, one `trigger` field). Add an optional `modeOverride` to `runDispatch` so the admin route forces `live` resolution regardless of the global `DISPATCH_MODE`. The admin route reconstructs `runDispatch` inputs from the stored `submission`/`user`/`session` records.

**Tech Stack:** Next.js 16 App Router (route handlers), TypeScript, Directus REST (`directusFetch`), libphonenumber-js, PostHog server SDK.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-manual-dispatch-endpoint-design.md`.
- Admin auth: `x-admin-token` header must equal `process.env.DIRECTUS_STATIC_TOKEN` (same gate as `src/app/api/admin/reconcile-billing/route.ts`).
- No test framework exists in this repo. Verify every task with `npx tsc --noEmit` and `npx eslint <files>`; exercise runtime behavior with `curl` against **staging** (never production during implementation).
- The refactored quote-route webhook payload must stay **byte-identical** to today's output except for the added `submission.trigger` field.
- `trigger` values: `"quote_submission"` (quote route) and `"manual_dispatch"` (admin route). Value describes the source, not dispatch history.
- Webhook fires on **every** call regardless of `targetCount` (it also drives the customer confirmation email).
- Deploy flow when done (per CLAUDE.md): `git push origin staging` first; production only on explicit go-ahead.

---

### Task 1: Add `modeOverride` to `runDispatch`

**Files:**
- Modify: `src/lib/dispatch/index.ts` (interface `RunDispatchInput` ~lines 59-67; `runDispatch` body ~line 75)

**Interfaces:**
- Produces: `RunDispatchInput.modeOverride?: DispatchMode` — when set, `runDispatch` uses it instead of reading `DISPATCH_MODE` from the environment.

- [ ] **Step 1: Add the optional field to `RunDispatchInput`**

In `src/lib/dispatch/index.ts`, add to the `RunDispatchInput` interface (after `product?`):

```ts
  /** Product key for pricing + future quote funnels. Defaults to "ecp". */
  product?: string;
  /**
   * Force a specific dispatch mode, ignoring the DISPATCH_MODE env var. Used by
   * the manual admin dispatch endpoint to resolve as `live` even when the global
   * mode is `off`/`shadow`. The quote route never sets this.
   */
  modeOverride?: DispatchMode;
```

- [ ] **Step 2: Use the override in `runDispatch`**

In `runDispatch`, change the first line of the body:

```ts
  const mode = input.modeOverride ?? getDispatchMode();
```

(replacing `const mode = getDispatchMode();`)

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/lib/dispatch/index.ts`
Expected: no errors. The quote route is unaffected (it never passes `modeOverride`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/dispatch/index.ts
git commit -m "feat(dispatch): optional modeOverride on runDispatch"
```

---

### Task 2: Extract shared webhook module + refactor quote route

**Files:**
- Create: `src/lib/dispatch/webhook.ts`
- Modify: `src/app/api/quote/route.ts` (remove local `parsePhone` ~lines 10-21 and `getQuoteWebhookUrl` ~lines 24-37; replace the webhook block ~lines 143-218)

**Interfaces:**
- Consumes: `DispatchResult` from `./types`.
- Produces:
  - `parsePhone(raw: string | null | undefined, defaultCountry?: string): { raw: string | null; international: string | null; countryCode: string | null; countryCallingCode: string | null }`
  - `getQuoteWebhookUrl(): Promise<string | null>`
  - `type WebhookTrigger = "quote_submission" | "manual_dispatch"`
  - `interface QuoteWebhookParts` (see code)
  - `buildQuoteWebhookPayload(parts: QuoteWebhookParts): QuoteWebhookPayload`
  - `fireQuoteWebhook(url: string, payload: QuoteWebhookPayload, ctx: { submissionId: string; distinctId: string | null }): Promise<{ ok: boolean; status?: number; error?: string }>`

- [ ] **Step 1: Create `src/lib/dispatch/webhook.ts`**

```ts
import { after } from "next/server";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { directusFetch } from "@/lib/directus";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";
import type { DispatchResult } from "./types";

export type WebhookTrigger = "quote_submission" | "manual_dispatch";

export function parsePhone(raw: string | null | undefined, defaultCountry?: string) {
  if (!raw) return { raw: null, international: null, countryCode: null, countryCallingCode: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = parsePhoneNumberFromString(raw, (defaultCountry as any) ?? undefined);
  if (!parsed) return { raw, international: null, countryCode: null, countryCallingCode: null };
  return {
    raw,
    international: parsed.formatInternational(),
    countryCode: parsed.country ?? null,
    countryCallingCode: `+${parsed.countryCallingCode}`,
  };
}

export async function getQuoteWebhookUrl(): Promise<string | null> {
  try {
    const result = await directusFetch<{ data: { global_config?: { webhooks?: { quote?: string } } }[] }>(
      `/items/site_settings?fields=global_config&filter[status][_eq]=published`,
      { next: { revalidate: 3600 } },
    );
    const raw = result?.data;
    const record = Array.isArray(raw) ? raw[0] : raw;
    return record?.global_config?.webhooks?.quote ?? null;
  } catch {
    return null;
  }
}

export interface QuoteWebhookParts {
  submission: {
    id: string;
    locationHost: string | null;
    locationPath: string | null;
    submittedAt: string;
    environment: string;
    miniQuoteSessionToken: string | null;
    leadCategory: string;
    isRepeat: boolean;
    data: Record<string, unknown>;
  };
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: ReturnType<typeof parsePhone>;
    language: string | null;
  };
  session: {
    id: string;
    token: string | null;
    locale: string | null;
    userAgent: string | null;
    ip: string | null;
  };
  posthog: { distinctId: string | null; personUrl: string | null };
  attribution: Record<string, unknown>;
  dispatch: DispatchResult;
  trigger: WebhookTrigger;
}

export function buildQuoteWebhookPayload(parts: QuoteWebhookParts) {
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
      data: parts.submission.data,
    },
    user: parts.user,
    session: parts.session,
    posthog: parts.posthog,
    attribution: parts.attribution,
    dispatch: parts.dispatch,
  };
}

export type QuoteWebhookPayload = ReturnType<typeof buildQuoteWebhookPayload>;

export async function fireQuoteWebhook(
  url: string,
  payload: QuoteWebhookPayload,
  ctx: { submissionId: string; distinctId: string | null },
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[Quote] Webhook returned:", res.status);
      serverLog("WARNING", "Webhook returned non-OK status", { route: "quote", status: res.status, submission_id: ctx.submissionId });
      const posthog = getPostHogServer();
      posthog.capture({
        distinctId: ctx.distinctId ?? "anonymous",
        event: "server_webhook_failed",
        properties: { form_type: "quote", submission_id: ctx.submissionId, status: res.status },
      });
      after(() => posthog.flush());
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.error("[Quote] Webhook failed:", err);
    serverLog("ERROR", "Webhook delivery failed", { route: "quote", submission_id: ctx.submissionId, error: err instanceof Error ? err.message : String(err) });
    const posthog = getPostHogServer();
    posthog.captureException(err, ctx.distinctId ?? "anonymous", {
      form_type: "quote",
      submission_id: ctx.submissionId,
      context: "webhook_delivery",
    });
    after(() => posthog.flush());
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 2: Typecheck the new module in isolation**

Run: `npx tsc --noEmit && npx eslint src/lib/dispatch/webhook.ts`
Expected: no errors.

- [ ] **Step 3: Refactor the quote route to use the shared module**

In `src/app/api/quote/route.ts`:

1. Delete the local `parsePhone` function (~lines 10-21) and the local `getQuoteWebhookUrl` function (~lines 24-37).
2. Add to the imports at the top:

```ts
import { getQuoteWebhookUrl, parsePhone, buildQuoteWebhookPayload, fireQuoteWebhook } from "@/lib/dispatch/webhook";
```

3. Replace the entire webhook block (from `// Fire webhook` ~line 143 through the closing of the `if (webhookUrl) { ... }` at ~line 218) with:

```ts
    // Fire webhook
    const webhookUrl = await getQuoteWebhookUrl();
    if (webhookUrl) {
      const phDistinctId = phIds.phDistinctId ?? null;
      const posthogDashboard = "https://eu.posthog.com/project/103083";
      const isRepeat = (dispatchResult.dedup?.skippedPartnerSlugs?.length ?? 0) > 0;

      const payload = buildQuoteWebhookPayload({
        submission: {
          id: submission.id,
          locationHost: refererUrl?.host ?? req.headers.get("host") ?? null,
          locationPath: refererUrl?.pathname ?? null,
          submittedAt: new Date().toISOString(),
          environment: process.env.VERCEL_ENV || "development",
          miniQuoteSessionToken: miniQuoteToken || null,
          leadCategory,
          isRepeat,
          data: quoteData,
        },
        user: {
          id: formUser.id,
          email,
          firstName,
          lastName,
          phone: parsePhone(phone, phoneCountry),
          language: lang ?? null,
        },
        session: {
          id: session.id,
          token: session.session_token ?? null,
          locale: lang ?? req.headers.get("accept-language")?.split(",")[0] ?? null,
          userAgent: req.headers.get("user-agent") ?? null,
          ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        },
        posthog: {
          distinctId: phDistinctId,
          personUrl: phDistinctId ? `${posthogDashboard}/person/${phDistinctId}` : null,
        },
        attribution: body.attribution ?? {},
        dispatch: dispatchResult,
        trigger: "quote_submission",
      });

      await fireQuoteWebhook(webhookUrl, payload, { submissionId: submission.id, distinctId: phDistinctId });
    }
```

- [ ] **Step 4: Verify payload parity**

Confirm the assembled object has the same keys/values as before. Read the new block and check against the original: `submission` gains only `trigger`; `formType`/`locationRoute`/`product` are still set to `"quote"`/`"quote"`/`"ecp"` inside `buildQuoteWebhookPayload`; `user`, `session`, `posthog`, `attribution`, `dispatch` are unchanged.

Run: `npx tsc --noEmit && npx eslint src/app/api/quote/route.ts src/lib/dispatch/webhook.ts`
Expected: no errors. If `parsePhone` or `getQuoteWebhookUrl` is now reported unused elsewhere, confirm the local copies were deleted.

- [ ] **Step 5: Runtime parity check on staging**

Deploy the branch to staging (`git push origin staging` after Step 6, or run `npm run dev`). Send a test quote (test-pattern email) and confirm the Make execution shows the payload with `submission.trigger: "quote_submission"` and all previous fields present.

Run (local dev): `npm run dev` then
```bash
curl -s -X POST http://localhost:3000/api/quote -H "Content-Type: application/json" \
  --data '{"firstName":"T","lastName":"Est","email":"yoan.basset+parity@easyrecharge.ch","lang":"fr","canton":"VD","housingStatus":"owner","solarEquipment":"none","acceptTerms":true}'
```
Expected: `{"success":true,"submissionId":"..."}` and a webhook payload carrying `trigger`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dispatch/webhook.ts src/app/api/quote/route.ts
git commit -m "refactor(quote): extract shared webhook module + add trigger field"
```

---

### Task 3: Manual dispatch admin endpoint

**Files:**
- Create: `src/app/api/admin/dispatch/[submissionId]/route.ts`

**Interfaces:**
- Consumes: `storage.getSubmissionById` (returns `{ submission, user, session } | null`), `runDispatch` (with `modeOverride`), `deriveLeadCategory`, `normalizeCanton`, `getEnvironment`, and the Task 2 webhook exports.
- Produces: the HTTP endpoint. No exported symbols.

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from "next/server";
import { storage } from "@/lib/directus-storage";
import { directusFetch } from "@/lib/directus";
import { runDispatch } from "@/lib/dispatch";
import { deriveLeadCategory } from "@/lib/dispatch/categorize";
import {
  getQuoteWebhookUrl,
  parsePhone,
  buildQuoteWebhookPayload,
  fireQuoteWebhook,
} from "@/lib/dispatch/webhook";
import { serverLog } from "@/lib/posthog-server";

/**
 * Manually dispatch an existing submission that was never dispatched.
 * Token-gated. Resolves as `live`, writes the ledger, always fires the Make
 * webhook (which also drives the customer confirmation email).
 *
 *   curl -X POST -H "x-admin-token: $DIRECTUS_STATIC_TOKEN" \
 *     "https://.../api/admin/dispatch/<submissionId>"
 *   curl -X POST -H "x-admin-token: $DIRECTUS_STATIC_TOKEN" \
 *     "https://.../api/admin/dispatch/<submissionId>?force=1"
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const adminToken = process.env.DIRECTUS_STATIC_TOKEN;
  const header = req.headers.get("x-admin-token");
  if (!adminToken || header !== adminToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { submissionId } = await params;
  const force = new URL(req.url).searchParams.get("force") === "1";

  // Load the stored submission + linked user/session.
  const record = await storage.getSubmissionById(submissionId);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { submission, user, session } = record;

  // Guard: refuse if already dispatched, unless forced. Single-hop M2O filter.
  const guardParams = new URLSearchParams();
  guardParams.set("fields", "id");
  guardParams.set("filter[submission][_eq]", submissionId);
  guardParams.set("filter[status][_eq]", "dispatched");
  guardParams.set("limit", "1");
  const guard = await directusFetch<{ data: { id: string }[] }>(
    `/items/partner_dispatches?${guardParams}`,
    { next: { revalidate: 0 } },
  );
  const existing = guard?.data?.length ?? 0;
  if (existing > 0 && !force) {
    return NextResponse.json({ error: "already_dispatched", existing }, { status: 409 });
  }

  // Reconstruct dispatch inputs from stored data.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (submission.data ?? {}) as Record<string, any>;
  const email = user?.email ?? null;
  const locale = user?.language === "de" ? "de" : "fr";
  const leadCategory = deriveLeadCategory(data);
  const rawCanton = typeof data.canton === "string" ? data.canton : null;

  const dispatchResult = await runDispatch({
    submissionId,
    rawCanton,
    email,
    locale,
    leadCategory,
    product: "ecp",
    modeOverride: "live",
  });

  // Always fire the webhook (customer confirmation + partner notification).
  let webhookFired = false;
  const webhookUrl = await getQuoteWebhookUrl();
  if (webhookUrl && email) {
    const phDistinctId = session?.ph_distinct_id ?? null;
    const posthogDashboard = "https://eu.posthog.com/project/103083";
    const payload = buildQuoteWebhookPayload({
      submission: {
        id: submission.id,
        locationHost: null,
        locationPath: submission.location_path ?? null,
        submittedAt: new Date().toISOString(),
        environment: submission.environment ?? "production",
        miniQuoteSessionToken: null,
        leadCategory,
        isRepeat: (dispatchResult.dedup?.skippedPartnerSlugs?.length ?? 0) > 0,
        data,
      },
      user: {
        id: user?.id ?? "",
        email,
        firstName: user?.first_name ?? null,
        lastName: user?.last_name ?? null,
        phone: parsePhone(user?.phone ?? null),
        language: user?.language ?? null,
      },
      session: {
        id: session?.id ?? "",
        token: session?.session_token ?? null,
        locale: session?.locale ?? locale,
        userAgent: session?.user_agent ?? null,
        ip: null,
      },
      posthog: {
        distinctId: phDistinctId,
        personUrl: phDistinctId ? `${posthogDashboard}/person/${phDistinctId}` : null,
      },
      attribution: {},
      dispatch: dispatchResult,
      trigger: "manual_dispatch",
    });
    const fired = await fireQuoteWebhook(webhookUrl, payload, {
      submissionId: submission.id,
      distinctId: phDistinctId,
    });
    webhookFired = fired.ok;
    if (!fired.ok) {
      serverLog("WARNING", "Manual dispatch webhook not delivered", {
        route: "admin/dispatch",
        submission_id: submission.id,
        status: fired.status,
        error: fired.error,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    submissionId: submission.id,
    mode: dispatchResult.mode,
    isTest: dispatchResult.isTest,
    targetCount: dispatchResult.targets.length,
    webhookFired,
    dispatch: dispatchResult,
  });
}
```

- [ ] **Step 2: Reconcile field names against the storage types**

Confirm the property names used above exist on the returned records. Read `src/lib/directus-storage.ts` and check `FormSubmission` (expects `id`, `data`, `environment`, `location_path`), `FormUser` (`id`, `email`, `first_name`, `last_name`, `phone`, `language`), and `FormSession` (`id`, `session_token`, `locale`, `user_agent`, `ph_distinct_id`). If any differ, adjust the field accesses to match the actual type.

Run: `grep -nE "first_name|last_name|session_token|ph_distinct_id|location_path|user_agent|interface FormSubmission|interface FormUser|interface FormSession" src/lib/directus-storage.ts`
Expected: the referenced fields exist; fix any mismatches inline.

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/api/admin/dispatch/[submissionId]/route.ts"`
Expected: no errors.

- [ ] **Step 4: Exercise all branches on staging**

Push to staging: `git push origin staging`. Then, with `TOKEN=$DIRECTUS_STATIC_TOKEN` and the **staging** base URL:

Case A — not-dispatched, real email (expect `dispatched`, `webhookFired:true`):
```bash
curl -s -X POST -H "x-admin-token: $TOKEN" \
  "https://<staging-host>/api/admin/dispatch/<not-dispatched-submission-id>" | python3 -m json.tool
```
Expected: `targetCount >= 1`, `isTest:false`, `dispatch.targets[0].priceChf` set.

Case B — test-email submission (expect `skipped_test`, empty targets, webhook still fired):
```bash
curl -s -X POST -H "x-admin-token: $TOKEN" \
  "https://<staging-host>/api/admin/dispatch/<test-email-submission-id>" | python3 -m json.tool
```
Expected: `isTest:true`, `targetCount:0`, `webhookFired:true`.

Case C — already-dispatched guard + force:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "x-admin-token: $TOKEN" \
  "https://<staging-host>/api/admin/dispatch/<already-dispatched-id>"        # expect 409
curl -s -w "\n%{http_code}\n" -X POST -H "x-admin-token: $TOKEN" \
  "https://<staging-host>/api/admin/dispatch/<already-dispatched-id>?force=1"  # expect 200
```

Case D — auth + not-found:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://<staging-host>/api/admin/dispatch/whatever"                       # expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "x-admin-token: $TOKEN" "https://<staging-host>/api/admin/dispatch/00000000-0000-0000-0000-000000000000"  # expect 404
```

Verify Case A/B wrote the expected ledger rows: `GET /api/debug/dispatches?env=staging&limit=5`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/admin/dispatch/[submissionId]/route.ts"
git commit -m "feat(dispatch): manual dispatch admin endpoint"
```

---

### Task 4: Document the endpoint in the operations guide

**Files:**
- Modify: `docs/operations/partner-dispatch.md` (add a section)

- [ ] **Step 1: Add an operations section**

Append to `docs/operations/partner-dispatch.md`:

```markdown
## Manually dispatching a submission

To dispatch an existing submission that was never dispatched (e.g. submitted
while `DISPATCH_MODE=off`, or that had no partner at the time):

    curl -X POST -H "x-admin-token: $DIRECTUS_STATIC_TOKEN" \
      "https://easyrecharge.ch/api/admin/dispatch/<submissionId>"

- Resolves as `live` regardless of the global `DISPATCH_MODE`, writes the
  `partner_dispatches` ledger, and fires the Make webhook (customer email +
  partner notification). The webhook payload carries `submission.trigger =
  "manual_dispatch"` so Make can skip the customer confirmation if desired.
- Test-pattern emails still resolve to `skipped_test` (no partner email, no
  billing) — the webhook fires with empty `targets`.
- Refuses with `409` if the submission already has a `dispatched` row. Add
  `?force=1` to dispatch anyway (can double-bill / double-email).
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations/partner-dispatch.md
git commit -m "docs(dispatch): document manual dispatch endpoint"
```

---

## Self-Review

**Spec coverage:**
- Endpoint contract (auth, force, responses) → Task 3. ✓
- Flow steps 1-7 (auth, load, guard, reconstruct, dispatch, always-fire webhook, respond) → Task 3. ✓
- `modeOverride` = live → Task 1 + used in Task 3. ✓
- `trigger` marker on both routes → Task 2 (quote) + Task 3 (admin). ✓
- Shared `webhook.ts` (getQuoteWebhookUrl, buildQuoteWebhookPayload, fireQuoteWebhook) → Task 2. ✓
- Respect test-email suppression → inherited from `runDispatch` (no override of `isTest`); verified Case B. ✓
- Thinner reconstructed payload (empty attribution, session-only ph/UA) → Task 3 payload build. ✓
- Testing (three curl cases) → Task 3 Step 4. ✓
- Operations docs → Task 4. ✓

**Placeholder scan:** No TBD/TODO. `<staging-host>` / `<...-submission-id>` are runtime values the operator supplies, not code placeholders.

**Type consistency:** `parsePhone`, `getQuoteWebhookUrl`, `buildQuoteWebhookPayload`, `fireQuoteWebhook`, `QuoteWebhookParts`, `WebhookTrigger` are defined in Task 2 and consumed with identical names/signatures in Tasks 2 and 3. `modeOverride?: DispatchMode` defined in Task 1, used in Task 3. Task 3 Step 2 explicitly reconciles storage field names before typecheck to catch `FormUser`/`FormSession` property drift.
