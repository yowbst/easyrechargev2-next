# Partner Invoicing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the invoice layer above the `partner_dispatches` ledger — a persistent invoice that freezes a period's billable dispatches, carries a number and a lifecycle to payment, and generates an editable Google Doc from the existing template.

**Architecture:** Three Directus collections (`partner_invoices`, `partner_invoice_lines`, plus an `invoice` link on `partner_dispatches`) hold the frozen state. A new `src/lib/billing/` library owns all logic as pure-as-possible functions over `directusFetch`. Token-gated admin routes expose it, MCP tools wrap those routes' lib functions directly. Google Doc generation sits behind an interface so tests never touch the network. A partner-facing invoices view fills the sidebar slot that already exists, disabled, in `PartnerSidebar.tsx`.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Vitest, Directus REST, `googleapis` (new dependency, Drive + Docs scopes only).

**Spec:** `docs/superpowers/specs/2026-09-05-partner-invoicing-design.md`

## Global Constraints

- **Currency is CHF**, amounts are `Decimal(10,2)`; never use floats for money comparisons in tests — compare fixed 2-decimal strings or integer centimes.
- **VAT stays at zero.** `vat_rate` and `vat_chf` exist but are never computed. Do not add VAT logic.
- **Invoice number format:** `<PARTNER_INVOICE_CODE>-<YYYYMM>`, e.g. `EME-202607`. First issuance carries no suffix; re-issuance after cancellation is `-R2`, `-R3`.
- **Template placeholders are English only** (`{{invoice_number}}`, never `{{numero_facture}}`), even though the rendered document is French.
- **Acceptance window is read from config**, never hardcoded: `site_settings.global_config.dispatch.billing.acceptance_window_days`.
- **No PDF, no QR-bill, no Sheets.** Generation stops at a Google Doc.
- **`environment` field** on every new row, from `getEnvironment()` in `@/lib/directus-storage` — same convention as `partner_dispatches`.
- **Directus null-vs-false trap:** never filter `_eq: false` on a boolean that can be null. Use `_neq: true`. This is the bug this plan fixes; do not reintroduce it.
- Run `npm run lint` before every commit. Tests are `npm test` (`vitest run`).

---

## File Structure

**Phase 1 — prerequisites (shippable alone, fixes a live production bug)**
- Modify: `src/lib/dispatch/admin.ts` — the two broken filters
- Create: `scripts/backfill-dispatch-booleans.ts` — one-shot data fix
- Create: `vercel.json` (or extend) — daily reconcile cron
- Create: `src/app/api/cron/reconcile-billing/route.ts` — cron entry point
- Modify: `docs/operations/partner-dispatch.md` — stale per-stage window docs

**Phase 2 — billing library**
- Create: `src/lib/billing/types.ts` — shared types, no logic
- Create: `src/lib/billing/period.ts` + `period.test.ts`
- Create: `src/lib/billing/numbering.ts` + `numbering.test.ts`
- Create: `src/lib/billing/scope.ts` + `scope.test.ts`
- Create: `src/lib/billing/invoice.ts` + `invoice.test.ts`
- Create: `src/lib/billing/google-docs.ts` + `google-docs.test.ts`

**Phase 3 — surfaces**
- Create: `src/app/api/admin/invoices/route.ts`, `preview/route.ts`, `[id]/document/route.ts`, `[id]/status/route.ts`, `[id]/note/route.ts`
- Create: `src/lib/mcp/tools/invoicing.ts`
- Modify: `src/app/api/[transport]/route.ts` — register the new tool group

**Phase 4 — partner view**
- Create: `src/app/partners/[uuid]/invoices/page.tsx`
- Create: `src/components/partners/InvoiceList.tsx`, `InvoiceDetail.tsx`
- Modify: `src/components/partners/PartnerSidebar.tsx` — enable the Billing item
- Modify: `src/lib/partner-i18n.ts` — add the `pages.partner-invoices.` prefix

---

## Schema addition found while planning

The spec says the number is `EME-202607` but never says where `EME` comes from. Deriving it from the slug (`eme-energies` → `EME`) is fragile — it breaks on any partner whose slug's first segment is not a good code.

**Add `invoice_code` (String, max 8, uppercase) to `partners`.** `buildInvoiceNumber` requires it and throws if missing, rather than guessing. Set `invoice_code = "EME"` on both E-ME rows (production and staging). This is covered by Task 6 and has been noted in the spec's Open items.

---

# Phase 1 — Prerequisites

Ship and verify this phase before starting Phase 2. Until `billable=true` actually appears on rows, every invoice the later phases produce would be empty.

### Task 1: Fix the null-vs-false billing filters

**Files:**
- Modify: `src/lib/dispatch/admin.ts:31-33` (`getMonthlyBilling`), `src/lib/dispatch/admin.ts:85-87` (`reconcileBilling`)
- Test: `src/lib/dispatch/admin.test.ts`, `src/lib/dispatch/reconcile-null-disqualified.test.ts` (new)

**Interfaces:**
- Consumes: nothing
- Produces: no signature change. `getMonthlyBilling(month)` and `reconcileBilling({dryRun, now})` keep their exports and return shapes.

- [ ] **Step 1: Write the failing test**

Create `src/lib/dispatch/reconcile-null-disqualified.test.ts`. The row below mirrors production: `disqualified` and `gift` are `null`, not `false`.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; method: string }[] = [];

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ path, method });

    if (path.startsWith("/items/site_settings")) {
      return {
        data: {
          global_config: {
            dispatch: {
              billing: { currency: "CHF", acceptance_window_days: 15, dedup_window_days: 30 },
            },
          },
        },
      };
    }
    if (path.startsWith("/items/partner_dispatches") && method === "GET") {
      return {
        data: [
          {
            id: "dispatch-null",
            dispatched_at: "2020-01-01T00:00:00.000Z",
            disqualified: null,
            gift: null,
            billable: false,
            partner: null,
          },
        ],
      };
    }
    if (method === "PATCH") return { data: {} };
    return { data: [] };
  }),
}));

describe("reconcileBilling with null booleans (production shape)", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.resetModules();
  });

  it("queries with _neq:true so null rows are not excluded", async () => {
    const { reconcileBilling } = await import("./admin");
    await reconcileBilling({ dryRun: true });

    const get = calls.find((c) => c.path.startsWith("/items/partner_dispatches") && c.method === "GET");
    expect(get).toBeDefined();
    const query = decodeURIComponent(get!.path);
    expect(query).toContain("filter[disqualified][_neq]=true");
    expect(query).toContain("filter[gift][_neq]=true");
    expect(query).not.toContain("[_eq]=false");
  });

  it("locks a null-disqualified row whose window has elapsed", async () => {
    const { reconcileBilling } = await import("./admin");
    const result = await reconcileBilling({ dryRun: true });
    expect(result.ids).toEqual(["dispatch-null"]);
    expect(result.locked).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/dispatch/reconcile-null-disqualified.test.ts`
Expected: FAIL. The first test fails on `filter[disqualified][_neq]=true` not being present; the second returns `ids: []` because the mock row is filtered out in the real code path.

- [ ] **Step 3: Fix both filters**

In `src/lib/dispatch/admin.ts`, `getMonthlyBilling` — replace the two `_eq` boolean filters:

```ts
  params.set("filter[month_bucket][_eq]", month);
  params.set("filter[billable][_eq]", "true");
  params.set("filter[gift][_neq]", "true");
  params.set("filter[disqualified][_neq]", "true");
```

In `reconcileBilling` — same treatment:

```ts
  params.set("filter[status][_eq]", "dispatched");
  params.set("filter[billable][_neq]", "true");
  params.set("filter[disqualified][_neq]", "true");
  params.set("filter[gift][_neq]", "true");
```

Note `billable` also moves to `_neq: true`, for the same reason: a null `billable` is not billed and must remain a reconcile candidate.

- [ ] **Step 4: Run the full dispatch suite**

Run: `npx vitest run src/lib/dispatch/`
Expected: PASS, including the pre-existing `reconcile-dryrun.test.ts` and `admin.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dispatch/admin.ts src/lib/dispatch/reconcile-null-disqualified.test.ts
git commit -m "fix(billing): stop excluding null disqualified/gift rows from billing

Directus excludes nulls from _eq:false, so the reconcile candidate query
returned zero rows and billable was never locked on any dispatch. Switch
the boolean filters to _neq:true."
```

---

### Task 2: Backfill the null booleans and set schema defaults

**Files:**
- Create: `scripts/backfill-dispatch-booleans.ts`
- Manual: Directus admin — field defaults

**Interfaces:**
- Consumes: `directusFetch` from `@/lib/directus`
- Produces: nothing importable. A one-shot script run via `npx tsx --env-file=.env.local`.

- [ ] **Step 1: Write the script**

```ts
/**
 * One-shot: partner_dispatches.disqualified and .gift are null on rows written
 * before the columns had defaults. Null breaks every boolean filter. Set them
 * to false. Idempotent — re-running matches nothing.
 */
import { directusFetch } from "@/lib/directus";

interface Row { id: string; disqualified: boolean | null; gift: boolean | null }

async function main() {
  const dryRun = !process.argv.includes("--apply");

  const params = new URLSearchParams();
  params.set("fields", "id,disqualified,gift");
  params.set("filter[_or][0][disqualified][_null]", "true");
  params.set("filter[_or][1][gift][_null]", "true");
  params.set("limit", "1000");

  const res = await directusFetch<{ data: Row[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );
  const rows = res?.data ?? [];
  console.log(`${rows.length} row(s) with a null boolean`);

  if (dryRun) {
    console.log("dry run — pass --apply to write");
    return;
  }

  for (const r of rows) {
    const patch: Record<string, boolean> = {};
    if (r.disqualified === null) patch.disqualified = false;
    if (r.gift === null) patch.gift = false;
    await directusFetch(`/items/partner_dispatches/${r.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      next: { revalidate: 0 },
    });
    console.log(`patched ${r.id}`, patch);
  }
  console.log(`done — ${rows.length} row(s) updated`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry run against production**

Run: `npx tsx --env-file=.env.local scripts/backfill-dispatch-booleans.ts`
Expected: `37 row(s) with a null boolean` (35 dispatched + 2 skipped, as counted on 2026-09-05). If the number differs materially, stop and investigate before applying.

- [ ] **Step 3: Apply**

Run: `npx tsx --env-file=.env.local scripts/backfill-dispatch-booleans.ts --apply`
Expected: one `patched <uuid>` line per row, then `done`.

- [ ] **Step 4: Set the field defaults in Directus (manual)**

In Directus admin → Settings → Data Model → `partner_dispatches`:
- field `disqualified`: default value `false`, **uncheck** "Allow NULL"
- field `gift`: default value `false`, **uncheck** "Allow NULL"

- [ ] **Step 5: Verify no nulls remain**

Run:
```bash
set -a; . ./.env.local; set +a
curl -s -G -H "Authorization: Bearer $DIRECTUS_STATIC_TOKEN" \
  "$DIRECTUS_URL/items/partner_dispatches" \
  --data-urlencode "aggregate[count]=id" \
  --data-urlencode "filter[_or][0][disqualified][_null]=true" \
  --data-urlencode "filter[_or][1][gift][_null]=true"
```
Expected: `{"data":[{"count":{"id":"0"}}]}`

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-dispatch-booleans.ts
git commit -m "chore(billing): one-shot backfill for null disqualified/gift"
```

---

### Task 3: Shorten the acceptance window and add the invoicing config

**Files:**
- Manual: Directus `site_settings.global_config`
- Modify: `src/lib/dispatch/queries.ts:183-187` — the `billingDefaults` fallback
- Test: `src/lib/dispatch/queries.test.ts` (new)

**Interfaces:**
- Consumes: nothing
- Produces: `BillingConfig` unchanged in shape; only the default value moves.

> **Gate:** this changes E-ME's contractual window from 30 to 15 days. Do not apply until Yoan confirms E-ME has agreed.

- [ ] **Step 1: Write the failing test**

Create `src/lib/dispatch/queries.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async () => { throw new Error("directus down"); }),
}));

describe("fetchDispatchConfig fallback", () => {
  it("falls back to a 15-day acceptance window", async () => {
    const { fetchDispatchConfig } = await import("./queries");
    const cfg = await fetchDispatchConfig();
    expect(cfg.billing.acceptance_window_days).toBe(15);
    expect(cfg.billing.currency).toBe("CHF");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/dispatch/queries.test.ts`
Expected: FAIL — `expected 30 to be 15`.

- [ ] **Step 3: Change the fallback default**

In `src/lib/dispatch/queries.ts`:

```ts
  const billingDefaults: BillingConfig = {
    currency: "CHF",
    acceptance_window_days: 15,
    dedup_window_days: 30,
  };
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/dispatch/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `site_settings.global_config` in Directus (manual)**

Set `dispatch.billing.acceptance_window_days` to `15`, and add the two new blocks:

```jsonc
"invoicing": { "payment_terms_days": 21 },
"company": {
  "name": "easyRecharge",
  "contact_name": "Yoan Basset",
  "street": "Ch. de Sorécot 33",
  "postal_code": "1033",
  "locality": "Cheseaux/Lausanne",
  "country": "CH",
  "email": "yoan@easyrecharge.ch",
  "iban": "<Yoan to fill>",
  "vat_number": null
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/dispatch/queries.ts src/lib/dispatch/queries.test.ts
git commit -m "feat(billing): acceptance window default 30 -> 15 days"
```

---

### Task 4: Run reconciliation on a daily cron

**Files:**
- Create: `src/app/api/cron/reconcile-billing/route.ts`
- Create or modify: `vercel.json`

**Interfaces:**
- Consumes: `reconcileBilling` from `@/lib/dispatch/admin`
- Produces: `GET /api/cron/reconcile-billing`, authenticated by Vercel's `CRON_SECRET`.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { reconcileBilling } from "@/lib/dispatch/admin";

/**
 * Daily backstop that locks billing on dispatches whose acceptance window has
 * elapsed. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 *
 * Without this the lock only ever fires when a partner moves a stage — which,
 * as of 2026-09, had never happened for 14 of 15 July leads.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await reconcileBilling({ dryRun: false });
  console.log("[cron] reconcile-billing", { locked: result.locked });
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Register the cron**

In `vercel.json` (create it if absent):

```json
{
  "crons": [
    { "path": "/api/cron/reconcile-billing", "schedule": "0 3 * * *" }
  ]
}
```

- [ ] **Step 3: Add `CRON_SECRET`**

Generate with `openssl rand -base64 32` and add it to Vercel project env vars (Production + Preview) and to local `.env.local`. Add the variable to the CLAUDE.md env list.

- [ ] **Step 4: Verify locally**

```bash
npm run dev
# in another shell:
curl -s -H "Authorization: Bearer $(grep ^CRON_SECRET .env.local | cut -d= -f2-)" \
  http://localhost:3000/api/cron/reconcile-billing
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/cron/reconcile-billing
```
Expected: a JSON `{locked, ids, dryRun:false}` for the first, `401` for the second.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/reconcile-billing/route.ts vercel.json CLAUDE.md
git commit -m "feat(billing): daily reconcile-billing cron"
```

---

### Task 5: Correct the stale dispatch documentation

**Files:**
- Modify: `docs/operations/partner-dispatch.md` — the "Billing window" section

- [ ] **Step 1: Replace the section**

The doc describes per-stage windows that do not exist. Replace the "Billing window" body with:

```markdown
### Billing window

A dispatch becomes `billable=true` when its stage reaches `quote_sent` (or beyond),
**or** when the acceptance window elapses from `dispatched_at` without a
disqualification. The window is a single global value read from
`site_settings.global_config.dispatch.billing.acceptance_window_days` (15 days),
with a per-partner override under `partners.disqualification_overrides.acceptance`.
Gifts (`gift=true`) and disqualified rows are never billable.

There are no per-stage windows. The May 2026 plan proposed them; the implementation
in `src/lib/dispatch/billing.ts` uses the single acceptance window above, and
`stage_windows_days` does not exist in `site_settings`.

Reconciliation runs daily via `/api/cron/reconcile-billing`. The manual endpoint
`POST /api/admin/reconcile-billing` remains for ad-hoc runs before invoicing.
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations/partner-dispatch.md
git commit -m "docs: correct the billing window description"
```

---

### Task 6: Create the invoicing schema in Directus

**Files:**
- Manual: Directus Data Model
- Create: `scripts/verify-invoicing-schema.ts`

**Interfaces:**
- Produces: collections `partner_invoices` and `partner_invoice_lines`, plus `partner_dispatches.invoice` and `partners.invoice_code`, as specified in the spec's Data model section.

- [ ] **Step 1: Create the collections (manual)**

Follow the spec's Data model tables exactly. In Directus → Settings → Data Model:

1. Collection `partner_invoices`, primary key UUID with default *Generate UUID*, and every field from the spec's first table. `status` is a dropdown with exactly `issued`, `sent`, `disputed`, `paid`, `cancelled`, default `issued`. Set `number` to unique.
2. Collection `partner_invoice_lines` with the fields from the spec's second table. `kind` is a dropdown `lead` / `adjustment`, default `lead`.
3. On `partner_invoices`, add the O2M alias `lines` → `partner_invoice_lines.invoice`.
4. On `partner_dispatches`, add `invoice` — M2O → `partner_invoices`, nullable.
5. On `partners`, add `invoice_code` — String, max 8. Set it to `EME` on both E-ME rows.
6. Grant the static token's role full read + write on both new collections.

- [ ] **Step 2: Write the verification script**

```ts
/** Asserts the invoicing schema matches what src/lib/billing expects. */
import { directusFetch } from "@/lib/directus";

const REQUIRED: Record<string, string[]> = {
  partner_invoices: [
    "id", "number", "version", "status", "partner", "period_month",
    "period_start", "period_end", "issued_at", "due_at", "sent_at", "paid_at",
    "payment_terms_days", "currency", "subtotal_chf", "adjustment_chf",
    "total_chf", "vat_rate", "vat_chf", "issuer_snapshot", "debtor_snapshot",
    "doc_url", "doc_file_id", "doc_versions", "events", "notes", "environment",
  ],
  partner_invoice_lines: [
    "id", "invoice", "dispatch", "kind", "label", "description", "quantity",
    "unit_price_chf", "amount_chf", "sort", "dispatched_at", "canton",
    "postal_code", "locality", "last_name", "lead_category", "product",
  ],
};

async function fields(collection: string): Promise<string[]> {
  const res = await directusFetch<{ data: { field: string }[] }>(
    `/fields/${collection}`, { next: { revalidate: 0 } },
  );
  return (res?.data ?? []).map((f) => f.field);
}

async function main() {
  let failed = false;
  for (const [collection, required] of Object.entries(REQUIRED)) {
    const present = await fields(collection);
    const missing = required.filter((f) => !present.includes(f));
    console.log(`${collection}: ${missing.length === 0 ? "OK" : `MISSING ${missing.join(", ")}`}`);
    if (missing.length) failed = true;
  }
  for (const [collection, field] of [["partner_dispatches", "invoice"], ["partners", "invoice_code"]]) {
    const present = await fields(collection);
    const ok = present.includes(field);
    console.log(`${collection}.${field}: ${ok ? "OK" : "MISSING"}`);
    if (!ok) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it**

Run: `npx tsx --env-file=.env.local scripts/verify-invoicing-schema.ts`
Expected: every line `OK`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-invoicing-schema.ts
git commit -m "chore(billing): invoicing schema verification script"
```

---

# Phase 2 — Billing library

### Task 7: Shared types

**Files:**
- Create: `src/lib/billing/types.ts`

**Interfaces:**
- Produces: every type below. Later tasks import from `@/lib/billing/types`.

- [ ] **Step 1: Write the file**

```ts
export const INVOICE_STATUSES = ["issued", "sent", "disputed", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_EVENT_TYPES = [
  "issued", "sent", "comment", "revision_requested", "revised", "paid", "cancelled",
] as const;
export type InvoiceEventType = (typeof INVOICE_EVENT_TYPES)[number];

export type InvoiceEventActor = "yoan" | "partner" | "system";

export interface InvoiceEvent {
  at: string;
  actor: InvoiceEventActor;
  type: InvoiceEventType;
  note?: string;
}

export interface InvoiceDocVersion {
  version: number;
  doc_url: string;
  doc_file_id: string;
  generated_at: string;
}

export interface PartySnapshot {
  name: string;
  contact_name?: string | null;
  street: string;
  postal_code: string;
  locality: string;
  country: string;
  email?: string | null;
  uid?: string | null;
}

export interface InvoicePeriod {
  month: string;        // "2026-07"
  start: string;        // "2026-07-01"
  end: string;          // "2026-07-31"
  issuableFrom: string; // "2026-08-16"
}

export interface ScopeLine {
  dispatchId: string | null;
  label: string;
  dispatchedAt: string;
  canton: string | null;
  postalCode: string | null;
  locality: string | null;
  lastName: string | null;
  leadCategory: string | null;
  product: string | null;
  unitPriceChf: number;
}

export interface ScopeResult {
  lines: ScopeLine[];
  subtotalChf: number;
  /** Dispatches in the month that are not yet settled — blocks issuance. */
  unsettled: string[];
  excluded: { id: string; reason: string }[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/billing/types.ts
git commit -m "feat(billing): shared invoicing types"
```

---

### Task 8: Period computation

**Files:**
- Create: `src/lib/billing/period.ts`
- Test: `src/lib/billing/period.test.ts`

**Interfaces:**
- Consumes: `InvoicePeriod` from `@/lib/billing/types`
- Produces: `computePeriod(month: string, acceptanceWindowDays: number): InvoicePeriod`, `isPeriodIssuable(period: InvoicePeriod, now?: Date): boolean`. Both are pure. `computePeriod` throws `Error("invalid_month")`, matching `getMonthlyBilling`'s convention.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { computePeriod, isPeriodIssuable } from "./period";

describe("computePeriod", () => {
  it("rejects malformed months", () => {
    for (const bad of ["2026", "26-07", "2026-7", "2026-13", "2026-00", ""]) {
      expect(() => computePeriod(bad, 15)).toThrow("invalid_month");
    }
  });

  it("computes bounds for a 31-day month", () => {
    expect(computePeriod("2026-07", 15)).toEqual({
      month: "2026-07",
      start: "2026-07-01",
      end: "2026-07-31",
      issuableFrom: "2026-08-16",
    });
  });

  it("handles February and leap years", () => {
    expect(computePeriod("2026-02", 15).end).toBe("2026-02-28");
    expect(computePeriod("2028-02", 15).end).toBe("2028-02-29");
  });

  it("rolls the issuable date across a year boundary", () => {
    expect(computePeriod("2026-12", 15).issuableFrom).toBe("2027-01-16");
  });

  it("makes a zero window issuable the day after period end", () => {
    expect(computePeriod("2026-07", 0).issuableFrom).toBe("2026-08-01");
  });
});

describe("isPeriodIssuable", () => {
  const period = computePeriod("2026-07", 15);

  it("is false before the issuable date", () => {
    expect(isPeriodIssuable(period, new Date("2026-08-15T23:59:59Z"))).toBe(false);
  });

  it("is true from the issuable date onward", () => {
    expect(isPeriodIssuable(period, new Date("2026-08-16T00:00:00Z"))).toBe(true);
    expect(isPeriodIssuable(period, new Date("2026-09-05T00:00:00Z"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/billing/period.test.ts`
Expected: FAIL — `Cannot find module './period'`.

- [ ] **Step 3: Implement**

```ts
import type { InvoicePeriod } from "./types";

const MONTH_RE = /^(\d{4})-(\d{2})$/;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Period bounds for an invoice month, plus the earliest date it may be issued.
 *
 * `issuableFrom` is period end + the acceptance window: the last dispatch of the
 * month only settles that many days after it was dispatched, so issuing earlier
 * would freeze a scope that can still change.
 */
export function computePeriod(month: string, acceptanceWindowDays: number): InvoicePeriod {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error("invalid_month");
  const year = Number(m[1]);
  const monthNo = Number(m[2]);
  if (monthNo < 1 || monthNo > 12) throw new Error("invalid_month");

  // Day 0 of the next month is the last day of this one — handles leap years.
  const end = new Date(Date.UTC(year, monthNo, 0));
  const start = new Date(Date.UTC(year, monthNo - 1, 1));
  const issuable = new Date(end.getTime());
  issuable.setUTCDate(issuable.getUTCDate() + Math.max(0, acceptanceWindowDays) + 1);

  return { month, start: iso(start), end: iso(end), issuableFrom: iso(issuable) };
}

export function isPeriodIssuable(period: InvoicePeriod, now: Date = new Date()): boolean {
  return iso(now) >= period.issuableFrom;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/billing/period.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/period.ts src/lib/billing/period.test.ts
git commit -m "feat(billing): invoice period computation"
```

---

### Task 9: Invoice numbering

**Files:**
- Create: `src/lib/billing/numbering.ts`
- Test: `src/lib/billing/numbering.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `buildInvoiceNumber(invoiceCode: string, month: string, issuanceRank?: number): string`. Throws `Error("missing_invoice_code")` when the code is empty and `Error("invalid_month")` on a bad month.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildInvoiceNumber } from "./numbering";

describe("buildInvoiceNumber", () => {
  it("builds CODE-YYYYMM for the first issuance", () => {
    expect(buildInvoiceNumber("EME", "2026-07")).toBe("EME-202607");
    expect(buildInvoiceNumber("EME", "2026-07", 1)).toBe("EME-202607");
  });

  it("suffixes re-issuances with their rank", () => {
    expect(buildInvoiceNumber("EME", "2026-07", 2)).toBe("EME-202607-R2");
    expect(buildInvoiceNumber("EME", "2026-07", 3)).toBe("EME-202607-R3");
  });

  it("uppercases and trims the code", () => {
    expect(buildInvoiceNumber("  eme ", "2026-07")).toBe("EME-202607");
  });

  it("refuses a missing code rather than guessing one", () => {
    expect(() => buildInvoiceNumber("", "2026-07")).toThrow("missing_invoice_code");
    expect(() => buildInvoiceNumber("   ", "2026-07")).toThrow("missing_invoice_code");
  });

  it("rejects a malformed month", () => {
    expect(() => buildInvoiceNumber("EME", "2026-7")).toThrow("invalid_month");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/billing/numbering.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
const MONTH_RE = /^(\d{4})-(\d{2})$/;

/**
 * `EME-202607`. Partner code + period, per the 2026-09-05 design decision.
 *
 * Not a continuous sequence — accepted trade-off, documented in the spec. A
 * cancelled invoice keeps its number, so a re-issue for the same period is
 * suffixed with its issuance rank (the first carries no suffix).
 */
export function buildInvoiceNumber(
  invoiceCode: string,
  month: string,
  issuanceRank = 1,
): string {
  const code = (invoiceCode ?? "").trim().toUpperCase();
  if (!code) throw new Error("missing_invoice_code");
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error("invalid_month");

  const base = `${code}-${m[1]}${m[2]}`;
  return issuanceRank > 1 ? `${base}-R${issuanceRank}` : base;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/billing/numbering.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/numbering.ts src/lib/billing/numbering.test.ts
git commit -m "feat(billing): invoice numbering"
```

---

### Task 10: Scope collection

**Files:**
- Create: `src/lib/billing/scope.ts`
- Test: `src/lib/billing/scope.test.ts`

**Interfaces:**
- Consumes: `ScopeLine`, `ScopeResult` from `@/lib/billing/types`; `directusFetch` from `@/lib/directus`
- Produces: `buildLeadLabel(lastName, postalCode, locality, dispatchedAt): string` (pure) and `collectBillableDispatches(partnerId: string, month: string): Promise<ScopeResult>`.

`partner_dispatches.submission` is a real M2O, so `submission.user.last_name` and `submission.data` resolve in one query — verified 2026-09-05.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string) => {
    if (!path.startsWith("/items/partner_dispatches")) return { data: [] };
    return {
      data: [
        {
          id: "d1", billable: true, gift: false, disqualified: false, invoice: null,
          dispatched_at: "2026-07-04T09:00:00.000Z", canton: "VD",
          price_chf: "40.00000", lead_category: "owner_solar", product: "ecp",
          submission: {
            user: { last_name: "Papeil" },
            data: { postalCode: "1052", locality: "Le Mont-sur-Lausanne" },
          },
        },
        {
          id: "d2", billable: false, gift: false, disqualified: false, invoice: null,
          dispatched_at: "2026-07-30T09:00:00.000Z", canton: "GE",
          price_chf: "40.00000", lead_category: "tenant_no_solar", product: "ecp",
          submission: { user: { last_name: "Matias" }, data: { postalCode: "1228", locality: "Plan-les-Ouates" } },
        },
        {
          id: "d3", billable: true, gift: false, disqualified: false, invoice: "inv-old",
          dispatched_at: "2026-07-10T09:00:00.000Z", canton: "VD",
          price_chf: "40.00000", lead_category: "owner_solar", product: "ecp",
          submission: { user: { last_name: "Deja" }, data: { postalCode: "1000", locality: "Lausanne" } },
        },
      ],
    };
  }),
}));

describe("buildLeadLabel", () => {
  it("matches the June annex convention", async () => {
    const { buildLeadLabel } = await import("./scope");
    expect(buildLeadLabel("Papeil", "1052", "Le Mont-sur-Lausanne", "2026-07-04T09:00:00.000Z"))
      .toBe("P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04");
  });

  it("degrades gracefully on missing pieces", async () => {
    const { buildLeadLabel } = await import("./scope");
    expect(buildLeadLabel(null, null, null, "2026-07-04T09:00:00.000Z"))
      .toBe("P / — / — / 2026-07-04");
  });
});

describe("collectBillableDispatches", () => {
  it("keeps billable rows, flags unsettled ones, excludes already-invoiced", async () => {
    const { collectBillableDispatches } = await import("./scope");
    const r = await collectBillableDispatches("partner-1", "2026-07");

    expect(r.lines.map((l) => l.dispatchId)).toEqual(["d1"]);
    expect(r.unsettled).toEqual(["d2"]);
    expect(r.excluded).toEqual([{ id: "d3", reason: "already_invoiced" }]);
    expect(r.subtotalChf).toBe(40);
    expect(r.lines[0].label).toBe("P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/billing/scope.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { directusFetch } from "@/lib/directus";
import type { ScopeLine, ScopeResult } from "./types";

const FIELDS = [
  "id", "dispatched_at", "canton", "price_chf", "lead_category", "product",
  "billable", "gift", "disqualified", "invoice",
  "submission.user.last_name", "submission.data",
].join(",");

interface Row {
  id: string;
  dispatched_at: string;
  canton: string | null;
  price_chf: string | number | null;
  lead_category: string | null;
  product: string | null;
  billable: boolean | null;
  gift: boolean | null;
  disqualified: boolean | null;
  invoice: string | null;
  submission: {
    user?: { last_name?: string | null } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
  } | null;
}

/** `P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04` — the June annex format. */
export function buildLeadLabel(
  lastName: string | null | undefined,
  postalCode: string | null | undefined,
  locality: string | null | undefined,
  dispatchedAt: string,
): string {
  const name = (lastName ?? "").trim().toUpperCase() || "—";
  const place = [postalCode, locality].filter(Boolean).join(" ").trim() || "—";
  return `P / ${name} / ${place} / ${dispatchedAt.slice(0, 10)}`;
}

function toNumber(v: string | number | null): number {
  if (v === null) return 0;
  return typeof v === "string" ? Number.parseFloat(v) : v;
}

/**
 * The billable set for a partner+month, plus everything that kept a row out.
 *
 * `unsettled` is what blocks issuance: a dispatched, non-gift, non-disqualified
 * row that is not yet billable is still inside its acceptance window, so the
 * scope is not final.
 */
export async function collectBillableDispatches(
  partnerId: string,
  month: string,
): Promise<ScopeResult> {
  const params = new URLSearchParams();
  params.set("fields", FIELDS);
  params.set("filter[partner][_eq]", partnerId);
  params.set("filter[month_bucket][_eq]", month);
  params.set("filter[status][_eq]", "dispatched");
  params.set("sort", "dispatched_at");
  params.set("limit", "500");

  const res = await directusFetch<{ data: Row[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );

  const lines: ScopeLine[] = [];
  const unsettled: string[] = [];
  const excluded: { id: string; reason: string }[] = [];

  for (const r of res?.data ?? []) {
    if (r.invoice) { excluded.push({ id: r.id, reason: "already_invoiced" }); continue; }
    if (r.gift === true) { excluded.push({ id: r.id, reason: "gift" }); continue; }
    if (r.disqualified === true) { excluded.push({ id: r.id, reason: "disqualified" }); continue; }
    if (r.billable !== true) { unsettled.push(r.id); continue; }

    const data = r.submission?.data ?? {};
    lines.push({
      dispatchId: r.id,
      label: buildLeadLabel(
        r.submission?.user?.last_name, data.postalCode, data.locality, r.dispatched_at,
      ),
      dispatchedAt: r.dispatched_at,
      canton: r.canton,
      postalCode: data.postalCode ?? null,
      locality: data.locality ?? null,
      lastName: r.submission?.user?.last_name ?? null,
      leadCategory: r.lead_category,
      product: r.product,
      unitPriceChf: toNumber(r.price_chf),
    });
  }

  const subtotalChf = Number(
    lines.reduce((s, l) => s + l.unitPriceChf, 0).toFixed(2),
  );

  return { lines, subtotalChf, unsettled, excluded };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/billing/scope.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/scope.ts src/lib/billing/scope.test.ts
git commit -m "feat(billing): billable scope collection"
```

---

### Task 11: Invoice preview and issuance

**Files:**
- Create: `src/lib/billing/invoice.ts`
- Test: `src/lib/billing/invoice.test.ts`

**Interfaces:**
- Consumes: `computePeriod`/`isPeriodIssuable` (Task 8), `buildInvoiceNumber` (Task 9), `collectBillableDispatches` (Task 10), types (Task 7), `fetchDispatchConfig` from `@/lib/dispatch/queries`, `getEnvironment` from `@/lib/directus-storage`
- Produces:
  - `previewInvoice(partnerSlug: string, month: string, now?: Date): Promise<InvoicePreview>`
  - `issueInvoice(partnerSlug: string, month: string, opts?: { now?: Date }): Promise<{ id: string; number: string; total_chf: number }>`
  - `InvoicePreview = { period: InvoicePeriod; issuable: boolean; number: string; scope: ScopeResult; subtotalChf: number; totalChf: number }`

Errors thrown: `period_not_issuable`, `unsettled_dispatches`, `empty_scope`, `partner_not_found`, `duplicate_number`.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { unsettled: [] as string[], existing: [] as unknown[], patched: [] as string[] };

vi.mock("@/lib/dispatch/queries", () => ({
  fetchDispatchConfig: vi.fn(async () => ({
    billing: { currency: "CHF", acceptance_window_days: 15, dedup_window_days: 30 },
  })),
}));
vi.mock("@/lib/directus-storage", () => ({ getEnvironment: () => "production" }));
vi.mock("./scope", () => ({
  collectBillableDispatches: vi.fn(async () => ({
    lines: [{
      dispatchId: "d1", label: "P / PAPEIL / 1052 Le Mont / 2026-07-04",
      dispatchedAt: "2026-07-04T09:00:00.000Z", canton: "VD", postalCode: "1052",
      locality: "Le Mont", lastName: "Papeil", leadCategory: "owner_solar",
      product: "ecp", unitPriceChf: 40,
    }],
    subtotalChf: 40, unsettled: state.unsettled, excluded: [],
  })),
}));
vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (path.startsWith("/items/partners")) {
      return { data: [{ id: "p1", slug: "eme-energies", invoice_code: "EME", name: "E-ME Énergies",
        business_name: "E-ME Énergies Sàrl", uid: "CHE-109.517.385", street_name: "Chemin de la Crétaux",
        street_number: "4", postal_code: "1196", locality: "Gland", notification_email: "jendoubi@emeenergies.ch" }] };
    }
    if (path.startsWith("/items/site_settings")) {
      return { data: { global_config: {
        invoicing: { payment_terms_days: 21 },
        company: { name: "easyRecharge", contact_name: "Yoan Basset", street: "Ch. de Sorécot 33",
          postal_code: "1033", locality: "Cheseaux/Lausanne", country: "CH", email: "yoan@easyrecharge.ch" },
      } } };
    }
    if (path.startsWith("/items/partner_invoices") && method === "GET") return { data: state.existing };
    if (path.startsWith("/items/partner_invoices") && method === "POST") return { data: { id: "inv-1" } };
    if (path.startsWith("/items/partner_invoice_lines")) return { data: {} };
    if (path.startsWith("/items/partner_dispatches/") && method === "PATCH") {
      state.patched.push(path.split("/").pop()!.split("?")[0]);
      return { data: {} };
    }
    return { data: [] };
  }),
}));

describe("previewInvoice", () => {
  beforeEach(() => { state.unsettled = []; state.existing = []; state.patched = []; vi.resetModules(); });

  it("reports the number, period and totals without writing", async () => {
    const { previewInvoice } = await import("./invoice");
    const p = await previewInvoice("eme-energies", "2026-07", new Date("2026-09-05T00:00:00Z"));
    expect(p.number).toBe("EME-202607");
    expect(p.period.issuableFrom).toBe("2026-08-16");
    expect(p.issuable).toBe(true);
    expect(p.totalChf).toBe(40);
  });

  it("reports not-issuable before the window closes", async () => {
    const { previewInvoice } = await import("./invoice");
    const p = await previewInvoice("eme-energies", "2026-07", new Date("2026-08-01T00:00:00Z"));
    expect(p.issuable).toBe(false);
  });
});

describe("issueInvoice", () => {
  beforeEach(() => { state.unsettled = []; state.existing = []; state.patched = []; vi.resetModules(); });

  it("refuses before the period is issuable", async () => {
    const { issueInvoice } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: new Date("2026-08-01T00:00:00Z") }))
      .rejects.toThrow("period_not_issuable");
  });

  it("refuses while dispatches are unsettled", async () => {
    state.unsettled = ["d9"];
    const { issueInvoice } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: new Date("2026-09-05T00:00:00Z") }))
      .rejects.toThrow("unsettled_dispatches");
  });

  it("refuses to issue an existing number twice", async () => {
    state.existing = [{ id: "inv-0", number: "EME-202607" }];
    const { issueInvoice } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: new Date("2026-09-05T00:00:00Z") }))
      .rejects.toThrow("duplicate_number");
  });

  it("creates the invoice and stamps the dispatches", async () => {
    const { issueInvoice } = await import("./invoice");
    const r = await issueInvoice("eme-energies", "2026-07", { now: new Date("2026-09-05T00:00:00Z") });
    expect(r).toEqual({ id: "inv-1", number: "EME-202607", total_chf: 40 });
    expect(state.patched).toEqual(["d1"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/billing/invoice.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import { fetchDispatchConfig } from "@/lib/dispatch/queries";
import { computePeriod, isPeriodIssuable } from "./period";
import { buildInvoiceNumber } from "./numbering";
import { collectBillableDispatches } from "./scope";
import type { InvoicePeriod, PartySnapshot, ScopeResult } from "./types";

export interface InvoicePreview {
  period: InvoicePeriod;
  issuable: boolean;
  number: string;
  scope: ScopeResult;
  subtotalChf: number;
  totalChf: number;
}

interface PartnerRow {
  id: string; slug: string; invoice_code: string | null; name: string;
  business_name: string | null; uid: string | null; street_name: string | null;
  street_number: string | null; postal_code: string | null; locality: string | null;
  notification_email: string | null;
}

async function fetchPartner(slug: string): Promise<PartnerRow> {
  const params = new URLSearchParams();
  params.set("fields", "id,slug,invoice_code,name,business_name,uid,street_name,street_number,postal_code,locality,notification_email");
  params.set("filter[slug][_eq]", slug);
  params.set("filter[environment][_eq]", getEnvironment());
  params.set("limit", "1");
  const res = await directusFetch<{ data: PartnerRow[] }>(
    `/items/partners?${params}`, { next: { revalidate: 0 } },
  );
  const partner = res?.data?.[0];
  if (!partner) throw new Error("partner_not_found");
  return partner;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCompany(): Promise<{ company: any; paymentTermsDays: number }> {
  const res = await directusFetch<{ data: any }>( // eslint-disable-line @typescript-eslint/no-explicit-any
    "/items/site_settings?fields=global_config", { next: { revalidate: 0 } },
  );
  const raw = res?.data;
  const record = Array.isArray(raw) ? raw[0] : raw;
  const global = record?.global_config ?? {};
  return {
    company: global.company ?? {},
    paymentTermsDays: global.invoicing?.payment_terms_days ?? 21,
  };
}

function debtorSnapshot(p: PartnerRow): PartySnapshot {
  return {
    name: p.business_name ?? p.name,
    street: [p.street_name, p.street_number].filter(Boolean).join(" "),
    postal_code: p.postal_code ?? "",
    locality: p.locality ?? "",
    country: "CH",
    email: p.notification_email,
    uid: p.uid,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function issuerSnapshot(company: any): PartySnapshot {
  return {
    name: company.name ?? "easyRecharge",
    contact_name: company.contact_name ?? null,
    street: company.street ?? "",
    postal_code: company.postal_code ?? "",
    locality: company.locality ?? "",
    country: company.country ?? "CH",
    email: company.email ?? null,
    uid: company.vat_number ?? null,
  };
}

async function findByNumber(number: string): Promise<{ id: string }[]> {
  const params = new URLSearchParams();
  params.set("fields", "id,number");
  params.set("filter[number][_eq]", number);
  params.set("limit", "1");
  const res = await directusFetch<{ data: { id: string }[] }>(
    `/items/partner_invoices?${params}`, { next: { revalidate: 0 } },
  );
  return res?.data ?? [];
}

export async function previewInvoice(
  partnerSlug: string, month: string, now: Date = new Date(),
): Promise<InvoicePreview> {
  const [partner, config] = await Promise.all([fetchPartner(partnerSlug), fetchDispatchConfig()]);
  const period = computePeriod(month, config.billing.acceptance_window_days);
  const scope = await collectBillableDispatches(partner.id, month);
  const total = Number((scope.subtotalChf).toFixed(2));

  return {
    period,
    issuable: isPeriodIssuable(period, now),
    number: buildInvoiceNumber(partner.invoice_code ?? "", month),
    scope,
    subtotalChf: scope.subtotalChf,
    totalChf: total,
  };
}

/**
 * Freeze the period: assign the number, snapshot both parties, write the lines,
 * and stamp each dispatch with the invoice id so it can never be billed twice.
 *
 * Refuses rather than guesses — an invoice that silently drops or duplicates a
 * lead is worse than one that fails loudly.
 */
export async function issueInvoice(
  partnerSlug: string, month: string, opts: { now?: Date } = {},
): Promise<{ id: string; number: string; total_chf: number }> {
  const now = opts.now ?? new Date();
  const [partner, config, settings] = await Promise.all([
    fetchPartner(partnerSlug), fetchDispatchConfig(), fetchCompany(),
  ]);

  const period = computePeriod(month, config.billing.acceptance_window_days);
  if (!isPeriodIssuable(period, now)) throw new Error("period_not_issuable");

  const scope = await collectBillableDispatches(partner.id, month);
  if (scope.unsettled.length > 0) throw new Error("unsettled_dispatches");
  if (scope.lines.length === 0) throw new Error("empty_scope");

  const number = buildInvoiceNumber(partner.invoice_code ?? "", month);
  if ((await findByNumber(number)).length > 0) throw new Error("duplicate_number");

  const due = new Date(now.getTime());
  due.setUTCDate(due.getUTCDate() + settings.paymentTermsDays);
  const total = Number(scope.subtotalChf.toFixed(2));

  const created = await directusFetch<{ data: { id: string } }>(
    "/items/partner_invoices",
    {
      method: "POST",
      body: JSON.stringify({
        number, version: 1, status: "issued", partner: partner.id,
        period_month: month, period_start: period.start, period_end: period.end,
        issued_at: now.toISOString(), due_at: due.toISOString(),
        payment_terms_days: settings.paymentTermsDays, currency: "CHF",
        subtotal_chf: total, adjustment_chf: 0, total_chf: total,
        vat_rate: 0, vat_chf: 0,
        issuer_snapshot: issuerSnapshot(settings.company),
        debtor_snapshot: debtorSnapshot(partner),
        doc_versions: [], events: [{ at: now.toISOString(), actor: "system", type: "issued" }],
        environment: getEnvironment(),
      }),
      next: { revalidate: 0 },
    },
  );
  const invoiceId = created?.data?.id;

  for (const [i, line] of scope.lines.entries()) {
    await directusFetch("/items/partner_invoice_lines", {
      method: "POST",
      body: JSON.stringify({
        invoice: invoiceId, dispatch: line.dispatchId, kind: "lead",
        label: line.label, quantity: 1,
        unit_price_chf: line.unitPriceChf, amount_chf: line.unitPriceChf,
        sort: i, dispatched_at: line.dispatchedAt, canton: line.canton,
        postal_code: line.postalCode, locality: line.locality,
        last_name: line.lastName, lead_category: line.leadCategory, product: line.product,
      }),
      next: { revalidate: 0 },
    });
    if (line.dispatchId) {
      await directusFetch(`/items/partner_dispatches/${line.dispatchId}`, {
        method: "PATCH",
        body: JSON.stringify({ invoice: invoiceId }),
        next: { revalidate: 0 },
      });
    }
  }

  return { id: invoiceId, number, total_chf: total };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/billing/invoice.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole suite and lint**

Run: `npm test && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/invoice.ts src/lib/billing/invoice.test.ts
git commit -m "feat(billing): invoice preview and issuance"
```

---

### Task 12: Status transitions, notes and adjustment lines

**Files:**
- Modify: `src/lib/billing/invoice.ts`
- Test: `src/lib/billing/transitions.test.ts` (new)

**Interfaces:**
- Produces, added to `src/lib/billing/invoice.ts`:
  - `canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean` (pure)
  - `setInvoiceStatus(invoiceId: string, to: InvoiceStatus, note?: string, now?: Date): Promise<void>`
  - `addInvoiceNote(invoiceId: string, actor: InvoiceEventActor, note: string, now?: Date): Promise<void>`
  - `addAdjustmentLine(invoiceId: string, description: string, amountChf: number): Promise<void>` — recomputes `adjustment_chf` and `total_chf`

- [ ] **Step 1: Write the failing test for the transition matrix**

```ts
import { describe, expect, it } from "vitest";
import { canTransition } from "./invoice";

describe("canTransition", () => {
  it("allows the happy path", () => {
    expect(canTransition("issued", "sent")).toBe(true);
    expect(canTransition("sent", "paid")).toBe(true);
    expect(canTransition("sent", "disputed")).toBe(true);
    expect(canTransition("disputed", "sent")).toBe(true);
  });

  it("allows cancelling anything not yet paid", () => {
    expect(canTransition("issued", "cancelled")).toBe(true);
    expect(canTransition("sent", "cancelled")).toBe(true);
    expect(canTransition("disputed", "cancelled")).toBe(true);
  });

  it("treats paid and cancelled as terminal", () => {
    expect(canTransition("paid", "sent")).toBe(false);
    expect(canTransition("paid", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "issued")).toBe(false);
  });

  it("refuses skipping straight from issued to paid", () => {
    expect(canTransition("issued", "paid")).toBe(false);
  });

  it("refuses a no-op transition", () => {
    expect(canTransition("sent", "sent")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/billing/transitions.test.ts`
Expected: FAIL — `canTransition` is not exported.

- [ ] **Step 3: Implement the transitions**

Append the code below to `src/lib/billing/invoice.ts`. **Merge the `import type` line into the existing one at the top of the file** — do not add a second import statement mid-file. After merging, the top of `invoice.ts` reads:

```ts
import type {
  InvoiceEvent, InvoiceEventActor, InvoiceStatus,
  InvoicePeriod, PartySnapshot, ScopeResult,
} from "./types";
```

Then append:

```ts
const ALLOWED: Record<InvoiceStatus, InvoiceStatus[]> = {
  issued: ["sent", "cancelled"],
  sent: ["paid", "disputed", "cancelled"],
  disputed: ["sent", "paid", "cancelled"],
  paid: [],
  cancelled: [],
};

/** `paid` and `cancelled` are terminal; `issued -> paid` must pass through `sent`. */
export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return false;
  return (ALLOWED[from] ?? []).includes(to);
}

interface InvoiceStateRow {
  id: string; status: InvoiceStatus; events: InvoiceEvent[] | null;
  subtotal_chf: string | number; adjustment_chf: string | number;
}

async function fetchInvoiceState(invoiceId: string): Promise<InvoiceStateRow> {
  const res = await directusFetch<{ data: InvoiceStateRow | null }>(
    `/items/partner_invoices/${invoiceId}?fields=id,status,events,subtotal_chf,adjustment_chf`,
    { next: { revalidate: 0 } },
  );
  const row = res?.data;
  if (!row) throw new Error("invoice_not_found");
  return row;
}

const STATUS_TIMESTAMP: Partial<Record<InvoiceStatus, string>> = {
  sent: "sent_at", paid: "paid_at",
};

export async function setInvoiceStatus(
  invoiceId: string, to: InvoiceStatus, note?: string, now: Date = new Date(),
): Promise<void> {
  const row = await fetchInvoiceState(invoiceId);
  if (!canTransition(row.status, to)) throw new Error("invalid_transition");

  const events = Array.isArray(row.events) ? row.events : [];
  const event: InvoiceEvent = {
    at: now.toISOString(),
    actor: "yoan",
    type: to === "disputed" ? "revision_requested" : (to as InvoiceEvent["type"]),
    ...(note ? { note } : {}),
  };
  const stamp = STATUS_TIMESTAMP[to];

  await directusFetch(`/items/partner_invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: to,
      events: [...events, event],
      ...(stamp ? { [stamp]: now.toISOString() } : {}),
    }),
    next: { revalidate: 0 },
  });
}

export async function addInvoiceNote(
  invoiceId: string, actor: InvoiceEventActor, note: string, now: Date = new Date(),
): Promise<void> {
  const row = await fetchInvoiceState(invoiceId);
  const events = Array.isArray(row.events) ? row.events : [];
  await directusFetch(`/items/partner_invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      events: [...events, { at: now.toISOString(), actor, type: "comment", note }],
    }),
    next: { revalidate: 0 },
  });
}

/** A discount or correction. Negative amounts are the normal case. */
export async function addAdjustmentLine(
  invoiceId: string, description: string, amountChf: number,
): Promise<void> {
  const row = await fetchInvoiceState(invoiceId);
  if (row.status === "paid" || row.status === "cancelled") throw new Error("invoice_closed");

  await directusFetch("/items/partner_invoice_lines", {
    method: "POST",
    body: JSON.stringify({
      invoice: invoiceId, kind: "adjustment", dispatch: null,
      label: description, description, quantity: 1,
      unit_price_chf: amountChf, amount_chf: amountChf, sort: 9999,
    }),
    next: { revalidate: 0 },
  });

  const subtotal = Number(row.subtotal_chf);
  const adjustment = Number(Number(row.adjustment_chf ?? 0) + amountChf);
  await directusFetch(`/items/partner_invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      adjustment_chf: Number(adjustment.toFixed(2)),
      total_chf: Number((subtotal + adjustment).toFixed(2)),
    }),
    next: { revalidate: 0 },
  });
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/billing/transitions.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/invoice.ts src/lib/billing/transitions.test.ts
git commit -m "feat(billing): status transitions, notes and adjustment lines"
```

---

### Task 13: Google Doc generation

**Files:**
- Create: `src/lib/billing/google-docs.ts`
- Test: `src/lib/billing/google-docs.test.ts`
- Modify: `package.json` — add `googleapis`
- Modify: `CLAUDE.md` — document the four new env vars

**Interfaces:**
- Consumes: invoice rows from Directus
- Produces:
  - `buildPlaceholders(invoice, quantity: number, unitPrice: number, dashboardUrl: string): Record<string, string>` (pure — the whole `{{...}}` map)
  - `interface DocGateway { copyTemplate(name: string): Promise<{fileId: string; url: string}>; replaceText(fileId: string, map: Record<string,string>): Promise<void> }`
  - `generateInvoiceDocument(invoiceId: string, gateway?: DocGateway, now?: Date): Promise<{doc_url: string; doc_file_id: string; version: number}>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/items/partner_invoices/") && (init?.method ?? "GET") === "GET") {
      return { data: {
        id: "inv-1", number: "EME-202607", version: 1, period_month: "2026-07",
        period_start: "2026-07-01", period_end: "2026-07-31",
        issued_at: "2026-09-05T00:00:00.000Z", due_at: "2026-09-26T00:00:00.000Z",
        subtotal_chf: "680.00", adjustment_chf: "0.00", total_chf: "680.00",
        vat_rate: "0.00", vat_chf: "0.00", doc_versions: [],
        issuer_snapshot: { name: "easyRecharge", contact_name: "Yoan Basset",
          street: "Ch. de Sorécot 33", postal_code: "1033", locality: "Cheseaux/Lausanne" },
        debtor_snapshot: { name: "E-ME Énergies Sàrl", street: "Chemin de la Crétaux 4",
          postal_code: "1196", locality: "Gland", email: "jendoubi@emeenergies.ch" },
        partner: { dashboard_token: "tok-123" },
      } };
    }
    if (path.startsWith("/items/partner_invoice_lines")) {
      return { data: [
        { kind: "lead", amount_chf: "40.00", unit_price_chf: "40.00" },
        { kind: "lead", amount_chf: "40.00", unit_price_chf: "40.00" },
      ] };
    }
    return { data: {} };
  }),
}));

describe("buildPlaceholders", () => {
  it("produces English keys with French-formatted values", async () => {
    const { buildPlaceholders } = await import("./google-docs");
    const map = buildPlaceholders(
      { number: "EME-202607", version: 2, period_start: "2026-07-01", period_end: "2026-07-31",
        period_month: "2026-07", issued_at: "2026-09-05T00:00:00.000Z",
        due_at: "2026-09-26T00:00:00.000Z", total_chf: "680.00", vat_rate: "0.00", vat_chf: "0.00",
        issuer_snapshot: { name: "easyRecharge", contact_name: "Yoan Basset",
          street: "Ch. de Sorécot 33", postal_code: "1033", locality: "Cheseaux/Lausanne" },
        debtor_snapshot: { name: "E-ME Énergies Sàrl", street: "Chemin de la Crétaux 4",
          postal_code: "1196", locality: "Gland", email: "jendoubi@emeenergies.ch" } },
      17, 40,
      "https://easyrecharge.ch/fr/partners/tok-123/invoices",
    );

    expect(map["{{invoice_number}}"]).toBe("EME-202607");
    expect(map["{{invoice_version}}"]).toBe("v2");
    expect(map["{{issue_date}}"]).toBe("05.09.2026");
    expect(map["{{due_date}}"]).toBe("26.09.2026");
    expect(map["{{period_label}}"]).toBe("07.2026");
    expect(map["{{line_description}}"]).toBe("Demandes de devis – 01.07 au 31.07.2026");
    expect(map["{{line_quantity}}"]).toBe("17");
    expect(map["{{line_unit_price}}"]).toBe("CHF 40.00");
    expect(map["{{line_amount}}"]).toBe("CHF 680.00");
    expect(map["{{total_due}}"]).toBe("CHF 680.00");
    expect(map["{{sent_to}}"]).toBe("jendoubi@emeenergies.ch");
    expect(map["{{dashboard_url}}"]).toBe("https://easyrecharge.ch/fr/partners/tok-123/invoices");
    // No French keys leak in.
    expect(Object.keys(map).some((k) => /numero|facture|montant/i.test(k))).toBe(false);
  });
});

describe("generateInvoiceDocument", () => {
  it("uses the injected gateway and bumps the version", async () => {
    const calls: string[] = [];
    const gateway = {
      copyTemplate: vi.fn(async (name: string) => { calls.push(`copy:${name}`); return { fileId: "f1", url: "https://docs.google.com/document/d/f1/edit" }; }),
      replaceText: vi.fn(async (fileId: string) => { calls.push(`replace:${fileId}`); }),
    };
    const { generateInvoiceDocument } = await import("./google-docs");
    const r = await generateInvoiceDocument("inv-1", gateway, new Date("2026-09-05T00:00:00Z"));

    expect(r.doc_file_id).toBe("f1");
    expect(r.version).toBe(1);
    expect(calls).toEqual(["copy:EME-202607 v1", "replace:f1"]);
    expect(gateway.replaceText).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/billing/google-docs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Install the dependency**

Run: `npm install googleapis`

- [ ] **Step 4: Implement**

```ts
import { directusFetch } from "@/lib/directus";

export interface DocGateway {
  copyTemplate(name: string): Promise<{ fileId: string; url: string }>;
  replaceText(fileId: string, map: Record<string, string>): Promise<void>;
}

function chf(v: string | number): string {
  return `CHF ${Number(v).toFixed(2)}`;
}

/** 2026-09-05T… -> 05.09.2026 */
function frDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** 2026-07-01 + 2026-07-31 -> "Demandes de devis – 01.07 au 31.07.2026" */
function lineDescription(start: string, end: string): string {
  const [, sm, sd] = start.split("-");
  const [ey, em, ed] = end.split("-");
  return `Demandes de devis – ${sd}.${sm} au ${ed}.${em}.${ey}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildPlaceholders(
  invoice: any, quantity: number, unitPrice: number, dashboardUrl: string,
): Record<string, string> {
  const issuer = invoice.issuer_snapshot ?? {};
  const debtor = invoice.debtor_snapshot ?? {};
  const [year, month] = invoice.period_month.split("-");

  return {
    "{{invoice_number}}": invoice.number,
    "{{invoice_version}}": `v${invoice.version}`,
    "{{issue_date}}": frDate(invoice.issued_at),
    "{{due_date}}": frDate(invoice.due_at),
    "{{issuer_name}}": issuer.name ?? "",
    "{{issuer_contact}}": issuer.contact_name ?? "",
    "{{issuer_street}}": issuer.street ?? "",
    "{{issuer_city}}": `${issuer.postal_code ?? ""} ${issuer.locality ?? ""}`.trim(),
    "{{debtor_name}}": debtor.name ?? "",
    "{{debtor_street}}": debtor.street ?? "",
    "{{debtor_city}}": `${debtor.postal_code ?? ""} ${debtor.locality ?? ""}`.trim(),
    "{{sent_to}}": debtor.email ?? "",
    "{{period_label}}": `${month}.${year}`,
    "{{period_start}}": frDate(invoice.period_start),
    "{{period_end}}": frDate(invoice.period_end),
    "{{line_description}}": lineDescription(invoice.period_start, invoice.period_end),
    "{{line_quantity}}": String(quantity),
    "{{line_unit_price}}": chf(unitPrice),
    "{{line_amount}}": chf(invoice.total_chf),
    "{{vat_rate}}": `${Number(invoice.vat_rate ?? 0).toFixed(0)}%`,
    "{{vat_amount}}": chf(invoice.vat_chf ?? 0),
    "{{total_due}}": chf(invoice.total_chf),
    "{{dashboard_url}}": dashboardUrl,
  };
}

/**
 * Lazily built so tests never need Google credentials — every test injects a
 * fake gateway instead.
 */
async function defaultGateway(): Promise<DocGateway> {
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "").replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
    ],
  });
  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });

  return {
    async copyTemplate(name) {
      const res = await drive.files.copy({
        fileId: process.env.GOOGLE_INVOICE_TEMPLATE_DOC_ID!,
        requestBody: { name, parents: [process.env.GOOGLE_INVOICE_FOLDER_ID!] },
      });
      const fileId = res.data.id!;
      return { fileId, url: `https://docs.google.com/document/d/${fileId}/edit` };
    },
    async replaceText(fileId, map) {
      await docs.documents.batchUpdate({
        documentId: fileId,
        requestBody: {
          requests: Object.entries(map).map(([find, replace]) => ({
            replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: replace },
          })),
        },
      });
    },
  };
}

/**
 * Always produces a NEW document and pushes the previous one onto doc_versions.
 * Yoan edits these by hand (he adds the QR payment part), so overwriting would
 * destroy his work.
 */
export async function generateInvoiceDocument(
  invoiceId: string, gateway?: DocGateway, now: Date = new Date(),
): Promise<{ doc_url: string; doc_file_id: string; version: number }> {
  const gw = gateway ?? (await defaultGateway());

  const invRes = await directusFetch<{ data: any }>( // eslint-disable-line @typescript-eslint/no-explicit-any
    `/items/partner_invoices/${invoiceId}?fields=*,partner.dashboard_token`,
    { next: { revalidate: 0 } },
  );
  const invoice = invRes?.data;
  if (!invoice) throw new Error("invoice_not_found");

  const linesRes = await directusFetch<{ data: { kind: string; unit_price_chf: string }[] }>(
    `/items/partner_invoice_lines?filter[invoice][_eq]=${invoiceId}&fields=kind,unit_price_chf,amount_chf&limit=500`,
    { next: { revalidate: 0 } },
  );
  const leadLines = (linesRes?.data ?? []).filter((l) => l.kind === "lead");
  const quantity = leadLines.length;
  const unitPrice = quantity > 0 ? Number(leadLines[0].unit_price_chf) : 0;

  const token = invoice.partner?.dashboard_token ?? "";
  const dashboardUrl = `https://easyrecharge.ch/fr/partners/${token}/invoices`;

  const name = `${invoice.number} v${invoice.version}`;
  const { fileId, url } = await gw.copyTemplate(name);
  await gw.replaceText(fileId, buildPlaceholders(invoice, quantity, unitPrice, dashboardUrl));

  const previous = Array.isArray(invoice.doc_versions) ? invoice.doc_versions : [];
  await directusFetch(`/items/partner_invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      doc_url: url, doc_file_id: fileId,
      doc_versions: [...previous, {
        version: invoice.version, doc_url: url, doc_file_id: fileId,
        generated_at: now.toISOString(),
      }],
    }),
    next: { revalidate: 0 },
  });

  return { doc_url: url, doc_file_id: fileId, version: invoice.version };
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/lib/billing/google-docs.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Document the env vars**

Add to the CLAUDE.md environment section:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service account address>
GOOGLE_SERVICE_ACCOUNT_KEY=<PEM private key, \n-escaped>
GOOGLE_INVOICE_TEMPLATE_DOC_ID=<Doc id of the placeholder template>
GOOGLE_INVOICE_FOLDER_ID=<destination Drive folder>
CRON_SECRET=<generate with `openssl rand -base64 32`>
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/billing/google-docs.ts src/lib/billing/google-docs.test.ts package.json package-lock.json CLAUDE.md
git commit -m "feat(billing): Google Doc generation from the invoice template"
```

---

# Phase 3 — Admin routes and MCP tools

### Task 14: Token-gated admin routes

**Files:**
- Create: `src/app/api/admin/invoices/route.ts` (GET list, POST issue)
- Create: `src/app/api/admin/invoices/preview/route.ts`
- Create: `src/app/api/admin/invoices/[id]/document/route.ts`
- Create: `src/app/api/admin/invoices/[id]/status/route.ts`
- Create: `src/app/api/admin/invoices/[id]/note/route.ts`
- Create: `src/app/api/admin/invoices/[id]/adjustment/route.ts`

**Interfaces:**
- Consumes: everything exported from `@/lib/billing/invoice` and `@/lib/billing/google-docs`
- Produces: the six endpoints in the spec's Surfaces table, **plus an adjustment endpoint**. The spec's Surfaces table omits it, but `addAdjustmentLine` (Task 12) is how the spec's "exceptional corrections are a manual `adjustment` line" actually gets invoked — without a surface it is dead code. All gated by `x-admin-token` matching `DIRECTUS_STATIC_TOKEN`, matching `src/app/api/admin/billing/route.ts`.

- [ ] **Step 1: Write the shared guard**

Create `src/lib/billing/admin-guard.ts`:

```ts
/** Same convention as /api/admin/billing — a static header, no session. */
export function assertAdmin(req: Request): boolean {
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  return Boolean(token) && req.headers.get("x-admin-token") === token;
}

const STATUS_BY_ERROR: Record<string, number> = {
  invalid_month: 400,
  partner_not_found: 404,
  invoice_not_found: 404,
  period_not_issuable: 409,
  unsettled_dispatches: 409,
  empty_scope: 409,
  duplicate_number: 409,
  invalid_transition: 409,
  invoice_closed: 409,
  missing_invoice_code: 500,
};

export function errorStatus(e: unknown): number {
  return e instanceof Error ? (STATUS_BY_ERROR[e.message] ?? 500) : 500;
}
```

- [ ] **Step 2: Write the issue + list route**

`src/app/api/admin/invoices/route.ts`:

```ts
import { NextResponse } from "next/server";
import { directusFetch } from "@/lib/directus";
import { issueInvoice } from "@/lib/billing/invoice";
import { assertAdmin, errorStatus } from "@/lib/billing/admin-guard";

export async function GET(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const params = new URLSearchParams();
  params.set("fields", "id,number,version,status,period_month,total_chf,issued_at,due_at,paid_at,doc_url");
  params.set("sort", "-issued_at");
  params.set("limit", "100");
  const month = searchParams.get("month");
  if (month) params.set("filter[period_month][_eq]", month);
  const res = await directusFetch<{ data: unknown[] }>(
    `/items/partner_invoices?${params}`, { next: { revalidate: 0 } },
  );
  return NextResponse.json({ rows: res?.data ?? [] });
}

export async function POST(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { partner, month } = body as { partner?: string; month?: string };
  if (!partner || !month) {
    return NextResponse.json({ error: "partner_and_month_required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await issueInvoice(partner, month));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: errorStatus(e) },
    );
  }
}
```

- [ ] **Step 3: Write the preview route**

`src/app/api/admin/invoices/preview/route.ts`:

```ts
import { NextResponse } from "next/server";
import { previewInvoice } from "@/lib/billing/invoice";
import { assertAdmin, errorStatus } from "@/lib/billing/admin-guard";

export async function POST(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { partner, month } = (await req.json().catch(() => ({}))) as { partner?: string; month?: string };
  if (!partner || !month) {
    return NextResponse.json({ error: "partner_and_month_required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await previewInvoice(partner, month));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: errorStatus(e) },
    );
  }
}
```

- [ ] **Step 4: Write the document, status and note routes**

`src/app/api/admin/invoices/[id]/document/route.ts`:

```ts
import { NextResponse } from "next/server";
import { generateInvoiceDocument } from "@/lib/billing/google-docs";
import { assertAdmin, errorStatus } from "@/lib/billing/admin-guard";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await generateInvoiceDocument(id));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: errorStatus(e) },
    );
  }
}
```

`src/app/api/admin/invoices/[id]/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { setInvoiceStatus } from "@/lib/billing/invoice";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/lib/billing/types";
import { assertAdmin, errorStatus } from "@/lib/billing/admin-guard";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { status, note } = (await req.json().catch(() => ({}))) as { status?: string; note?: string };
  if (!status || !INVOICE_STATUSES.includes(status as InvoiceStatus)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  try {
    await setInvoiceStatus(id, status as InvoiceStatus, note);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: errorStatus(e) },
    );
  }
}
```

`src/app/api/admin/invoices/[id]/note/route.ts`:

```ts
import { NextResponse } from "next/server";
import { addInvoiceNote } from "@/lib/billing/invoice";
import { assertAdmin, errorStatus } from "@/lib/billing/admin-guard";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { actor, note } = (await req.json().catch(() => ({}))) as { actor?: string; note?: string };
  if (!note) return NextResponse.json({ error: "note_required" }, { status: 400 });
  const who = actor === "partner" || actor === "system" ? actor : "yoan";
  try {
    await addInvoiceNote(id, who, note);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: errorStatus(e) },
    );
  }
}
```

`src/app/api/admin/invoices/[id]/adjustment/route.ts`:

```ts
import { NextResponse } from "next/server";
import { addAdjustmentLine } from "@/lib/billing/invoice";
import { assertAdmin, errorStatus } from "@/lib/billing/admin-guard";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { description, amount_chf } = (await req.json().catch(() => ({}))) as {
    description?: string; amount_chf?: number;
  };
  if (!description || typeof amount_chf !== "number" || Number.isNaN(amount_chf)) {
    return NextResponse.json({ error: "description_and_amount_required" }, { status: 400 });
  }
  try {
    await addAdjustmentLine(id, description, amount_chf);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: errorStatus(e) },
    );
  }
}
```

- [ ] **Step 5: Smoke-test locally**

```bash
npm run dev
T=$(grep ^DIRECTUS_STATIC_TOKEN .env.local | cut -d= -f2-)
curl -s -X POST -H "x-admin-token: $T" -H 'Content-Type: application/json' \
  -d '{"partner":"eme-energies","month":"2026-07"}' \
  http://localhost:3000/api/admin/invoices/preview | python3 -m json.tool
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -d '{"partner":"eme-energies","month":"2026-07"}' \
  http://localhost:3000/api/admin/invoices/preview
```
Expected: a JSON preview with `number: "EME-202607"` for the first; `401` for the second.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/app/api/admin/invoices src/lib/billing/admin-guard.ts
git commit -m "feat(billing): admin invoicing routes"
```

---

### Task 15: MCP tools

**Files:**
- Create: `src/lib/mcp/tools/invoicing.ts`
- Modify: `src/app/api/[transport]/route.ts`

**Interfaces:**
- Consumes: `@/lib/billing/invoice`, `@/lib/billing/google-docs`
- Produces: `registerInvoicingTools(server)` exposing `preview_invoice`, `issue_invoice`, `generate_invoice_document`, `set_invoice_status`, `add_invoice_note`, `add_invoice_adjustment`, `list_invoices`.

Read `src/lib/mcp/tools/admin.ts` first and copy its registration shape exactly — same `server.tool(name, {title, description, inputSchema}, handler)` signature and the same result envelope.

- [ ] **Step 1: Write the tool module**

```ts
import { z } from "zod";
import { directusFetch } from "@/lib/directus";
import {
  addAdjustmentLine, addInvoiceNote, issueInvoice, previewInvoice, setInvoiceStatus,
} from "@/lib/billing/invoice";
import { generateInvoiceDocument } from "@/lib/billing/google-docs";
import { INVOICE_STATUSES } from "@/lib/billing/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerInvoicingTools(server: any) {
  server.tool(
    "preview_invoice",
    {
      title: "Preview a partner invoice",
      description:
        "Dry-run the invoice for a partner and month: number, period bounds, whether it is issuable yet, the billable lines, unsettled dispatches and the total. Writes nothing.",
      inputSchema: {
        partner: z.string().describe("partner slug, e.g. eme-energies"),
        month: z.string().describe("YYYY-MM"),
      },
    },
    async ({ partner, month }: { partner: string; month: string }) => ({
      content: [{ type: "text", text: JSON.stringify(await previewInvoice(partner, month), null, 2) }],
    }),
  );

  server.tool(
    "issue_invoice",
    {
      title: "Issue a partner invoice",
      description:
        "IRREVERSIBLE. Freezes the period: assigns the number, snapshots issuer and debtor, writes the lines and stamps each dispatch so it can never be billed twice. Refuses if the acceptance window has not closed or any dispatch is unsettled. Run preview_invoice first.",
      inputSchema: {
        partner: z.string().describe("partner slug"),
        month: z.string().describe("YYYY-MM"),
      },
    },
    async ({ partner, month }: { partner: string; month: string }) => ({
      content: [{ type: "text", text: JSON.stringify(await issueInvoice(partner, month), null, 2) }],
    }),
  );

  server.tool(
    "generate_invoice_document",
    {
      title: "Generate the invoice Google Doc",
      description:
        "Copies the template, fills the placeholders and returns the Doc URL. Always creates a NEW document — never overwrites a previous one, which may carry hand edits (Yoan adds the QR payment part by hand).",
      inputSchema: { invoiceId: z.string().describe("partner_invoices id") },
    },
    async ({ invoiceId }: { invoiceId: string }) => ({
      content: [{ type: "text", text: JSON.stringify(await generateInvoiceDocument(invoiceId), null, 2) }],
    }),
  );

  server.tool(
    "set_invoice_status",
    {
      title: "Set invoice status",
      description:
        "Move an invoice through issued -> sent -> paid, or to disputed/cancelled. paid and cancelled are terminal; issued cannot jump straight to paid.",
      inputSchema: {
        invoiceId: z.string(),
        status: z.enum(INVOICE_STATUSES),
        note: z.string().optional(),
      },
    },
    async ({ invoiceId, status, note }: { invoiceId: string; status: typeof INVOICE_STATUSES[number]; note?: string }) => {
      await setInvoiceStatus(invoiceId, status, note);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, status }) }] };
    },
  );

  server.tool(
    "add_invoice_note",
    {
      title: "Log an invoice comment",
      description:
        "Append a comment to the invoice's event log — used to record the back-and-forth with the partner before payment.",
      inputSchema: {
        invoiceId: z.string(),
        actor: z.enum(["yoan", "partner", "system"]).optional(),
        note: z.string(),
      },
    },
    async ({ invoiceId, actor, note }: { invoiceId: string; actor?: "yoan" | "partner" | "system"; note: string }) => {
      await addInvoiceNote(invoiceId, actor ?? "yoan", note);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
    },
  );

  server.tool(
    "add_invoice_adjustment",
    {
      title: "Add an adjustment line",
      description:
        "Append a discount or correction line and recompute the total. Negative amounts are the normal case — this is how an exceptional credit is granted on a later invoice instead of issuing a credit note. Refused on a paid or cancelled invoice.",
      inputSchema: {
        invoiceId: z.string(),
        description: z.string().describe("shown as the line label on the document"),
        amountChf: z.number().describe("negative for a discount"),
      },
    },
    async ({ invoiceId, description, amountChf }: { invoiceId: string; description: string; amountChf: number }) => {
      await addAdjustmentLine(invoiceId, description, amountChf);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
    },
  );

  server.tool(
    "list_invoices",
    {
      title: "List partner invoices",
      description: "Invoices newest first, optionally filtered by month or status.",
      inputSchema: {
        month: z.string().optional().describe("YYYY-MM"),
        status: z.string().optional(),
      },
    },
    async ({ month, status }: { month?: string; status?: string }) => {
      const params = new URLSearchParams();
      params.set("fields", "id,number,version,status,period_month,total_chf,issued_at,due_at,paid_at,doc_url");
      params.set("sort", "-issued_at");
      params.set("limit", "100");
      if (month) params.set("filter[period_month][_eq]", month);
      if (status) params.set("filter[status][_eq]", status);
      const res = await directusFetch<{ data: unknown[] }>(
        `/items/partner_invoices?${params}`, { next: { revalidate: 0 } },
      );
      return { content: [{ type: "text", text: JSON.stringify(res?.data ?? [], null, 2) }] };
    },
  );
}
```

- [ ] **Step 2: Register the group**

In `src/app/api/[transport]/route.ts`, import `registerInvoicingTools` alongside the existing groups and call it in the same place they are called.

- [ ] **Step 3: Verify the tools appear**

```bash
npm run dev
T=$(grep ^MCP_STATIC_TOKEN .env.local | cut -d= -f2-)
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -o '"name":"[a-z_]*invoice[a-z_]*"' | sort -u
```
Expected: the six new tool names.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint
git add src/lib/mcp/tools/invoicing.ts src/app/api/\[transport\]/route.ts
git commit -m "feat(mcp): invoicing tools"
```

---

# Phase 4 — Partner-facing view

### Task 16: Enable the Billing slot and add the invoices page

**Files:**
- Create: `src/app/partners/[uuid]/invoices/page.tsx`
- Create: `src/components/partners/InvoiceList.tsx`
- Modify: `src/components/partners/PartnerSidebar.tsx:43` (`PartnerNav`) and `:209-221` (the disabled Billing item)
- Modify: `src/lib/partner-i18n.ts:18` (`PREFIXES`)
- Manual: create the `partner-invoices` CMS page in Directus

**Interfaces:**
- Consumes: `findPartnerByToken` from `@/lib/partner-auth`, `fetchPage` from `@/lib/directus-queries`, `extractPageDictionary` from `@/lib/i18n/dictionaries`
- Produces: `fetchPartnerInvoices(partnerId: string)` in a new `src/lib/billing/partner-queries.ts`, returning invoices with their lines for the dashboard.

- [ ] **Step 1: Create the CMS page (manual)**

In Directus → `pages`, create a row with `route_id = "partner-invoices"`, published, with fr and de translations carrying at minimum these keys (the `pages.partner-invoices.` prefix is added by `extractPageDictionary`):

`title`, `empty`, `col.number`, `col.period`, `col.total`, `col.status`, `col.issued`, `col.due`, `status.issued`, `status.sent`, `status.disputed`, `status.paid`, `detail.title`, `detail.col.date`, `detail.col.lead`, `detail.col.category`, `detail.col.amount`.

- [ ] **Step 2: Add the i18n prefix**

In `src/lib/partner-i18n.ts`:

```ts
const PREFIXES = [
  "pages.partner-leads.",
  "pages.partner-stats.",
  "pages.partner-invoices.",
] as const;
```

- [ ] **Step 3: Write the query helper**

Create `src/lib/billing/partner-queries.ts`:

```ts
import { directusFetch } from "@/lib/directus";

export interface PartnerInvoiceLine {
  label: string; dispatched_at: string | null; lead_category: string | null;
  amount_chf: string; kind: string;
}

export interface PartnerInvoice {
  id: string; number: string; version: number; status: string;
  period_month: string; total_chf: string;
  issued_at: string | null; due_at: string | null; paid_at: string | null;
  lines: PartnerInvoiceLine[];
}

/** Invoices visible to the partner. Cancelled ones are never shown. */
export async function fetchPartnerInvoices(partnerId: string): Promise<PartnerInvoice[]> {
  const params = new URLSearchParams();
  params.set(
    "fields",
    "id,number,version,status,period_month,total_chf,issued_at,due_at,paid_at," +
      "lines.label,lines.dispatched_at,lines.lead_category,lines.amount_chf,lines.kind",
  );
  params.set("filter[partner][_eq]", partnerId);
  params.set("filter[status][_neq]", "cancelled");
  params.set("sort", "-period_month");
  params.set("limit", "100");

  const res = await directusFetch<{ data: PartnerInvoice[] }>(
    `/items/partner_invoices?${params}`, { next: { revalidate: 0 } },
  );
  return res?.data ?? [];
}
```

- [ ] **Step 4: Write the page**

Create `src/app/partners/[uuid]/invoices/page.tsx`, mirroring `leads/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { findPartnerByToken } from "@/lib/partner-auth";
import { fetchPartnerInvoices } from "@/lib/billing/partner-queries";
import { fetchPage } from "@/lib/directus-queries";
import { extractPageDictionary } from "@/lib/i18n/dictionaries";
import { slugToDirectusLocale } from "@/lib/i18n/config";
import { PartnerSidebar } from "@/components/partners/PartnerSidebar";
import { InvoiceList } from "@/components/partners/InvoiceList";

export const metadata: Metadata = {
  title: "Factures — Espace partenaire",
  robots: { index: false, follow: false },
};

const SUPPORTED_LANGS = ["fr", "de"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

export default async function PartnerInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { uuid } = await params;
  const { lang: langParam } = await searchParams;
  const lang: Lang =
    langParam && (SUPPORTED_LANGS as readonly string[]).includes(langParam)
      ? (langParam as Lang)
      : "fr";

  const partner = await findPartnerByToken(uuid);
  if (!partner) notFound();

  const locale = slugToDirectusLocale(lang);
  const [invoices, page] = await Promise.all([
    fetchPartnerInvoices(partner.id),
    fetchPage("partner-invoices", locale),
  ]);
  const dictionary = extractPageDictionary(page);

  return (
    <PartnerSidebar
      partnerName={partner.name}
      partnerToken={uuid}
      leadCount={0}
      supportHref={`mailto:yoan@easyrecharge.ch?subject=${encodeURIComponent(`[Factures] ${partner.name}`)}`}
      activeNav="invoices"
      lang={lang}
      dictionary={dictionary}
      facetOptions={{ cantons: [], categories: [], products: [] }}
    >
      <InvoiceList invoices={invoices} dictionary={dictionary} lang={lang} />
    </PartnerSidebar>
  );
}
```

> If `facetOptions`'s `Facets` type differs from `{cantons, categories, products}`, read `src/components/partners/PartnerFilterContext.tsx` and pass empty arrays for whatever keys it declares — the invoices view has no facet filtering.

- [ ] **Step 5: Enable the sidebar item**

In `src/components/partners/PartnerSidebar.tsx`, widen the nav type:

```ts
export type PartnerNav = "leads" | "stats" | "invoices";
```

and replace the disabled Billing item with a real link:

```tsx
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeNav === "invoices"}
                  tooltip={t("sidebar.nav.billing")}
                  className="font-medium"
                  render={<Link href={`/${lang}/partners/${partnerToken}/invoices`} prefetch={false} />}
                >
                  <Receipt className="h-4 w-4" />
                  <span>{t("sidebar.nav.billing")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
```

Leave the Settings item untouched — it stays "Bientôt".

- [ ] **Step 6: Write the list component**

Create `src/components/partners/InvoiceList.tsx` as a Server Component (no interactivity needed — the detail is an inline `<details>` block):

```tsx
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import type { PartnerInvoice } from "@/lib/billing/partner-queries";

function frDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function chf(v: string): string {
  return `CHF ${Number(v).toFixed(2)}`;
}

export function InvoiceList({
  invoices,
  dictionary,
}: {
  invoices: PartnerInvoice[];
  dictionary: PartnerDict;
  lang: "fr" | "de";
}) {
  const t = makePartnerT(dictionary);

  if (invoices.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {invoices.map((inv) => (
        <details key={inv.id} className="rounded-lg border p-4">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono font-medium">{inv.number}</span>
              <span className="text-sm text-muted-foreground">{inv.period_month}</span>
              <span className="font-medium">{chf(inv.total_chf)}</span>
              <span className="rounded-full border px-2 py-0.5 text-xs">
                {t(`status.${inv.status}`)}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("col.issued")} {frDate(inv.issued_at)} · {t("col.due")} {frDate(inv.due_at)}
            </div>
          </summary>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1">{t("detail.col.date")}</th>
                <th className="py-1">{t("detail.col.lead")}</th>
                <th className="py-1">{t("detail.col.category")}</th>
                <th className="py-1 text-right">{t("detail.col.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((line, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1">{frDate(line.dispatched_at)}</td>
                  <td className="py-1">{line.label}</td>
                  <td className="py-1">{line.lead_category ?? "—"}</td>
                  <td className="py-1 text-right font-mono">{chf(line.amount_chf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Verify in the browser**

```bash
npm run dev
```
Open `http://localhost:3000/partners/<E-ME dashboard_token>/invoices`. Expected: the sidebar's Billing item is active and no longer badged "Bientôt"; the invoice list renders; expanding one shows its lead lines. Check `?lang=de` renders German strings. Confirm an invalid token 404s.

- [ ] **Step 8: Lint, test and commit**

```bash
npm run lint && npm test
git add src/app/partners/\[uuid\]/invoices src/components/partners/InvoiceList.tsx \
  src/components/partners/PartnerSidebar.tsx src/lib/partner-i18n.ts \
  src/lib/billing/partner-queries.ts
git commit -m "feat(partners): invoices view replacing the spreadsheet annex"
```

---

### Task 17: First real invoicing run

**Files:** none — this is an operations task run against production.

- [ ] **Step 1: Prepare the July ledger**

The QA test lead of 12.07 (`lead.dispatch.qa@proton.me`) carries `status='dispatched'`, so the scope rule includes it. Disqualify it in Directus before issuing: set `disqualified = true`, `disqualification_reason = "dedup"`, `disqualification_note = "QA test lead"`.

- [ ] **Step 2: Preview July**

```bash
T=$(grep ^DIRECTUS_STATIC_TOKEN .env.local | cut -d= -f2-)
curl -s -X POST -H "x-admin-token: $T" -H 'Content-Type: application/json' \
  -d '{"partner":"eme-energies","month":"2026-07"}' \
  https://easyrecharge.ch/api/admin/invoices/preview | python3 -m json.tool
```
Expected: `number: "EME-202607"`, `issuable: true`, 14 lines, `totalChf: 560`, `unsettled: []`.

If `unsettled` is non-empty, the daily cron has not yet locked those rows — wait or run `POST /api/admin/reconcile-billing` manually.

- [ ] **Step 3: Issue, then add the three pre-go-live leads**

```bash
curl -s -X POST -H "x-admin-token: $T" -H 'Content-Type: application/json' \
  -d '{"partner":"eme-energies","month":"2026-07"}' \
  https://easyrecharge.ch/api/admin/invoices
```

The three leads dispatched before the ledger went live (Papeil 04.07, Chaillet 07.07, Golay 07.07) have no ledger rows. Add them in Directus as `partner_invoice_lines` with `kind = "lead"`, `dispatch = null`, `unit_price_chf = 40`, `amount_chf = 40`, and labels in the June format:

```
P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04
P / CHAILLET / 1009 Pully / 2026-07-07
P / GOLAY / 1807 Blonay / 2026-07-07
```

Then update the invoice's `subtotal_chf` and `total_chf` to `680.00`.

Shabani (5325 Leibstadt, AG) is **not** added — AG is in no E-ME coverage area.

- [ ] **Step 4: Generate the document**

```bash
curl -s -X POST -H "x-admin-token: $T" \
  https://easyrecharge.ch/api/admin/invoices/<id>/document
```
Open the returned URL. Verify every `{{...}}` placeholder is gone, the quantity reads 17 and the total CHF 680.00. Add the QR payment part by hand, export and send.

- [ ] **Step 5: Record the send**

```bash
curl -s -X POST -H "x-admin-token: $T" -H 'Content-Type: application/json' \
  -d '{"status":"sent"}' https://easyrecharge.ch/api/admin/invoices/<id>/status
```

---

## Self-review notes

**Spec coverage.** Every spec section maps to a task: Prerequisites 1–6 → Tasks 1–5; Data model → Task 6; Scope rule → Task 10; Lifecycle → Task 12; Numbering → Task 9; Document generation → Task 13; Surfaces → Tasks 14–15; Partner-facing view → Task 16; Rollout → Task 17. Error handling is distributed across Tasks 11, 12 and 14 (`admin-guard.ts` owns the error→status map). Testing is inline per task.

**Two gaps found and closed:**
- The spec never said where the `EME` in `EME-202607` comes from. Added `partners.invoice_code` (Task 6), and `buildInvoiceNumber` throws `missing_invoice_code` rather than deriving it from the slug.
- The spec's Surfaces table has no adjustment endpoint, so `addAdjustmentLine` would have shipped as dead code and the spec's stated mechanism for exceptional credits would have had no way to be invoked. Added `POST /api/admin/invoices/[id]/adjustment` (Task 14) and `add_invoice_adjustment` (Task 15).

**Type consistency checked:** every symbol used in a later task is defined in an earlier one — `computePeriod`/`isPeriodIssuable` (8) → 11; `buildInvoiceNumber` (9) → 11; `collectBillableDispatches` (10) → 11; `previewInvoice`/`issueInvoice` (11) → 14, 15; `setInvoiceStatus`/`addInvoiceNote`/`addAdjustmentLine` (12) → 14, 15; `DocGateway`/`generateInvoiceDocument` (13) → 14, 15; `fetchPartnerInvoices` (16) → 16.

**Known deviations from the spec, deliberate:**
- `reconcileBilling`'s `billable` filter also moves to `_neq: true` (Task 1). The spec only names `disqualified` and `gift`, but a null `billable` has the same defect.
- `previewInvoice` and `issueInvoice` take a partner **slug**, not an id — slugs are what a human types into an MCP tool.

**Still unverified:** the template's internal structure. Task 13 assumes `replaceAllText` suffices because the Doc carries a single aggregated line. If the template turns out to hold a repeating row structure, Task 13's gateway needs table-row insertion and the task grows.
