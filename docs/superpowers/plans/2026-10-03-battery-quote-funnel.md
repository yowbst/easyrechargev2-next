# Battery Quote Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a second lead vertical, the home solar battery: a short quote funnel whose leads are categorised, scored, dispatched, priced and invoiced through the existing partner chain.

**Architecture:** A new product key `battery` and a Directus page `quote-battery`. The funnel runs on a new product-agnostic `QuoteShell` (welcome, contact, finalize, navigation, draft, analytics, submission) that renders product steps from a `ProductFunnel` definition; the charger's `QuoteForm.tsx` is left untouched. Server-side, lead categorisation and scoring become per product, dispatch dedup is scoped per product, and non-dispatchable leads (`no_pv`) skip dispatch without a ledger row.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind 4, Base UI primitives (`@base-ui/react`), Vitest 4 (node env, `src/**/*.test.ts`), Directus (REST via `directusFetch`, writes via the easyrecharge MCP), PostHog, Google Ads (gtag).

**Spec:** `docs/superpowers/specs/2026-10-03-battery-quote-funnel-design.md`

## Global Constraints

- `src/components/quote/QuoteForm.tsx` is not modified by any task.
- The new funnel never uses the Base UI `RadioGroup`; every choice is `IconButtonGroup` or `RangeButtonGroup` (native `<button>`s).
- Product key `battery`; Directus page `route_id` `quote-battery`; default product stays `ecp`.
- Battery lead categories, exact strings: `owner_pv_small`, `owner_pv_large`, `co_owner_pv_small`, `co_owner_pv_large`, `no_pv`. Large means `pvPower >= 10` kWc; unknown (`"na"`, missing, unparseable) counts as small.
- `no_pv` is never dispatched, never written to `partner_dispatches`, never reported as an Ads `quote_submit` conversion.
- Bucket answers store a representative number (pattern of `src/lib/quoteBuckets.ts`); "don't know" stores the string `"na"`.
- Every new user-facing string comes from Directus; code fallbacks exist only where `QuoteForm.tsx` already has one (the missing-answer hint).
- Adding any enum value (category, scoring factor) ships with its fr-FR **and** de-DE Directus translation in the same task set (memory: `feedback_new_enum_needs_translation`).
- Directus writes are outward-facing: show the exact payload and get Yoan's explicit go before each write. A PATCH on a JSON field replaces it whole: always send the complete object (memory: `project_directus_json_patch_replaces`).
- Commit after every task. Never push (memory: `feedback_no_auto_push`). Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run commands from the repo root `/Users/yoanbasset/Code/easyrechargev2-next`. The shell is zsh: quote globs (`--include="*.ts"`) and never `echo ====` (zsh `=` expansion).

## Review Focus

1. A visitor answers "j'ai une installation", fills the PV step, goes back and switches to "pas d'installation", then back again: the PV and consumption steps disappear and reappear with their answers, the category follows the last answer. → `navigation.test.ts` (Task 7) and `categorize.test.ts` (Task 3).
2. Exact entries typed the Swiss way, `"12,5"`, `"12'000"`, `"0"`, `"abc"`: commas and apostrophes parse, zero and garbage are rejected and block Continue. → `validation.test.ts` (Task 8).
3. A visitor sets 2 EVs, answers "borne: non", then changes to 0 EVs: the charger answer is cleared and the "EV planned" question appears; going 0 → 1 clears "EV planned". → `validation.test.ts` (Task 8).
4. Same browser tab, a half-filled charger quote, then the battery funnel: no charger answer leaks into the battery draft and vice versa. → `quoteDraft.test.ts` (Task 7).
5. Success page with a CTA whose `show_when` is malformed in Directus, or whose submission fetch fails: the conditional CTA stays hidden, the unconditional CTAs still show. → `cta-conditions.test.ts` (Task 12).

Deep links (`?step=finalize` on a fresh tab) land on the first incomplete step. → `navigation.test.ts` (Task 7).

---

### Task 1: Commit the design-system socle

The funnel opts into direction B through `data-direction-b`. The tokens that make that work are uncommitted, mixed with home-B content work. This task commits only the socle.

**Files:**
- Commit: `src/app/globals.css`, `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`
- Leave uncommitted: everything else in `git status` (home-B components, `src/app/[lang]/page.tsx`, `docs/home-direction-b-contenu.md`, `input/`, `src/lib/blog-excerpt.ts`, `docs/operations/partner-invoicing-rollout.md`)

**Interfaces:**
- Produces: CSS custom properties `--control-h-sm|md|lg`, `--control-radius`, `--field-h`, `--field-radius`, `--badge-h`, `--badge-radius`, `--tone-*`, with `:root` defaults equal to today's sizes and direction-B values under `html:has([data-direction-b])`.

- [ ] **Step 1: Ask Yoan for the go.** This commits his in-progress work. Show him the file list above and wait for an explicit yes.

- [ ] **Step 2: Check that `globals.css` does not depend on uncommitted files**

Run: `git diff src/app/globals.css | grep -n -E "^\+.*(HeroBackdrop|blog-excerpt|@import)"`
Expected: no output. CSS selectors for home-B classes are harmless without their components; an `@import` of an uncommitted file is not.

- [ ] **Step 3: Stage the socle and verify it alone**

```bash
git add src/app/globals.css src/components/ui/button.tsx src/components/ui/badge.tsx src/components/ui/input.tsx src/components/ui/textarea.tsx
git stash push --keep-index --include-untracked -m "home-b wip"
npm run lint && npm test && npm run build
git stash pop
```

Expected: lint, tests and build pass on the staged socle alone, then `git stash pop` restores the home-B work exactly (`git status` shows the same files as before Step 1, minus the five staged ones). Ignored files such as `.env.local` are not touched by the stash. If the build fails, `git stash pop` first, then report to Yoan: the socle depends on something uncommitted.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(ds): jetons de taille et de ton, valeurs direction B sous data-direction-b

Les primitives ui/ lisent des variables dont les valeurs par défaut sont les
tailles actuelles : aucun changement visuel hors direction B.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Product registry knows the battery funnel

**Files:**
- Modify: `src/lib/products.ts`
- Test: `src/lib/products.test.ts`

**Interfaces:**
- Produces:
  - `PRODUCTS = ["ecp", "battery"] as const`, `type Product = "ecp" | "battery"`
  - `FUNNEL_ROUTES: { readonly quote: "ecp"; readonly "quote-battery": "battery" }`
  - `type FunnelRouteId = keyof typeof FUNNEL_ROUTES`
  - `isFunnelRoute(routeId: string): routeId is FunnelRouteId`
  - `funnelRouteFor(product: Product): FunnelRouteId`
  - `successPageIds(product: Product): string[]` — most specific first
  - `viewPageIds(product: Product): string[]` — most specific first

- [ ] **Step 1: Write the failing tests** — replace the content of `src/lib/products.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PRODUCTS,
  DEFAULT_PRODUCT,
  normalizeProduct,
  isProduct,
  FUNNEL_ROUTES,
  isFunnelRoute,
  funnelRouteFor,
  successPageIds,
  viewPageIds,
} from "./products";

describe("products", () => {
  it("declares ecp as the default product and battery as the second", () => {
    expect(DEFAULT_PRODUCT).toBe("ecp");
    expect(PRODUCTS).toEqual(["ecp", "battery"]);
  });

  it("normalizeProduct passes through valid keys", () => {
    expect(normalizeProduct("ecp")).toBe("ecp");
    expect(normalizeProduct("battery")).toBe("battery");
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
    expect(isProduct("battery")).toBe(true);
    expect(isProduct("ECP")).toBe(false);
    expect(isProduct("")).toBe(false);
  });
});

describe("funnel routes", () => {
  it("maps each funnel page to its product", () => {
    expect(FUNNEL_ROUTES.quote).toBe("ecp");
    expect(FUNNEL_ROUTES["quote-battery"]).toBe("battery");
  });

  it("recognises funnel pages and nothing else", () => {
    expect(isFunnelRoute("quote")).toBe(true);
    expect(isFunnelRoute("quote-battery")).toBe(true);
    expect(isFunnelRoute("contact")).toBe(false);
    expect(isFunnelRoute("toString")).toBe(false);
  });

  it("finds the funnel page of a product", () => {
    expect(funnelRouteFor("ecp")).toBe("quote");
    expect(funnelRouteFor("battery")).toBe("quote-battery");
  });

  it("lists success and view pages most specific first, charger last", () => {
    expect(successPageIds("ecp")).toEqual(["quote-success"]);
    expect(successPageIds("battery")).toEqual(["quote-battery-success", "quote-success"]);
    expect(viewPageIds("ecp")).toEqual(["quote-view"]);
    expect(viewPageIds("battery")).toEqual(["quote-battery-view", "quote-view"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/products.test.ts`
Expected: FAIL — `FUNNEL_ROUTES` is not exported.

- [ ] **Step 3: Implement** — in `src/lib/products.ts`, replace the header comment's checklist and the `PRODUCTS` line, and append the funnel helpers:

```ts
// Single source of truth for quote-form product keys. A product is a
// distinct lead vertical (own quote funnel, own partner pricing column in
// pricing_policy.settings.prices[product][category], own Google Ads
// conversion actions). Adding one:
//   1. Append the key to PRODUCTS and its Directus page to FUNNEL_ROUTES.
//   2. Register its ProductFunnel in src/components/quote-shell/funnels.ts
//      and its categories in src/lib/dispatch/categorize.ts.
//   3. Add global_config.google_ads.conversions.<key> in Directus.
//   4. Add the product's price column to partner pricing policies.
//   5. Map the product to its Ads conversion action in the Make scenario
//      (module "events:ingest", productDestinationId — see
//      docs/operations/partner-dispatch.md).
export const PRODUCTS = ["ecp", "battery"] as const;
```

Append at the end of the file:

```ts
/** Directus page route_id → product of the quote funnel that page hosts. */
export const FUNNEL_ROUTES = {
  quote: "ecp",
  "quote-battery": "battery",
} as const satisfies Record<string, Product>;

export type FunnelRouteId = keyof typeof FUNNEL_ROUTES;

export function isFunnelRoute(routeId: string): routeId is FunnelRouteId {
  return Object.prototype.hasOwnProperty.call(FUNNEL_ROUTES, routeId);
}

export function funnelRouteFor(product: Product): FunnelRouteId {
  const entry = (Object.entries(FUNNEL_ROUTES) as [FunnelRouteId, Product][])
    .find(([, p]) => p === product);
  if (!entry) throw new Error(`No funnel route for product "${product}"`);
  return entry[0];
}

/**
 * Directus pages holding the success-page copy for a product, most specific
 * first. The charger page is the fallback, so a new product only translates
 * what differs.
 */
export function successPageIds(product: Product): string[] {
  return product === "ecp"
    ? ["quote-success"]
    : [`${funnelRouteFor(product)}-success`, "quote-success"];
}

/** Same as successPageIds, for the submission view page. */
export function viewPageIds(product: Product): string[] {
  return product === "ecp"
    ? ["quote-view"]
    : [`${funnelRouteFor(product)}-view`, "quote-view"];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/products.test.ts && npx tsc --noEmit -p .`
Expected: PASS, and no type errors (adding `"battery"` widens `Product`; `googleAds.ts` types `conversions` as `Partial<Record<Product, …>>`, which still compiles).

- [ ] **Step 5: Commit**

```bash
git add src/lib/products.ts src/lib/products.test.ts
git commit -m "feat(products): produit battery et table des pages de funnel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Battery lead categories

**Files:**
- Modify: `src/lib/dispatch/types.ts` (the `LeadCategory` union and `LEAD_CATEGORIES`)
- Modify: `src/lib/dispatch/categorize.ts`
- Modify: `src/lib/dispatch/manual-dispatch.ts:67`
- Modify: `src/app/api/quote/route.ts` (call site only; behaviour change is Task 6)
- Test: `src/lib/dispatch/categorize.test.ts` (create)

**Interfaces:**
- Consumes: `Product` from Task 2.
- Produces:
  - `LeadCategory` gains `"owner_pv_small" | "owner_pv_large" | "co_owner_pv_small" | "co_owner_pv_large" | "no_pv"`
  - `PV_LARGE_THRESHOLD_KWC = 10`
  - `deriveLeadCategory(product: Product, data: Record<string, unknown>): LeadCategory`
  - `isDispatchable(category: LeadCategory): boolean`

- [ ] **Step 1: Write the failing tests** — create `src/lib/dispatch/categorize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveLeadCategory, isDispatchable, PV_LARGE_THRESHOLD_KWC } from "./categorize";
import { LEAD_CATEGORIES } from "./types";

describe("deriveLeadCategory — ecp (unchanged)", () => {
  it("keeps the six charger categories", () => {
    expect(deriveLeadCategory("ecp", { housingStatus: "owner", solarEquipment: "exists" })).toBe("owner_solar");
    expect(deriveLeadCategory("ecp", { housingStatus: "owner", solarEquipment: "none" })).toBe("owner_no_solar");
    expect(deriveLeadCategory("ecp", { housingStatus: "co-owner", solarEquipment: "in-progress" })).toBe("co_owner_solar");
    expect(deriveLeadCategory("ecp", { housingStatus: "co-owner", solarEquipment: "" })).toBe("co_owner_no_solar");
    expect(deriveLeadCategory("ecp", { housingStatus: "tenant", solarEquipment: "exists" })).toBe("tenant_solar");
    expect(deriveLeadCategory("ecp", {})).toBe("tenant_no_solar");
  });
});

describe("deriveLeadCategory — battery", () => {
  const owner = (extra: Record<string, unknown>) => ({ housingStatus: "owner", solarEquipment: "exists", ...extra });

  it("puts the threshold itself in the large category", () => {
    expect(PV_LARGE_THRESHOLD_KWC).toBe(10);
    expect(deriveLeadCategory("battery", owner({ pvPower: 10 }))).toBe("owner_pv_large");
    expect(deriveLeadCategory("battery", owner({ pvPower: 9.9 }))).toBe("owner_pv_small");
  });

  it("splits co-owners the same way", () => {
    expect(deriveLeadCategory("battery", { housingStatus: "co-owner", solarEquipment: "exists", pvPower: 25 })).toBe("co_owner_pv_large");
    expect(deriveLeadCategory("battery", { housingStatus: "co-owner", solarEquipment: "exists", pvPower: 4 })).toBe("co_owner_pv_small");
  });

  it("counts an unknown size as small, never charging the partner for a size we do not have", () => {
    expect(deriveLeadCategory("battery", owner({ pvPower: "na" }))).toBe("owner_pv_small");
    expect(deriveLeadCategory("battery", owner({}))).toBe("owner_pv_small");
    expect(deriveLeadCategory("battery", owner({ pvPower: null }))).toBe("owner_pv_small");
    expect(deriveLeadCategory("battery", owner({ pvPower: "abc" }))).toBe("owner_pv_small");
  });

  it("accepts a numeric string, in case a client sends one", () => {
    expect(deriveLeadCategory("battery", owner({ pvPower: "12.5" }))).toBe("owner_pv_large");
  });

  it("treats an installation being built as an installation", () => {
    expect(deriveLeadCategory("battery", owner({ solarEquipment: "in-progress", pvPower: 15 }))).toBe("owner_pv_large");
  });

  it("follows the last solar answer, whatever PV size is still in the data", () => {
    // Review Focus 1: the visitor filled the PV step, then switched to "none".
    expect(deriveLeadCategory("battery", owner({ solarEquipment: "none", pvPower: 25 }))).toBe("no_pv");
    expect(deriveLeadCategory("battery", owner({ solarEquipment: "", pvPower: 25 }))).toBe("no_pv");
  });

  it("files tenants as no_pv defensively (the funnel exits them before submission)", () => {
    expect(deriveLeadCategory("battery", { housingStatus: "tenant", solarEquipment: "exists", pvPower: 25 })).toBe("no_pv");
  });
});

describe("isDispatchable", () => {
  it("excludes only no_pv", () => {
    expect(isDispatchable("no_pv")).toBe(false);
    for (const c of LEAD_CATEGORIES.filter((c) => c !== "no_pv")) expect(isDispatchable(c)).toBe(true);
  });

  it("lists every battery category in the runtime array as well as the type", () => {
    for (const c of ["owner_pv_small", "owner_pv_large", "co_owner_pv_small", "co_owner_pv_large", "no_pv"]) {
      expect(LEAD_CATEGORIES).toContain(c);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dispatch/categorize.test.ts`
Expected: FAIL — `isDispatchable` / `PV_LARGE_THRESHOLD_KWC` not exported.

- [ ] **Step 3: Extend the category type** — in `src/lib/dispatch/types.ts`, replace the `LeadCategory` union and `LEAD_CATEGORIES`:

```ts
export type LeadCategory =
  // ecp (charger)
  | "owner_no_solar"
  | "owner_solar"
  | "co_owner_no_solar"
  | "co_owner_solar"
  | "tenant_no_solar"
  | "tenant_solar"
  // battery
  | "owner_pv_small"
  | "owner_pv_large"
  | "co_owner_pv_small"
  | "co_owner_pv_large"
  /** Battery visitor without PV: stored, never dispatched nor invoiced. */
  | "no_pv";
```

```ts
export const LEAD_CATEGORIES: LeadCategory[] = [
  "owner_no_solar",
  "owner_solar",
  "co_owner_no_solar",
  "co_owner_solar",
  "tenant_no_solar",
  "tenant_solar",
  "owner_pv_small",
  "owner_pv_large",
  "co_owner_pv_small",
  "co_owner_pv_large",
  "no_pv",
];
```

- [ ] **Step 4: Implement the per-product derivation** — replace the content of `src/lib/dispatch/categorize.ts`:

```ts
import type { LeadCategory } from "./types";
import type { Product } from "@/lib/products";

/** PV size from which a battery lead is "large" (inclusive), in kWc. */
export const PV_LARGE_THRESHOLD_KWC = 10;

const NON_DISPATCHABLE: ReadonlySet<LeadCategory> = new Set(["no_pv"]);

/** Derive the lead pricing category from quote form data, per product. */
export function deriveLeadCategory(product: Product, data: Record<string, unknown>): LeadCategory {
  return product === "battery" ? deriveBatteryCategory(data) : deriveEcpCategory(data);
}

/** False for categories that are stored but never sent to a partner. */
export function isDispatchable(category: LeadCategory): boolean {
  return !NON_DISPATCHABLE.has(category);
}

/**
 * Charger funnel. Field names match src/components/quote/QuoteForm.tsx:
 *   - housingStatus: "owner" | "co-owner" | "tenant"
 *   - solarEquipment: "exists" | "in-progress" | "none" | ""
 *
 * Co-owners are a distinct category: same housing pattern as owners but
 * different install logistics (syndicate approval, shared decisions) so
 * the price typically differs. "in-progress" solar counts as having solar
 * (system will exist by the time the EV charger is installed).
 */
function deriveEcpCategory(data: Record<string, unknown>): LeadCategory {
  const housingStatus = String(data.housingStatus ?? "").toLowerCase();
  const solarEquipment = String(data.solarEquipment ?? "").toLowerCase();

  const hasSolar = solarEquipment === "exists" || solarEquipment === "in-progress";

  if (housingStatus === "co-owner") {
    return hasSolar ? "co_owner_solar" : "co_owner_no_solar";
  }
  if (housingStatus === "owner") {
    return hasSolar ? "owner_solar" : "owner_no_solar";
  }
  return hasSolar ? "tenant_solar" : "tenant_no_solar";
}

/**
 * Battery funnel. Housing status × PV size. A PV size we do not know
 * ("na", missing, unparseable) counts as small: the partner is never charged
 * the large-lead price on a guess.
 */
function deriveBatteryCategory(data: Record<string, unknown>): LeadCategory {
  const solar = String(data.solarEquipment ?? "").toLowerCase();
  if (solar !== "exists" && solar !== "in-progress") return "no_pv";

  const housing = String(data.housingStatus ?? "").toLowerCase();
  if (housing !== "owner" && housing !== "co-owner") return "no_pv";

  const size = pvSizeKwc(data.pvPower) >= PV_LARGE_THRESHOLD_KWC ? "large" : "small";
  return housing === "owner" ? `owner_pv_${size}` : `co_owner_pv_${size}`;
}

/** kWc as a number, or NaN when unknown. */
export function pvSizeKwc(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw !== "na" && raw.trim() !== "") return Number(raw);
  return Number.NaN;
}
```

- [ ] **Step 5: Update the two callers**

In `src/lib/dispatch/manual-dispatch.ts`, line 67 (after `const product = normalizeProduct(submission.product);` on line 64):

```ts
  const leadCategory = deriveLeadCategory(product, data);
```

In `src/app/api/quote/route.ts`, replace `const leadCategory = deriveLeadCategory(quoteData);` with:

```ts
    const leadCategory = deriveLeadCategory(product, quoteData);
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run src/lib/dispatch && npx tsc --noEmit -p .`
Expected: PASS, no type errors. If `tsc` reports an exhaustive `switch`/`Record<LeadCategory, …>` elsewhere, add the five keys there with the same shape as their charger siblings and mention it in the commit body.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dispatch/types.ts src/lib/dispatch/categorize.ts src/lib/dispatch/categorize.test.ts src/lib/dispatch/manual-dispatch.ts src/app/api/quote/route.ts
git commit -m "feat(dispatch): catégories de lead batterie (statut × taille PV, no_pv non dispatchable)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lead scoring per product

**Files:**
- Modify: `src/lib/dispatch/scoring.ts`
- Modify (callers pass the product): `src/components/partners/Kanban.tsx:63-64`, `src/components/partners/LeadCard.tsx:237`, `src/lib/partner-facets.ts:40,85`, `src/lib/dispatch/stats.ts:47,127,353,397`
- Test: `src/lib/dispatch/scoring.test.ts` (append)

**Interfaces:**
- Consumes: `PV_LARGE_THRESHOLD_KWC`, `pvSizeKwc` from Task 3; `normalizeProduct` from Task 2.
- Produces:
  - `SCORING_FACTOR_KEYS` = `["ownership","authorization","urgency","volume","solar_upsell","pv_size","load"]`
  - `DEFAULT_SCORING_WEIGHTS` adds `pv_size: 0.15`, `load: 0.2`
  - `scoreLead(data, weights, bands = SCORE_BANDS, product: string | null = "ecp"): LeadScore`

- [ ] **Step 1: Write the failing tests** — append to `src/lib/dispatch/scoring.test.ts`:

```ts
describe("battery scoring", () => {
  const battery = (overrides: Record<string, unknown> = {}) => ({
    housingStatus: "owner",
    deadline: "asap",
    solarEquipment: "exists",
    pvPower: 15,
    evCount: 3,
    heatPump: "no",
    ...overrides,
  });
  const sub = (s: ReturnType<typeof scoreLead>, key: string) => s.breakdown.find((b) => b.key === key)?.subScore;

  it("scores a large-PV owner with 3+ EVs at full marks", () => {
    expect(scoreLead(battery(), W, SCORE_BANDS, "battery").score).toBe(100);
  });

  it("never uses the charger factors for a battery lead", () => {
    const s = scoreLead(battery({ parkingSpotCount: "2" }), W, SCORE_BANDS, "battery");
    expect(s.breakdown.some((b) => b.key === "volume" || b.key === "solar_upsell")).toBe(false);
  });

  it("never uses the battery factors for a charger lead", () => {
    const s = scoreLead({ housingStatus: "owner", deadline: "asap", parkingSpotCount: "1", solarEquipment: "none", pvPower: 15, evCount: 3 }, W);
    expect(s.breakdown.some((b) => b.key === "pv_size" || b.key === "load")).toBe(false);
    expect(s.score).toBe(100);
  });

  it("scores PV size 1 from the threshold, 0.6 below or unknown", () => {
    expect(sub(scoreLead(battery({ pvPower: 10 }), W, SCORE_BANDS, "battery"), "pv_size")).toBe(1);
    expect(sub(scoreLead(battery({ pvPower: 8 }), W, SCORE_BANDS, "battery"), "pv_size")).toBe(0.6);
    expect(sub(scoreLead(battery({ pvPower: "na" }), W, SCORE_BANDS, "battery"), "pv_size")).toBe(0.6);
  });

  it("drops PV size when the field is absent", () => {
    const s = scoreLead(battery({ pvPower: undefined }), W, SCORE_BANDS, "battery");
    expect(s.breakdown.some((b) => b.key === "pv_size")).toBe(false);
  });

  it("grades the load: 3+ EVs, then 1–2 EVs or a heat pump, then EV planned, then nothing", () => {
    const load = (o: Record<string, unknown>) => sub(scoreLead(battery(o), W, SCORE_BANDS, "battery"), "load");
    expect(load({ evCount: 3 })).toBe(1);
    expect(load({ evCount: 1 })).toBe(0.8);
    expect(load({ evCount: 0, heatPump: "yes" })).toBe(0.8);
    expect(load({ evCount: 0, heatPump: "no", evPlanned: "yes" })).toBe(0.5);
    expect(load({ evCount: 0, heatPump: "no", evPlanned: "no" })).toBe(0.3);
    expect(load({ evCount: undefined, heatPump: undefined, evPlanned: undefined })).toBeUndefined();
  });

  it("treats an unknown product string as the charger", () => {
    const s = scoreLead(battery(), W, SCORE_BANDS, "solar");
    expect(s.breakdown.some((b) => b.key === "pv_size")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dispatch/scoring.test.ts`
Expected: FAIL — the battery tests find no `pv_size` / `load` factor.

- [ ] **Step 3: Implement** — in `src/lib/dispatch/scoring.ts`:

Add imports at the top of the file (below the header comment):

```ts
import { normalizeProduct, type Product } from "@/lib/products";
import { PV_LARGE_THRESHOLD_KWC, pvSizeKwc } from "./categorize";
```

Replace `SCORING_FACTOR_KEYS` and `DEFAULT_SCORING_WEIGHTS`:

```ts
export const SCORING_FACTOR_KEYS = [
  "ownership",
  "authorization",
  "urgency",
  // ecp only
  "volume",
  "solar_upsell",
  // battery only
  "pv_size",
  "load",
] as const;

export type ScoringFactorKey = (typeof SCORING_FACTOR_KEYS)[number];

/**
 * One weight table for every product. A factor that does not apply to a
 * product returns a null sub-score and drops out of numerator and denominator,
 * so charger scores are unchanged by the battery weights and vice versa.
 */
export const DEFAULT_SCORING_WEIGHTS: Record<ScoringFactorKey, number> = {
  ownership: 0.2,
  authorization: 0.2,
  urgency: 0.25,
  volume: 0.2,
  solar_upsell: 0.15,
  pv_size: 0.15,
  load: 0.2,
};
```

Change the `subScores` signature to `function subScores(data: Record<string, unknown>, product: Product): Record<ScoringFactorKey, number | null> {`, keep the `ownership`, `authorization` and `urgency` computations as they are, and replace the `volume`/`solar_upsell` part and the return with:

```ts
  const isBattery = product === "battery";

  // One charger is the normal case (87% of real submissions) and is already
  // worth having, so it scores full marks rather than being penalised. Two or
  // more is a bonus above full — hence a sub-score over 1, which is why the
  // final score is clamped.
  const volume = isBattery
    ? null
    : parking === "1" ? 1 : parking === "2" || parking === "3+" ? 1.5 : null;

  // No solar yet = biggest upsell opportunity.
  const solar_upsell = isBattery
    ? null
    : solar === "none"
      ? 1
      : solar === "in-progress"
        ? 0.5
        : solar === "exists"
          ? 0.2
          : null;

  const pv_size = isBattery ? pvSizeScore(data.pvPower) : null;
  const load = isBattery ? loadScore(data) : null;

  return { ownership, authorization, urgency, volume, solar_upsell, pv_size, load };
}

/** Large installation = full marks; small or unknown size = 0.6; absent = null. */
function pvSizeScore(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  return pvSizeKwc(raw) >= PV_LARGE_THRESHOLD_KWC ? 1 : 0.6;
}

/** Evening/night demand a battery can serve: EVs first, then a heat pump. */
function loadScore(data: Record<string, unknown>): number | null {
  const ev = typeof data.evCount === "number" ? data.evCount : null;
  const heat = str(data.heatPump);
  const planned = str(data.evPlanned);
  if (ev === null && heat === null && planned === null) return null;
  if (ev !== null && ev >= 3) return 1;
  if ((ev !== null && ev >= 1) || heat === "yes") return 0.8;
  if (planned === "yes") return 0.5;
  return 0.3;
}
```

Change `scoreLead`:

```ts
export function scoreLead(
  data: Record<string, unknown> | null | undefined,
  weights: Record<ScoringFactorKey, number>,
  bands: ScoreBands = SCORE_BANDS,
  product: string | null = "ecp",
): LeadScore {
  const subs = subScores(data ?? {}, normalizeProduct(product));
```

(the rest of `scoreLead` is unchanged).

- [ ] **Step 4: Pass the product at every call site.** Each card already carries `product` (`PartnerDispatchCard.product: string | null`).

`src/components/partners/Kanban.tsx` (inside `case "score":`):

```ts
        scoreLead(b.submission?.data, weights, undefined, b.product).score -
          scoreLead(a.submission?.data, weights, undefined, a.product).score ||
```

`src/components/partners/LeadCard.tsx`:

```ts
      ? scoreLead(submissionData, scoringWeights, scoreBands, dispatch.product)
```

`src/lib/partner-facets.ts`, both calls:

```ts
    score.add(scoreLead(data, scoringWeights, scoreBands, d.product).band);
```
```ts
    const band = scoreLead(data, scoringWeights, scoreBands, d.product).band;
```

`src/lib/dispatch/stats.ts`, the four calls become `scoreLead(c.submission?.data, weights, bands, c.product)` (keep `.score` / `.band` as they are).

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/lib/dispatch src/lib/partner-facets* && npx tsc --noEmit -p .`
Expected: PASS — including every pre-existing charger scoring test, unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dispatch/scoring.ts src/lib/dispatch/scoring.test.ts src/components/partners/Kanban.tsx src/components/partners/LeadCard.tsx src/lib/partner-facets.ts src/lib/dispatch/stats.ts
git commit -m "feat(scoring): facteurs par produit — taille PV et charge pour la batterie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Dispatch dedup scoped to the product

**Files:**
- Modify: `src/lib/dispatch/queries.ts` (`findRecentDispatchesByEmail`)
- Modify: `src/lib/dispatch/index.ts` (the call inside `runDispatch`)
- Test: `src/lib/dispatch/dedup.test.ts` (create)

**Interfaces:**
- Produces: `findRecentDispatchesByEmail(email: string, candidatePartnerIds: string[], environment: Environment, dedupWindowDays: number, product: string): Promise<Set<string>>`

- [ ] **Step 1: Write the failing test** — create `src/lib/dispatch/dedup.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async () => ({ data: [{ partner: "p1" }] })),
}));

afterEach(() => vi.clearAllMocks());

describe("findRecentDispatchesByEmail", () => {
  it("only looks at earlier leads of the same product", async () => {
    const { directusFetch } = await import("@/lib/directus");
    const { findRecentDispatchesByEmail } = await import("./queries");

    await findRecentDispatchesByEmail("a@b.ch", ["p1", "p2"], "production", 30, "battery");

    const url = decodeURIComponent(String(vi.mocked(directusFetch).mock.calls[0][0]));
    expect(url).toContain("filter[product][_eq]=battery");
    expect(url).toContain("filter[submission][user][email][_eq]=a@b.ch");
  });

  it("returns the partners that already received this product's lead", async () => {
    const { findRecentDispatchesByEmail } = await import("./queries");
    const out = await findRecentDispatchesByEmail("a@b.ch", ["p1"], "production", 30, "ecp");
    expect([...out]).toEqual(["p1"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/dispatch/dedup.test.ts`
Expected: FAIL — the URL has no product filter.

- [ ] **Step 3: Implement** — in `src/lib/dispatch/queries.ts`, add the parameter and the filter:

```ts
export async function findRecentDispatchesByEmail(
  email: string,
  candidatePartnerIds: string[],
  environment: Environment,
  dedupWindowDays: number,
  product: string,
): Promise<Set<string>> {
```

and after `params.set("filter[environment][_eq]", environment);`:

```ts
  // Per product: a visitor who asks for a charger, then a battery, is two
  // projects for a partner who does both — not a duplicate.
  params.set("filter[product][_eq]", product);
```

Update the doc comment above the function: replace "Return the set of partner IDs that have received a dispatch" with "Return the set of partner IDs that have received a dispatch of the same product".

In `src/lib/dispatch/index.ts`, the call inside `runDispatch` gains the product (already in scope as `product`):

```ts
        ? findRecentDispatchesByEmail(
            input.email,
            partnerIds,
            environment,
            config.billing.dedup_window_days,
            product,
          )
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/lib/dispatch && npx tsc --noEmit -p .`
Expected: PASS. `tsc` lists any other caller of `findRecentDispatchesByEmail`; give each the product it already has in scope.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dispatch/queries.ts src/lib/dispatch/index.ts src/lib/dispatch/dedup.test.ts
git commit -m "fix(dispatch): dédoublonnage par produit — borne puis batterie ne s'excluent plus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `/api/quote` skips dispatch for non-dispatchable leads

**Files:**
- Modify: `src/lib/dispatch/index.ts` (add `notDispatchableResult`)
- Modify: `src/app/api/quote/route.ts`
- Test: `src/app/api/quote/route.test.ts` (create)

**Interfaces:**
- Consumes: `deriveLeadCategory`, `isDispatchable` (Task 3).
- Produces:
  - `notDispatchableResult(rawCanton: string | null): DispatchResult` exported from `@/lib/dispatch`
  - `POST /api/quote` response: `{ success: true, submissionId: string, dispatchable: boolean }`

- [ ] **Step 1: Write the failing tests** — create `src/app/api/quote/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  runDispatch: vi.fn(),
  buildPayload: vi.fn((x: unknown) => x),
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => { void fn(); },
}));
vi.mock("@/lib/directus-storage", () => ({
  storage: {
    createOrGetFormSession: vi.fn(async () => ({ id: "s1", session_token: "tok" })),
    createOrUpdateFormUser: vi.fn(async () => ({ id: "u1" })),
    createFormSubmission: vi.fn(async () => ({ id: "sub1" })),
  },
}));
vi.mock("@/lib/posthog-server", () => ({
  getPostHogServer: () => ({ capture: h.capture, identify: vi.fn(), flush: vi.fn(), captureException: vi.fn() }),
  serverLog: vi.fn(),
}));
vi.mock("@/lib/dispatch", async (orig) => ({
  ...(await orig<typeof import("@/lib/dispatch")>()),
  runDispatch: h.runDispatch,
}));
vi.mock("@/lib/dispatch/webhook", () => ({
  getQuoteWebhookUrl: vi.fn(async () => "https://hook.example"),
  parsePhone: vi.fn(() => null),
  buildQuoteWebhookPayload: h.buildPayload,
  fireQuoteWebhook: vi.fn(async () => {}),
}));

const DISPATCHED = {
  mode: "live", canton: "VD", isTest: false, billableRate: 1,
  summary: { resolved: 1, dispatched: 1, skipped: 0, skippedDedup: 0, reasons: [] },
  dedup: { skippedPartnerSlugs: [], windowDays: 30 },
  targets: [],
};

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import("./route");
  return POST(new Request("http://localhost/api/quote", {
    method: "POST",
    headers: { "content-type": "application/json", referer: "http://localhost/fr/devis-batterie-solaire" },
    body: JSON.stringify({ firstName: "Ana", lastName: "Test", email: "ana@example.ch", lang: "fr", canton: "VD", ...body }),
  }));
};

afterEach(() => vi.clearAllMocks());

describe("POST /api/quote — battery", () => {
  it("does not dispatch a visitor without PV, and says so", async () => {
    const res = await post({ product: "battery", housingStatus: "owner", solarEquipment: "none" });
    const json = await res.json();

    expect(json).toEqual({ success: true, submissionId: "sub1", dispatchable: false });
    expect(h.runDispatch).not.toHaveBeenCalled();

    const payload = h.buildPayload.mock.calls[0][0] as { submission: { leadCategory: string }; dispatch: { targets: unknown[]; summary: { reasons: string[] } } };
    expect(payload.submission.leadCategory).toBe("no_pv");
    expect(payload.dispatch.targets).toEqual([]);
    expect(payload.dispatch.summary.reasons).toEqual(["not_dispatchable"]);

    expect(h.capture).toHaveBeenCalledWith(expect.objectContaining({ event: "dispatch_not_dispatchable" }));
  });

  it("dispatches a large-PV owner with the battery category and product", async () => {
    h.runDispatch.mockResolvedValueOnce(DISPATCHED);
    const res = await post({ product: "battery", housingStatus: "owner", solarEquipment: "exists", pvPower: 15 });

    expect((await res.json()).dispatchable).toBe(true);
    expect(h.runDispatch).toHaveBeenCalledWith(expect.objectContaining({ leadCategory: "owner_pv_large", product: "battery" }));
  });
});

describe("POST /api/quote — charger unchanged", () => {
  it("dispatches with the charger category", async () => {
    h.runDispatch.mockResolvedValueOnce(DISPATCHED);
    const res = await post({ product: "ecp", housingStatus: "owner", solarEquipment: "exists" });

    expect((await res.json()).dispatchable).toBe(true);
    expect(h.runDispatch).toHaveBeenCalledWith(expect.objectContaining({ leadCategory: "owner_solar", product: "ecp" }));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/quote/route.test.ts`
Expected: FAIL — `runDispatch` is called for `no_pv`, and the response has no `dispatchable`.

- [ ] **Step 3: Add `notDispatchableResult`** — append to `src/lib/dispatch/index.ts` (it reuses `getDispatchMode`, `getEnvironment` and `normalizeCanton`, already used by `runDispatch` in this file):

```ts
/**
 * Dispatch block for a lead that is stored but never sent to a partner
 * (battery visitor without PV). No ledger row: `partner_dispatches.partner`
 * is required, and leads without a partner are tracked in PostHog only, like
 * coverage gaps. Make still receives the block, so the visitor confirmation
 * e-mail goes out and no partner e-mail fires.
 */
export function notDispatchableResult(rawCanton: string | null): DispatchResult {
  return {
    mode: getDispatchMode(),
    canton: normalizeCanton(rawCanton) ?? "",
    isTest: getEnvironment() !== "production",
    billableRate: null,
    summary: { resolved: 0, dispatched: 0, skipped: 0, skippedDedup: 0, reasons: ["not_dispatchable"] },
    dedup: { skippedPartnerSlugs: [], windowDays: 0 },
    targets: [],
  };
}
```

- [ ] **Step 4: Use it in the route** — in `src/app/api/quote/route.ts`:

Change the imports:

```ts
import { runDispatch, normalizeCanton, notDispatchableResult, type DispatchResult } from "@/lib/dispatch";
import { deriveLeadCategory, isDispatchable } from "@/lib/dispatch/categorize";
```

Replace the block from `const leadCategory = deriveLeadCategory(product, quoteData);` through the end of the `runDispatch({ … });` call with:

```ts
    const leadCategory = deriveLeadCategory(product, quoteData);
    const dispatchable = isDispatchable(leadCategory);
    const rawCanton = normalizedCanton ?? (typeof quoteData.canton === "string" ? quoteData.canton : null);

    let dispatchResult: DispatchResult;
    if (dispatchable) {
      dispatchResult = await runDispatch({
        submissionId: submission.id,
        rawCanton,
        email,
        locale: (lang === "de" ? "de" : "fr"),
        leadCategory,
        product,
      });
    } else {
      dispatchResult = notDispatchableResult(rawCanton);
      try {
        const posthog = getPostHogServer();
        posthog.capture({
          distinctId: phIds.phDistinctId ?? "anonymous",
          event: "dispatch_not_dispatchable",
          properties: { product, lead_category: leadCategory, submission_id: submission.id, canton: dispatchResult.canton },
        });
        after(() => posthog.flush());
      } catch { /* analytics never blocks a submission */ }
    }
```

Replace the success response:

```ts
    return NextResponse.json({ success: true, submissionId: submission.id, dispatchable });
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/app/api/quote && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dispatch/index.ts src/app/api/quote/route.ts src/app/api/quote/route.test.ts
git commit -m "feat(quote): lead batterie sans PV enregistré mais jamais dispatché

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Shell building blocks (pure)

**Files:**
- Create: `src/components/quote-shell/dictionary.ts`, `src/components/quote-shell/navigation.ts`, `src/components/quote-shell/pageConfig.ts`
- Modify: `src/lib/quoteDraft.ts` (add `quoteDraftKey`)
- Modify: `src/components/quote/RangeButtonGroup.tsx` (add `allowNa`)
- Test: `src/components/quote-shell/dictionary.test.ts`, `src/components/quote-shell/navigation.test.ts`, `src/components/quote-shell/pageConfig.test.ts` (create), `src/lib/quoteDraft.test.ts` (append)

**Interfaces:**
- Produces:
  - `makeShellT(dictionary: Record<string, string>, pageIds: string[]): { tq: (key: string, vars?: Record<string, string | number>) => string; tqOpt: (key: string) => string | undefined }`
  - `WELCOME = "welcome"`, `CONTACT = "contact"`, `FINALIZE = "finalize"`
  - `stepSequence(steps: { id: string; skip?: (data: Record<string, unknown>) => boolean }[], data: Record<string, unknown>): string[]`
  - `clampToFirstIncomplete(seq: string[], requested: string | null, missing: (stepId: string) => string | null): string`
  - `fieldConfig(pageConfig: Record<string, unknown>, stepId: string, key: string): Record<string, unknown>`
  - `stepConfig(pageConfig: Record<string, unknown>, stepId: string): Record<string, unknown>`
  - `tooltipImageUrl(pageConfig: Record<string, unknown>, stepId: string, key: string): string | undefined`
  - `quoteDraftKey(product: string): string`
  - `RangeButtonGroup` prop `allowNa?: boolean` (default `true`)

- [ ] **Step 1: Write the failing tests**

Create `src/components/quote-shell/dictionary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeShellT } from "./dictionary";

const dict = {
  "pages.quote-battery.welcome.title": "Votre batterie",
  "pages.quote.welcome.title": "Votre borne",
  "pages.quote.navigation.next": "Continuer",
  "pages.quote-battery.welcome.subtitle": "Réponse en {first_contact} h",
  "pages.quote-battery.broken": "[pages.quote-battery.broken]",
};

describe("makeShellT", () => {
  const { tq, tqOpt } = makeShellT(dict, ["quote-battery", "quote"]);

  it("prefers the product page, then falls back to the charger page", () => {
    expect(tq("welcome.title")).toBe("Votre batterie");
    expect(tq("navigation.next")).toBe("Continuer");
  });

  it("interpolates variables", () => {
    expect(tq("welcome.subtitle", { first_contact: 48 })).toBe("Réponse en 48 h");
  });

  it("returns the full key when nothing is translated, like t()", () => {
    expect(tq("missing.key")).toBe("pages.quote-battery.missing.key");
  });

  it("treats bracket placeholders as missing", () => {
    expect(tqOpt("broken")).toBeUndefined();
    expect(tqOpt("missing.key")).toBeUndefined();
  });
});
```

Create `src/components/quote-shell/navigation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CONTACT, FINALIZE, WELCOME, clampToFirstIncomplete, stepSequence } from "./navigation";

const steps = [
  { id: "housing" },
  { id: "pv", skip: (d: Record<string, unknown>) => d.solarEquipment === "none" },
  { id: "consumption", skip: (d: Record<string, unknown>) => d.solarEquipment === "none" },
];

describe("stepSequence", () => {
  it("frames the product steps with welcome, contact and finalize", () => {
    expect(stepSequence(steps, {})).toEqual([WELCOME, "housing", "pv", "consumption", CONTACT, FINALIZE]);
  });

  it("drops skipped steps and brings them back when the answer changes (Review Focus 1)", () => {
    expect(stepSequence(steps, { solarEquipment: "none" })).toEqual([WELCOME, "housing", CONTACT, FINALIZE]);
    expect(stepSequence(steps, { solarEquipment: "exists" })).toEqual([WELCOME, "housing", "pv", "consumption", CONTACT, FINALIZE]);
  });
});

describe("clampToFirstIncomplete", () => {
  const seq = [WELCOME, "housing", "pv", CONTACT, FINALIZE];

  it("lands a deep link on the first step that still misses an answer", () => {
    const missing = (id: string) => (id === "pv" ? "pvPower" : null);
    expect(clampToFirstIncomplete(seq, FINALIZE, missing)).toBe("pv");
  });

  it("honours the requested step when everything before it is answered", () => {
    expect(clampToFirstIncomplete(seq, CONTACT, () => null)).toBe(CONTACT);
  });

  it("starts at welcome for an unknown or absent step", () => {
    expect(clampToFirstIncomplete(seq, "parking", () => null)).toBe(WELCOME);
    expect(clampToFirstIncomplete(seq, null, () => null)).toBe(WELCOME);
  });
});
```

Create `src/components/quote-shell/pageConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fieldConfig, stepConfig, tooltipImageUrl } from "./pageConfig";

const cfg = {
  steps: [
    { id: "welcome", offer: { active: true, amount: 50 } },
    { id: "pv", fields: [{ key: "pvPower", tooltipImage: "uuid-1", buckets: [{ value: 4, label: "x" }] }] },
    { id: "contact", fields: [{ key: "phone", tooltipImages: ["uuid-2"] }] },
  ],
};

describe("page config helpers", () => {
  it("finds a field's config, or an empty object", () => {
    expect(fieldConfig(cfg, "pv", "pvPower").buckets).toEqual([{ value: 4, label: "x" }]);
    expect(fieldConfig(cfg, "pv", "nope")).toEqual({});
    expect(fieldConfig({}, "pv", "pvPower")).toEqual({});
    expect(fieldConfig({ steps: "garbage" }, "pv", "pvPower")).toEqual({});
  });

  it("finds a step's config", () => {
    expect(stepConfig(cfg, "welcome").offer).toEqual({ active: true, amount: 50 });
    expect(stepConfig(cfg, "nope")).toEqual({});
  });

  it("builds the asset proxy URL from either tooltip field", () => {
    expect(tooltipImageUrl(cfg, "pv", "pvPower")).toBe("/api/cms/assets/uuid-1");
    expect(tooltipImageUrl(cfg, "contact", "phone")).toBe("/api/cms/assets/uuid-2");
    expect(tooltipImageUrl(cfg, "pv", "nope")).toBeUndefined();
  });
});
```

Append to `src/lib/quoteDraft.test.ts`:

```ts
describe("quoteDraftKey", () => {
  it("keeps the charger on the legacy key and namespaces other products (Review Focus 4)", async () => {
    const { quoteDraftKey, QUOTE_DRAFT_KEY } = await import("./quoteDraft");
    expect(quoteDraftKey("ecp")).toBe(QUOTE_DRAFT_KEY);
    expect(quoteDraftKey("battery")).toBe(`${QUOTE_DRAFT_KEY}:battery`);
    expect(quoteDraftKey("battery")).not.toBe(quoteDraftKey("ecp"));
  });
});
```

(If `describe` is not already imported at the top of `quoteDraft.test.ts`, add it to the existing `vitest` import.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/quote-shell src/lib/quoteDraft.test.ts`
Expected: FAIL — modules not found / `quoteDraftKey` not exported.

- [ ] **Step 3: Implement**

Create `src/components/quote-shell/dictionary.ts`:

```ts
/**
 * Translation lookup for a quote funnel that reads several Directus pages:
 * its own (`pages.quote-battery.*`) first, then the charger page
 * (`pages.quote.*`) for the shared steps — contact, finalize, navigation —
 * so a new product only translates what differs.
 */
export function makeShellT(dictionary: Record<string, string>, pageIds: string[]) {
  const lookup = (key: string): string | undefined => {
    for (const id of pageIds) {
      const v = dictionary[`pages.${id}.${key}`];
      if (v && !v.startsWith("[")) return v;
    }
    return undefined;
  };

  const interpolate = (value: string, vars?: Record<string, string | number>) => {
    if (!vars) return value;
    let out = value;
    for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    return out;
  };

  /** Like t(): the full key comes back when nothing is translated. */
  const tq = (key: string, vars?: Record<string, string | number>) =>
    interpolate(lookup(key) ?? `pages.${pageIds[0]}.${key}`, vars);

  /** undefined when the key is missing or still a [placeholder]. */
  const tqOpt = (key: string) => lookup(key);

  return { tq, tqOpt };
}
```

Create `src/components/quote-shell/navigation.ts`:

```ts
export const WELCOME = "welcome";
export const CONTACT = "contact";
export const FINALIZE = "finalize";

type Data = Record<string, unknown>;

/** Visible step ids, in order, for the current answers. */
export function stepSequence(steps: { id: string; skip?: (data: Data) => boolean }[], data: Data): string[] {
  return [WELCOME, ...steps.filter((s) => !s.skip?.(data)).map((s) => s.id), CONTACT, FINALIZE];
}

/**
 * The step a visitor may land on from a URL: the requested one if every step
 * before it is answered, otherwise the first step that is not. A deep link to
 * `?step=finalize` on a fresh tab must not open an empty finalize step.
 */
export function clampToFirstIncomplete(
  seq: string[],
  requested: string | null,
  missing: (stepId: string) => string | null,
): string {
  const target = requested ? seq.indexOf(requested) : -1;
  if (target <= 0) return WELCOME;
  for (let i = 1; i < target; i++) {
    if (missing(seq[i]) !== null) return seq[i];
  }
  return seq[target];
}
```

Create `src/components/quote-shell/pageConfig.ts`:

```ts
type Cfg = Record<string, unknown>;

const asList = (v: unknown): Cfg[] =>
  Array.isArray(v) ? v.filter((x): x is Cfg => !!x && typeof x === "object") : [];

/** Directus page config of one step (`config.steps[]`, matched on `id`). */
export function stepConfig(pageConfig: Cfg, stepId: string): Cfg {
  return asList(pageConfig.steps).find((s) => s.id === stepId) ?? {};
}

/** Directus page config of one field (`config.steps[].fields[]`, matched on `key`). */
export function fieldConfig(pageConfig: Cfg, stepId: string, key: string): Cfg {
  return asList(stepConfig(pageConfig, stepId).fields).find((f) => f.key === key) ?? {};
}

/** Tooltip image of a field, through the authenticated asset proxy. */
export function tooltipImageUrl(pageConfig: Cfg, stepId: string, key: string): string | undefined {
  const fc = fieldConfig(pageConfig, stepId, key);
  const id = fc.tooltipImage ?? (Array.isArray(fc.tooltipImages) ? fc.tooltipImages[0] : undefined);
  return typeof id === "string" && id ? `/api/cms/assets/${id}` : undefined;
}
```

Append to `src/lib/quoteDraft.ts`:

```ts
/**
 * Draft key per product. The charger keeps the legacy key (live drafts in
 * visitors' tabs stay readable); other products are namespaced so two funnels
 * opened in one tab never fill each other's answers.
 */
export function quoteDraftKey(product: string): string {
  return product === "ecp" ? QUOTE_DRAFT_KEY : `${QUOTE_DRAFT_KEY}:${product}`;
}
```

In `src/components/quote/RangeButtonGroup.tsx`: add to `RangeButtonGroupProps`

```ts
  /** Show the "don't know" button. Off for questions everyone can answer. */
  allowNa?: boolean;
```

add `allowNa = true,` to the destructured props, and wrap the existing "don't know" `<button>` (the one with `onClick={() => onChange("na")}`) in `{allowNa && ( … )}`.

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/components/quote-shell src/lib/quoteDraft.test.ts src/lib/quoteBuckets.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/quote-shell/dictionary.ts src/components/quote-shell/dictionary.test.ts src/components/quote-shell/navigation.ts src/components/quote-shell/navigation.test.ts src/components/quote-shell/pageConfig.ts src/components/quote-shell/pageConfig.test.ts src/lib/quoteDraft.ts src/lib/quoteDraft.test.ts src/components/quote/RangeButtonGroup.tsx
git commit -m "feat(quote-shell): briques pures — dictionnaire à repli, séquence d'étapes, brouillon par produit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Battery answers, buckets and validation (pure)

**Files:**
- Create: `src/components/quote-shell/products/battery/fields.ts`, `buckets.ts`, `validation.ts`
- Test: `src/components/quote-shell/products/battery/validation.test.ts` (create)

**Interfaces:**
- Produces:
  - `type Bucketed = number | "na" | null`; `interface BatteryFields` (below); `BATTERY_INITIAL: BatteryFields`
  - `BATTERY_BUCKETS: Record<"pvPower" | "householdCount" | "householdSize" | "evCount", { value: number; label: string }[]>`
  - `isTenant(d: Record<string, unknown>): boolean`, `hasNoPv(d): boolean`
  - `parseDecimal(raw: string): number | null`
  - `batteryFirstUnanswered(stepId: string, d: Record<string, unknown>): string | null`
  - `batteryFieldChange(field: string, value: unknown, d: Record<string, unknown>): Record<string, unknown>`

- [ ] **Step 1: Write the failing tests** — create `src/components/quote-shell/products/battery/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BATTERY_INITIAL } from "./fields";
import { batteryFieldChange, batteryFirstUnanswered, hasNoPv, isTenant, parseDecimal } from "./validation";

const base = { ...BATTERY_INITIAL } as Record<string, unknown>;
const housed = { ...base, housingStatus: "owner", housingType: "house", solarEquipment: "exists" };
const pvDone = { ...housed, pvPower: 8, inverterBrand: "solaredge", existingBattery: "none" };

describe("parseDecimal (Review Focus 2)", () => {
  it("reads Swiss-style numbers", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal("12.5")).toBe(12.5);
    expect(parseDecimal(" 8 ")).toBe(8);
    expect(parseDecimal("12'000")).toBe(12000);
  });

  it("rejects zero, negatives and garbage", () => {
    expect(parseDecimal("0")).toBeNull();
    expect(parseDecimal("-3")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("")).toBeNull();
  });
});

describe("housing step", () => {
  it("asks status, then type, then solar", () => {
    expect(batteryFirstUnanswered("housing", base)).toBe("housingStatus");
    expect(batteryFirstUnanswered("housing", { ...base, housingStatus: "owner" })).toBe("housingType");
    expect(batteryFirstUnanswered("housing", { ...base, housingStatus: "owner", housingType: "house" })).toBe("solarEquipment");
    expect(batteryFirstUnanswered("housing", housed)).toBeNull();
  });

  it("asks nothing more of a tenant (the step shows an exit instead)", () => {
    const tenant = { ...base, housingStatus: "tenant" };
    expect(isTenant(tenant)).toBe(true);
    expect(batteryFirstUnanswered("housing", tenant)).toBeNull();
  });

  it("flags a visitor without PV", () => {
    expect(hasNoPv({ ...housed, solarEquipment: "none" })).toBe(true);
    expect(hasNoPv(housed)).toBe(false);
    expect(hasNoPv(base)).toBe(false);
  });
});

describe("pv step", () => {
  it("accepts a bucket or 'don't know' for the size", () => {
    expect(batteryFirstUnanswered("pv", housed)).toBe("pvPower");
    expect(batteryFirstUnanswered("pv", { ...housed, pvPower: "na", inverterBrand: "unknown", existingBattery: "none" })).toBeNull();
  });

  it("requires a positive number in exact mode (Review Focus 2)", () => {
    expect(batteryFirstUnanswered("pv", { ...pvDone, pvPowerExact: true, pvPower: null })).toBe("pvPower");
    expect(batteryFirstUnanswered("pv", { ...pvDone, pvPowerExact: true, pvPower: "na" })).toBe("pvPower");
    expect(batteryFirstUnanswered("pv", { ...pvDone, pvPowerExact: true, pvPower: 12.5 })).toBeNull();
  });

  it("then asks the inverter and the existing battery", () => {
    expect(batteryFirstUnanswered("pv", { ...housed, pvPower: 8 })).toBe("inverterBrand");
    expect(batteryFirstUnanswered("pv", { ...housed, pvPower: 8, inverterBrand: "sma" })).toBe("existingBattery");
    expect(batteryFirstUnanswered("pv", pvDone)).toBeNull();
  });
});

describe("consumption step", () => {
  const full = { ...pvDone, householdCount: 3, heatPump: "no", evCount: 2, hasCharger: "no", deadline: "asap" };

  it("is complete with every required answer", () => {
    expect(batteryFirstUnanswered("consumption", full)).toBeNull();
  });

  it("asks the household size only for a single household", () => {
    expect(batteryFirstUnanswered("consumption", { ...full, householdCount: 1 })).toBe("householdSize");
    expect(batteryFirstUnanswered("consumption", { ...full, householdCount: 1, householdSize: 3.5 })).toBeNull();
  });

  it("leaves the exact consumption optional, but checks it once opened", () => {
    expect(batteryFirstUnanswered("consumption", { ...full, annualConsumptionExact: true })).toBe("annualConsumption");
    expect(batteryFirstUnanswered("consumption", { ...full, annualConsumptionExact: true, annualConsumption: 9000 })).toBeNull();
  });

  it("asks 'EV planned' with no EV and 'charger' with at least one", () => {
    expect(batteryFirstUnanswered("consumption", { ...full, evCount: 0, hasCharger: "" })).toBe("evPlanned");
    expect(batteryFirstUnanswered("consumption", { ...full, evCount: 0, hasCharger: "", evPlanned: "yes" })).toBeNull();
    expect(batteryFirstUnanswered("consumption", { ...full, hasCharger: "" })).toBe("hasCharger");
  });

  it("ends with the deadline", () => {
    expect(batteryFirstUnanswered("consumption", { ...full, deadline: "" })).toBe("deadline");
  });
});

describe("batteryFieldChange", () => {
  it("clears the charger answer when the EV count drops to 0, and 'planned' when it rises (Review Focus 3)", () => {
    const two = { ...base, evCount: 2, hasCharger: "no" };
    const zero = batteryFieldChange("evCount", 0, two);
    expect(zero.hasCharger).toBe("");
    expect(batteryFirstUnanswered("consumption", { ...pvDone, ...zero, householdCount: 2, heatPump: "no", deadline: "asap" })).toBe("evPlanned");

    const one = batteryFieldChange("evCount", 1, { ...zero, evPlanned: "yes" });
    expect(one.evPlanned).toBe("");
  });

  it("clears the household size when there are several households", () => {
    expect(batteryFieldChange("householdCount", 2, { ...base, householdSize: 2 }).householdSize).toBeNull();
    expect(batteryFieldChange("householdCount", 1, { ...base, householdSize: 2 }).householdSize).toBe(2);
  });

  it("resets the value when switching between bucket and exact entry", () => {
    expect(batteryFieldChange("pvPowerExact", true, { ...base, pvPower: 8 }).pvPower).toBeNull();
    expect(batteryFieldChange("annualConsumptionExact", false, { ...base, annualConsumption: 9000 }).annualConsumption).toBeNull();
  });

  it("drops 'apartment' when the visitor becomes a sole owner", () => {
    expect(batteryFieldChange("housingStatus", "owner", { ...base, housingType: "apartment" }).housingType).toBe("");
  });

  it("keeps the PV answers when solar is switched off and back on (Review Focus 1)", () => {
    const off = batteryFieldChange("solarEquipment", "none", pvDone);
    const on = batteryFieldChange("solarEquipment", "exists", off);
    expect(on.pvPower).toBe(8);
    expect(on.inverterBrand).toBe("solaredge");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/quote-shell/products/battery`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `src/components/quote-shell/products/battery/fields.ts`:

```ts
/** A bucket answer: its representative number, "na" for "don't know", null if unanswered. */
export type Bucketed = number | "na" | null;

export interface BatteryFields {
  housingStatus: string;      // "owner" | "co-owner" | "tenant"
  housingType: string;        // "house" | "apartment"
  solarEquipment: string;     // "exists" | "in-progress" | "none"
  pvPower: Bucketed;          // kWc
  pvPowerExact: boolean;      // true when pvPower was typed, not picked
  inverterBrand: string;      // "solaredge" | "fronius" | "huawei" | "sma" | "other" | "unknown"
  existingBattery: string;    // "none" | "extend"
  householdCount: number | null;   // 1, 2, 3, 4 (= 4+)
  householdSize: number | null;    // 1, 2, 3.5 (= 3–4), 5 (= 5+); single household only
  annualConsumption: number | null; // kWh, optional
  annualConsumptionExact: boolean;
  heatPump: string;           // "yes" | "no"
  evCount: number | null;     // 0, 1, 2, 3 (= 3+)
  evPlanned: string;          // "yes" | "no"; asked when evCount = 0
  hasCharger: string;         // "yes" | "no"; asked when evCount >= 1
  deadline: string;           // "asap" | "2-3mo" | "3-6mo" | "6+mo"
}

export const BATTERY_INITIAL: BatteryFields = {
  housingStatus: "",
  housingType: "",
  solarEquipment: "",
  pvPower: null,
  pvPowerExact: false,
  inverterBrand: "",
  existingBattery: "",
  householdCount: null,
  householdSize: null,
  annualConsumption: null,
  annualConsumptionExact: false,
  heatPump: "",
  evCount: null,
  evPlanned: "",
  hasCharger: "",
  deadline: "",
};
```

Create `src/components/quote-shell/products/battery/buckets.ts`:

```ts
// Same convention as src/lib/quoteBuckets.ts: each bucket stores a
// representative number; `{u}` renders as NBSP + unit. A page-config field may
// override with `buckets: [{ value, label }]`.
export const BATTERY_BUCKETS = {
  pvPower: [
    { value: 4, label: "< 6{u}" },
    { value: 8, label: "6–10{u}" },
    { value: 15, label: "10–20{u}" },
    { value: 25, label: "> 20{u}" },
  ],
  householdCount: [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4+" },
  ],
  householdSize: [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3.5, label: "3–4" },
    { value: 5, label: "5+" },
  ],
  evCount: [
    { value: 0, label: "0" },
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3+" },
  ],
} as const satisfies Record<string, readonly { value: number; label: string }[]>;
```

Create `src/components/quote-shell/products/battery/validation.ts`:

```ts
type Data = Record<string, unknown>;

const answered = (v: unknown) => v !== null && v !== undefined && v !== "";
const positive = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;

export const isTenant = (d: Data) => d.housingStatus === "tenant";
export const hasNoPv = (d: Data) => d.solarEquipment === "none";

/** "12,5" / "12.5" / "12'000" → number; empty, zero, negative or garbage → null. */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/['’\s]/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** First unanswered field of a battery step, in visual order; null when complete. */
export function batteryFirstUnanswered(stepId: string, d: Data): string | null {
  switch (stepId) {
    case "housing":
      if (!answered(d.housingStatus)) return "housingStatus";
      if (isTenant(d)) return null;
      if (!answered(d.housingType)) return "housingType";
      if (!answered(d.solarEquipment)) return "solarEquipment";
      return null;
    case "pv":
      if (d.pvPowerExact ? !positive(d.pvPower) : !answered(d.pvPower)) return "pvPower";
      if (!answered(d.inverterBrand)) return "inverterBrand";
      if (!answered(d.existingBattery)) return "existingBattery";
      return null;
    case "consumption":
      if (!answered(d.householdCount)) return "householdCount";
      if (d.householdCount === 1 && !answered(d.householdSize)) return "householdSize";
      if (d.annualConsumptionExact && !positive(d.annualConsumption)) return "annualConsumption";
      if (!answered(d.heatPump)) return "heatPump";
      if (!answered(d.evCount)) return "evCount";
      if (d.evCount === 0 && !answered(d.evPlanned)) return "evPlanned";
      if (typeof d.evCount === "number" && d.evCount >= 1 && !answered(d.hasCharger)) return "hasCharger";
      if (!answered(d.deadline)) return "deadline";
      return null;
    default:
      return null;
  }
}

/** Apply one answer and clear the answers it makes irrelevant. */
export function batteryFieldChange(field: string, value: unknown, d: Data): Data {
  const next: Data = { ...d, [field]: value };
  if (field === "housingStatus" && value === "owner" && d.housingType === "apartment") next.housingType = "";
  if (field === "pvPowerExact") next.pvPower = null;
  if (field === "annualConsumptionExact") next.annualConsumption = null;
  if (field === "householdCount" && value !== 1) next.householdSize = null;
  if (field === "evCount") {
    if (value === 0) next.hasCharger = "";
    else next.evPlanned = "";
  }
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/quote-shell/products/battery`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/quote-shell/products/battery/
git commit -m "feat(battery): réponses, tranches et validation du funnel batterie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The `QuoteShell` and its shared steps

No unit tests (Vitest runs `*.test.ts` in node); the behaviour under test lives in Tasks 7–8. Verification is lint, types and build; the click-through is Task 15.

**Files:**
- Create: `src/components/quote-shell/types.ts`, `RevealField.tsx`, `FieldLabel.tsx`, `WelcomeStep.tsx`, `ContactStep.tsx`, `FinalizeStep.tsx`, `funnels.ts`, `QuoteShell.tsx`

**Interfaces:**
- Consumes: Task 7 modules; `firstUnansweredField` and `StepFields` from `src/components/quote/stepValidation.ts`; `PublicQuoteConfig` from `src/lib/public-config.ts`.
- Produces:
  - `types.ts`: `FormValues`, `StepProps`, `StepDef`, `ProductFunnel` (below)
  - `funnels.ts`: `FUNNELS: Partial<Record<Product, ProductFunnel>>`, `getFunnel(product: Product): ProductFunnel`
  - `QuoteShell` props: `{ product: Product; lang: string; dictionary: Record<string, string>; quoteSlug: string; pageConfig?: Record<string, unknown>; heroImage?: string; globalConfig?: PublicQuoteConfig; logoSrc?: string; logoDarkSrc?: string; pageRegistry?: PageRegistryEntry[]; prefill?: FormValues }`
  - `RevealField({ visible, children })`, `FieldLabel({ icon, label, tooltip?, image?, htmlFor? })`

- [ ] **Step 1: Create `types.ts`**

```ts
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { Product } from "@/lib/products";

export type FormValues = Record<string, unknown>;

/** What every product step receives from the shell. */
export interface StepProps {
  data: FormValues;
  set: (field: string, value: unknown) => void;
  tq: (key: string, vars?: Record<string, string | number>) => string;
  tqOpt: (key: string) => string | undefined;
  lang: string;
  pageConfig: Record<string, unknown>;
}

export interface StepDef {
  /** Also the URL `?step=` value, the `q-…` anchor scope and `steps.<id>.title`. */
  id: string;
  icon: LucideIcon;
  Component: ComponentType<StepProps>;
  /** Removed from the sequence for these answers. */
  skip?: (data: FormValues) => boolean;
  /** The visitor cannot continue: the shell replaces "Continue" with a link home. */
  exit?: (data: FormValues) => boolean;
}

export interface ProductFunnel {
  product: Product;
  /** Directus pages read by `tq`, most specific first. */
  dictPageIds: string[];
  steps: StepDef[];
  initialData: FormValues;
  firstUnansweredField: (stepId: string, data: FormValues) => string | null;
  /** Apply one answer and clear the answers it invalidates. */
  applyChange: (field: string, value: unknown, data: FormValues) => FormValues;
}
```

- [ ] **Step 2: Create `RevealField.tsx`** — a copy of the private `RevealField` of `QuoteForm.tsx` (which stays untouched):

```tsx
"use client";

import { useEffect, useRef } from "react";

// Shared guard: when one answer reveals several fields at once, only the
// topmost (first effect to fire) scrolls — competing smooth-scrolls cancel
// each other and land nowhere.
const lastRevealScroll = { at: 0 };

/** Progressive reveal: hidden until `visible`, then slides down and scrolls into view. */
export function RevealField({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Mounted-already-visible (filled step re-entered) must NOT scroll — only user-triggered reveals.
  const hasBeenVisible = useRef(visible);

  useEffect(() => {
    if (visible && !hasBeenVisible.current) {
      hasBeenVisible.current = true;
      const timer = setTimeout(() => {
        const now = Date.now();
        if (now - lastRevealScroll.at < 400) return;
        lastRevealScroll.at = now;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        ref.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      }, 320);
      return () => clearTimeout(timer);
    }
    if (!visible) hasBeenVisible.current = false;
  }, [visible]);

  return (
    <div
      ref={ref}
      inert={!visible}
      className={`transition-all duration-300 ease-out ${
        visible
          ? "opacity-100 max-h-[2000px] translate-y-0"
          : "opacity-0 max-h-0 overflow-hidden translate-y-2 pointer-events-none"
      }`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create `FieldLabel.tsx`**

```tsx
"use client";

import type { LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";

/** The uppercase question label of the quote funnels, with optional tooltip. */
export function FieldLabel({ icon: Icon, label, tooltip, image, htmlFor }: {
  icon: LucideIcon;
  label: string;
  tooltip?: string;
  image?: string;
  htmlFor?: string;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 block">
      <InfoTooltip className="flex items-center gap-1.5" content={tooltip} image={image}>
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </InfoTooltip>
    </Label>
  );
}
```

- [ ] **Step 4: Create `WelcomeStep.tsx`** — the welcome JSX of `QuoteForm.tsx` (its `{step === 0 && (…)}` block), with `tq` and the offer passed in:

```tsx
"use client";

import Image from "next/image";
import { CheckCircle, Clock, Gift, Tag } from "lucide-react";
import type { PublicQuoteConfig } from "@/lib/public-config";

interface WelcomeStepProps {
  tq: (key: string, vars?: Record<string, string | number>) => string;
  heroImage?: string;
  globalConfig: PublicQuoteConfig;
  offer?: { active?: boolean; currency?: string; amount?: number; network?: string };
}

export function WelcomeStep({ tq, heroImage, globalConfig: gc, offer }: WelcomeStepProps) {
  const firstContact = gc.slas?.first_contact?.value ?? 48;
  const stats = [
    { value: gc.stats?.installations != null ? `${gc.stats.installations}+` : "650+", label: tq("welcome.stats.installations.label") },
    { value: gc.trustpilot?.score != null ? `${gc.trustpilot.score} ★` : "4.8 ★", label: tq("welcome.stats.rating.label") },
  ];
  const usps = [
    { icon: CheckCircle, text: tq("welcome.usps.certified") },
    { icon: Clock, text: tq("welcome.usps.fast", { quote_delivery_timeline: gc.slas?.quote_delivery_timeline?.value ?? "3-5" }) },
    { icon: Tag, text: tq("welcome.usps.transparent") },
  ];

  return (
    <div>
      {heroImage ? (
        <div className="relative h-56 overflow-hidden">
          <Image src={heroImage} alt="" fill priority quality={60} sizes="(max-width: 768px) 100vw, 672px" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-slate-900/10" />
          <div className="absolute inset-0 flex flex-col justify-end p-6">
            <h1 className="text-2xl font-heading font-bold text-white leading-tight">{tq("welcome.title")}</h1>
            <p className="text-sm text-white/80 mt-1">{tq("welcome.subtitle", { first_contact: firstContact })}</p>
          </div>
        </div>
      ) : (
        <div className="px-6 pt-6">
          <h1 className="text-2xl font-heading font-bold">{tq("welcome.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{tq("welcome.subtitle", { first_contact: firstContact })}</p>
        </div>
      )}

      <div className="grid grid-cols-2 border-b border-border/60 bg-primary/5">
        {stats.map((stat, i) => (
          <div key={stat.label} className={`py-4 px-3 text-center ${i === 0 ? "border-r border-border/60" : ""}`}>
            <div className="text-xl font-bold text-primary">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="px-6 py-5 space-y-3">
        {usps.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3">
            <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium">{text}</span>
          </div>
        ))}
      </div>

      {offer && offer.active !== false && (
        <div className="mx-6 mb-6 pt-5 border-t border-primary/20">
          <div className="flex items-start gap-3">
            <Gift className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-heading font-semibold text-sm text-foreground mb-1">{tq("welcome.offer.title")}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tq("welcome.offer.description", { currency: offer.currency || "CHF", amount: offer.amount || 50, network: offer.network || "Shell" })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `ContactStep.tsx`.** Its JSX is a verbatim copy of the charger's contact step body. Write the file below, then fill the marked JSX region.

```tsx
"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Mail, MapPin, Phone as PhoneIcon, User, Users } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_COUNTRIES, validatePhone } from "@/lib/phone-utils";
import { normalizeName, suggestEmailCorrection } from "@/lib/form-hygiene";
import { NAV_BAR_CLEARANCE } from "@/lib/dropdownPlacement";
import { getCantonCode, CANTON_CODES } from "@shared/swiss-cantons";
import { RevealField } from "./RevealField";
import { fieldConfig } from "./pageConfig";
import type { FormValues } from "./types";

const LazyPlaceAutocomplete = dynamic(
  () => import("@/components/quote/PlaceAutocomplete").then((m) => m.PlaceAutocomplete),
  { ssr: false },
);
const LazyAPIProvider = dynamic(
  () => import("@vis.gl/react-google-maps").then((m) => m.APIProvider),
  { ssr: false },
);

interface ContactFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  addressMode: "google" | "manual";
  address: string;
  streetName?: string;
  streetNb?: string;
  postalCode?: string;
  locality?: string;
  canton?: string;
  country?: string;
}

interface ContactStepProps {
  data: FormValues;
  set: (field: string, value: unknown) => void;
  /** Several fields at once (place selection, address mode). */
  patch: (updates: FormValues) => void;
  tq: (key: string, vars?: Record<string, string | number>) => string;
  tqOpt: (key: string) => string | undefined;
  lang: string;
  pageConfig: Record<string, unknown>;
}

const countryFlag = (code: string) =>
  Array.from(code.toUpperCase()).map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))).join("");

export function ContactStep({ data, set, patch, tq, tqOpt, lang, pageConfig }: ContactStepProps) {
  const formData = data as unknown as ContactFields;
  const handleFieldChange = (field: keyof ContactFields, value: unknown) => set(field, value);
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
  const isPhoneValid = formData.phone && validatePhone(formData.phone, formData.phoneCountry as CountryCode);

  const phoneCountries = useMemo(() => {
    const configured = fieldConfig(pageConfig, "contact", "phone").countries as string[] | undefined;
    if (!configured?.length) return SUPPORTED_COUNTRIES;
    return SUPPORTED_COUNTRIES.filter((c) => configured.includes(c.code));
  }, [pageConfig]);

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    if (!place.address_components) return;
    const updates: FormValues = { streetName: "", streetNb: "", postalCode: "", locality: "", canton: "", country: "" };
    for (const component of place.address_components) {
      const types = component.types;
      if (types.includes("street_number")) updates.streetNb = component.long_name;
      if (types.includes("route")) updates.streetName = component.long_name;
      if (types.includes("postal_code")) updates.postalCode = component.long_name;
      if (types.includes("locality")) updates.locality = component.long_name;
      if (types.includes("administrative_area_level_1")) updates.canton = getCantonCode(component.long_name) || component.short_name;
      if (types.includes("country")) updates.country = component.short_name;
    }
    patch(updates);
  };

  const toggleAddressMode = () => {
    patch({
      addressMode: formData.addressMode === "google" ? "manual" : "google",
      address: "", streetName: "", streetNb: "", postalCode: "", locality: "", canton: "", country: "CH",
    });
  };

  return (
    <>
      {/* JSX COPIED FROM QuoteForm.tsx — see the instructions under this code block */}
    </>
  );
}
```

Fill the fragment with the JSX of `src/components/quote/QuoteForm.tsx` from the line `{/* Address */}` (inside `{step === 5 && (`) down to and including the `</div>` that closes `<div id="q-phone">`. Copy it unchanged: the names it uses (`formData`, `handleFieldChange`, `handlePlaceSelect`, `toggleAddressMode`, `countryFlag`, `phoneCountries`, `isEmailValid`, `isPhoneValid`, `googleMapsApiKey`, `tq`, `tqOpt`, `lang`, `RevealField`, `LazyAPIProvider`, `LazyPlaceAutocomplete`, `NAV_BAR_CLEARANCE`, `CANTON_CODES`, `normalizeName`, `suggestEmailCorrection`, every `ui/` component and icon) are all defined above under the same names. Do not copy the step header (`<div className="flex items-center gap-3 pb-4 border-b …">` with the `User` icon and `steps.contact.title`): the shell renders step headers. Verify with `diff`:

Run: `diff <(sed -n '/{\/\* Address \*\/}/,/q-phone/p' src/components/quote/QuoteForm.tsx | head -5) <(sed -n '/{\/\* Address \*\/}/,/q-phone/p' src/components/quote-shell/ContactStep.tsx | head -5)`
Expected: no output.

- [ ] **Step 6: Create `FinalizeStep.tsx`** — approval uses `IconButtonGroup` (native buttons) instead of the charger's `RadioGroup`:

```tsx
"use client";

import { useMemo } from "react";
import { Clock, MessageSquare, ShieldCheck, ShieldX } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { IconButtonGroup, type IconButtonOption } from "@/components/quote/IconButtonGroup";
import { FieldLabel } from "./FieldLabel";
import { fieldConfig, tooltipImageUrl } from "./pageConfig";
import type { FormValues } from "./types";

type ApprovalCase = { label: string; options: { value: string; label: string }[] };

const APPROVAL_DEFAULTS: Record<string, ApprovalCase> = {
  tenant: {
    label: "steps.finalize.fields.approval.tenant.label",
    options: [
      { value: "yes", label: "steps.finalize.fields.approval.tenant.options.yes" },
      { value: "in-progress", label: "steps.finalize.fields.approval.tenant.options.in-progress" },
      { value: "no", label: "steps.finalize.fields.approval.tenant.options.no" },
    ],
  },
  "co-owner": {
    label: "steps.finalize.fields.approval.co-owner.label",
    options: [
      { value: "yes", label: "steps.finalize.fields.approval.co-owner.options.yes" },
      { value: "in-progress", label: "steps.finalize.fields.approval.co-owner.options.in-progress" },
      { value: "no", label: "steps.finalize.fields.approval.co-owner.options.no" },
    ],
  },
};

const APPROVAL_ICONS = { yes: ShieldCheck, "in-progress": Clock, no: ShieldX } as const;

interface FinalizeStepProps {
  data: FormValues;
  set: (field: string, value: unknown) => void;
  tq: (key: string, vars?: Record<string, string | number>) => string;
  tqOpt: (key: string) => string | undefined;
  lang: string;
  pageConfig: Record<string, unknown>;
}

export function FinalizeStep({ data, set, tq, tqOpt, lang, pageConfig }: FinalizeStepProps) {
  const housingStatus = typeof data.housingStatus === "string" ? data.housingStatus : "";
  const approval = useMemo(() => {
    if (!housingStatus) return null;
    const conditional = fieldConfig(pageConfig, "finalize", "approval").conditional as { cases?: Record<string, ApprovalCase> } | undefined;
    return (conditional?.cases ?? APPROVAL_DEFAULTS)[housingStatus] ?? null;
  }, [pageConfig, housingStatus]);

  const approvalOptions: IconButtonOption[] = (approval?.options ?? []).map((o) => ({
    value: o.value,
    label: tq(o.label),
    icon: APPROVAL_ICONS[o.value as keyof typeof APPROVAL_ICONS] ?? ShieldCheck,
  }));
  const privacyNote = tq("steps.finalize.fields.acceptTerms.privacyNote").split("{privacyLink}");

  return (
    <>
      {approval && (
        <div id="q-approval">
          <FieldLabel
            icon={ShieldCheck}
            label={tq(approval.label)}
            tooltip={tqOpt(`steps.finalize.fields.approval.${housingStatus}.tooltip`)}
            image={tooltipImageUrl(pageConfig, "finalize", "approval")}
          />
          <IconButtonGroup options={approvalOptions} value={String(data.approval ?? "")} onChange={(v) => set("approval", v)} />
        </div>
      )}

      <div>
        <FieldLabel icon={MessageSquare} label={tq("steps.finalize.fields.comment.label")} htmlFor="comment" />
        <Textarea
          id="comment"
          placeholder={tq("steps.finalize.fields.comment.placeholder")}
          value={String(data.comment ?? "")}
          onChange={(e) => set("comment", e.target.value)}
          rows={4}
          className="resize-none"
          data-testid="textarea-comment"
        />
      </div>

      <div id="q-acceptTerms" className="space-y-2">
        <label
          htmlFor="acceptTerms"
          className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
            data.acceptTerms ? "border-primary/30 bg-primary/5" : "border-border/60 bg-muted/40 hover:border-primary/30 hover:bg-muted/60"
          }`}
        >
          <Checkbox
            id="acceptTerms"
            checked={data.acceptTerms === true}
            onCheckedChange={(checked) => set("acceptTerms", !!checked)}
            className="shrink-0"
            data-testid="checkbox-accept-terms"
          />
          <p className="text-sm leading-relaxed">{tq("steps.finalize.fields.acceptTerms.label")}</p>
        </label>
        <p className="text-xs text-muted-foreground px-1">
          {privacyNote[0]}
          <a href={`/${lang}/privacy`} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            {tq("steps.finalize.fields.acceptTerms.privacyLink")}
          </a>
          {privacyNote[1]}
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 7: Create `funnels.ts`** (empty registry until Task 10):

```ts
"use client";

import type { Product } from "@/lib/products";
import type { ProductFunnel } from "./types";

/** Products whose funnel runs on QuoteShell. The charger still uses QuoteForm. */
export const FUNNELS: Partial<Record<Product, ProductFunnel>> = {};

export function getFunnel(product: Product): ProductFunnel {
  const funnel = FUNNELS[product];
  if (!funnel) throw new Error(`QuoteShell: no funnel registered for product "${product}"`);
  return funnel;
}
```

- [ ] **Step 8: Create `QuoteShell.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, ChevronLeft, ChevronRight, Home, Loader2, User } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/quote/ProgressBar";
import { firstUnansweredField as sharedFirstUnanswered, type StepFields } from "@/components/quote/stepValidation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePostHog } from "@/components/PostHogProvider";
import { useFormTelemetry } from "@/hooks/use-form-telemetry";
import { getAttributionCompact } from "@/lib/attribution";
import { adsSendTo, fireAdsConversion } from "@/lib/googleAds";
import { formatPhoneE164 } from "@/lib/phone-utils";
import { parseQuoteDraft, quoteDraftKey, serializeQuoteDraft } from "@/lib/quoteDraft";
import type { PublicQuoteConfig } from "@/lib/public-config";
import type { PageRegistryEntry } from "@/lib/directus-queries";
import type { Product } from "@/lib/products";
import { makeShellT } from "./dictionary";
import { CONTACT, FINALIZE, WELCOME, clampToFirstIncomplete, stepSequence } from "./navigation";
import { stepConfig } from "./pageConfig";
import { getFunnel } from "./funnels";
import { WelcomeStep } from "./WelcomeStep";
import { ContactStep } from "./ContactStep";
import { FinalizeStep } from "./FinalizeStep";
import type { FormValues } from "./types";

const SHARED_INITIAL: FormValues = {
  firstName: "", lastName: "", email: "", phone: "", phoneCountry: "CH",
  addressMode: "google", address: "", country: "CH",
  approval: "", comment: "", acceptTerms: false,
};

interface QuoteShellProps {
  product: Product;
  lang: string;
  dictionary: Record<string, string>;
  quoteSlug: string;
  pageConfig?: Record<string, unknown>;
  heroImage?: string;
  globalConfig?: PublicQuoteConfig;
  logoSrc?: string;
  logoDarkSrc?: string;
  pageRegistry?: PageRegistryEntry[];
  /** Answers carried over from another funnel (sub-project D). */
  prefill?: FormValues;
}

export function QuoteShell({
  product, lang, dictionary, quoteSlug, pageConfig = {}, heroImage,
  globalConfig: gc = {}, logoSrc, logoDarkSrc, pageRegistry, prefill,
}: QuoteShellProps) {
  const funnel = getFunnel(product);
  const { tq, tqOpt } = useMemo(() => makeShellT(dictionary, funnel.dictPageIds), [dictionary, funnel]);
  const ph = usePostHog();
  const telemetry = useFormTelemetry({ formType: "quote", locale: lang });
  const draftKey = quoteDraftKey(product);

  const [data, setData] = useState<FormValues>(() => ({ ...SHARED_INITIAL, ...funnel.initialData, ...prefill }));
  const [stepId, setStepId] = useState<string>(WELCOME);
  const [showMissingHint, setShowMissingHint] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const miniQuoteSessionTokenRef = useRef<string | null>(null);

  const missingFor = (id: string, d: FormValues): string | null => {
    if (id === WELCOME) return null;
    if (id === CONTACT) return sharedFirstUnanswered(5, d as unknown as StepFields);
    if (id === FINALIZE) return sharedFirstUnanswered(6, d as unknown as StepFields);
    return funnel.firstUnansweredField(id, d);
  };

  const seq = stepSequence(funnel.steps, data);
  const index = Math.max(0, seq.indexOf(stepId));
  const currentId = seq[index];
  const productStep = funnel.steps.find((s) => s.id === currentId);
  const exited = productStep?.exit?.(data) ?? false;
  const missingField = missingFor(currentId, data);
  const StepIcon = productStep?.icon ?? (currentId === CONTACT ? User : CheckCircle);

  // Restore the draft, read mini-quote hand-off params, land on the right step.
  useEffect(() => {
    let restored: FormValues = {};
    try {
      restored = parseQuoteDraft(sessionStorage.getItem(draftKey), Date.now()) ?? {};
    } catch { /* storage unavailable (private mode) — start fresh */ }

    const params = new URLSearchParams(window.location.search);
    const fromUrl: FormValues = {};
    for (const key of ["locality", "postalCode", "housingStatus"]) {
      const v = params.get(key);
      if (v) fromUrl[key] = v;
    }
    const token = params.get("sessionToken");
    if (token) miniQuoteSessionTokenRef.current = token;

    const merged = { ...SHARED_INITIAL, ...funnel.initialData, ...prefill, ...restored, ...fromUrl };
    setData(merged);
    setStepId(clampToFirstIncomplete(stepSequence(funnel.steps, merged), params.get("step"), (id) => missingFor(id, merged)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft so refresh / back-navigation resumes.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        sessionStorage.setItem(draftKey, serializeQuoteDraft(data, Date.now()));
      } catch { /* quota/private mode — non-fatal */ }
    }, 400);
    return () => clearTimeout(id);
  }, [data, draftKey]);

  // Browser back/forward.
  useEffect(() => {
    const onPop = () => setStepId(new URLSearchParams(window.location.search).get("step") ?? WELCOME);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const eventProps = () => ({
    form_type: "quote",
    product,
    locale: lang,
    entry_point: miniQuoteSessionTokenRef.current ? "mini-quote" : "direct",
  });

  const set = (field: string, value: unknown) => {
    if (showMissingHint) setShowMissingHint(false);
    telemetry.trackChange(field, String(value));
    setData((prev) => funnel.applyChange(field, value, prev));
  };
  const patch = (updates: FormValues) => setData((prev) => ({ ...prev, ...updates }));

  const goToStep = (nextId: string) => {
    const nextIndex = seq.indexOf(nextId);
    if (nextIndex > index) {
      ph?.capture("quote_step_completed", { ...eventProps(), step: index, step_name: currentId });
      if (currentId === WELCOME) {
        const startSendTo = adsSendTo(gc.google_ads, "quote_start", product);
        if (startSendTo) fireAdsConversion(startSendTo);
      }
    }
    ph?.capture("quote_step_viewed", { ...eventProps(), step: nextIndex, step_name: nextId });
    const url = new URL(window.location.href);
    url.searchParams.set("step", nextId);
    history.pushState({}, "", url.toString());
    setStepId(nextId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Same nudge as QuoteForm: scroll to the missing question and pulse it.
  const nudgeField = (field: string) => {
    setShowMissingHint(true);
    ph?.capture("quote_missing_answer_nudge", { ...eventProps(), step: index, field });
    const el = document.getElementById(`q-${field}`);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    el.classList.remove("er-field-nudge");
    void el.offsetWidth;
    el.classList.add("er-field-nudge");
    window.setTimeout(() => el.classList.remove("er-field-nudge"), 2600);
  };

  const tryGoToStep = (nextId: string) => {
    if (seq.indexOf(nextId) > index && missingField) {
      nudgeField(missingField);
      return;
    }
    setShowMissingHint(false);
    goToStep(nextId);
  };

  const submit = async () => {
    if (missingField) {
      nudgeField(missingField);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(false);
    try {
      const phIds = {
        phDistinctId: ph?.get_distinct_id?.() ?? null,
        phSessionId: ph?.get_session_id?.() ?? null,
      };
      const token = miniQuoteSessionTokenRef.current;
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, lang, product, attribution: getAttributionCompact(), posthog: phIds, ...(token && { miniQuoteSessionToken: token }) }),
      });
      if (!res.ok) throw new Error("Submit failed");
      const result = await res.json();
      const dispatchable = result.dispatchable !== false;

      telemetry.trackSubmit(true, { submissionId: result.submissionId });
      try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
      try { ph?.capture("quote_submitted", { ...eventProps(), dispatchable }); } catch { /* noop */ }
      try { ph?.identify(String(data.email), { first_name: data.firstName, last_name: data.lastName, locale: lang }); } catch { /* noop */ }

      fetch("/api/form-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: telemetry.sessionToken,
          formType: "quote",
          locationPath: window.location.pathname,
          locationParams: window.location.search.slice(1) || null,
          locationRoute: "quote",
          locale: lang,
          userAgent: navigator.userAgent,
          user: { email: data.email, firstName: data.firstName, lastName: data.lastName, phone: data.phone },
          data,
          status: "success",
          posthog: phIds,
        }),
      }).catch(() => {});

      const confirmSegment = tq("steps.finalize.fields.confirmation_segment");
      const seg = confirmSegment.includes(".") || confirmSegment.startsWith("[") ? "confirmation" : confirmSegment;
      const qs = new URLSearchParams();
      const name = String(data.firstName ?? "").trim();
      if (name) qs.set("firstName", name);
      if (result.submissionId) qs.set("submissionId", result.submissionId);
      // Not dispatchable = not a lead for Ads: the success page skips its fallback conversion too.
      if (!dispatchable) qs.set("nd", "1");
      const redirect = () => { window.location.href = `/${lang}/${quoteSlug}/${seg}?${qs.toString()}`; };

      const leadSendTo = dispatchable ? adsSendTo(gc.google_ads, "quote_submit", product) : null;
      if (leadSendTo) {
        fireAdsConversion(leadSendTo, {
          transactionId: result.submissionId,
          userData: {
            email: String(data.email || "") || undefined,
            phone_number: formatPhoneE164(String(data.phone ?? ""), data.phoneCountry as CountryCode) || undefined,
            address: {
              first_name: String(data.firstName || "") || undefined,
              last_name: String(data.lastName || "") || undefined,
              postal_code: String(data.postalCode || "") || undefined,
              country: "CH",
            },
          },
          onDone: redirect,
        });
      } else {
        redirect();
      }
    } catch (err) {
      telemetry.trackSubmit(false, { error: String(err) });
      ph?.capture("quote_form_error", { ...eventProps(), error_message: String(err) });
      setSubmitError(true);
      setIsSubmitting(false);
    }
  };

  const stepProps = { data, set, tq, tqOpt, lang, pageConfig };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30" data-hide-layout data-direction-b>
      <div className="py-4 md:py-6 bg-background">
        <div className="container mx-auto px-4 flex justify-between items-center md:grid md:grid-cols-3">
          <div className="hidden md:block" />
          <div className="flex md:justify-center">
            <Link href={`/${lang}`} data-testid="link-logo-home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc || "/logo-color.svg"} alt="easyRecharge" className="h-8 md:h-10 w-auto dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoDarkSrc || "/logo-white.svg"} alt="easyRecharge" className="h-8 md:h-10 w-auto hidden dark:block" />
            </Link>
          </div>
          <div className="flex justify-end items-center gap-2">
            <LanguageSwitcher pageRegistry={pageRegistry} />
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="flex-1 py-4 md:py-6 pb-32">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {index > 0 && (
              <ProgressBar
                currentStep={index}
                totalSteps={seq.length - 1}
                onStepClick={(s) => (s < index ? goToStep(seq[s]) : tryGoToStep(seq[s]))}
                className="mb-4"
              />
            )}

            <Card className={`rounded-2xl border border-border/80 shadow-sm ${currentId === WELCOME ? "overflow-hidden pt-0 gap-0" : "p-6"}`}>
              {currentId === WELCOME ? (
                <WelcomeStep tq={tq} heroImage={heroImage} globalConfig={gc} offer={stepConfig(pageConfig, WELCOME).offer as Parameters<typeof WelcomeStep>[0]["offer"]} />
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <StepIcon className="h-6 w-6 text-primary flex-shrink-0" />
                    <h2 className="text-2xl font-heading font-bold">{tq(`steps.${currentId}.title`)}</h2>
                  </div>
                  {productStep && <productStep.Component {...stepProps} />}
                  {currentId === CONTACT && <ContactStep {...stepProps} patch={patch} />}
                  {currentId === FINALIZE && <FinalizeStep {...stepProps} />}
                </div>
              )}
            </Card>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border/60 shadow-lg z-50 py-3">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto">
              {showMissingHint && missingField && (
                <p className="text-xs text-destructive text-center mb-2" role="status">
                  {tqOpt("navigation.missingAnswer") ??
                    (lang === "de"
                      ? "Oben fehlt noch eine Antwort — wir haben sie für Sie markiert."
                      : "Il manque une réponse ci-dessus — nous vous y avons amené.")}
                </p>
              )}
              {currentId === WELCOME ? (
                <Button size="lg" onClick={() => tryGoToStep(seq[1])} className="w-full font-semibold" data-testid="button-start-quote">
                  {tq("welcome.cta")}
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              ) : (
                <div className="flex gap-3">
                  {index > 1 && (
                    <Button size="lg" variant="outline" onClick={() => goToStep(seq[index - 1])} className="font-semibold" data-testid="button-back">
                      <ChevronLeft className="mr-2 h-5 w-5" />
                      {tq("navigation.back")}
                    </Button>
                  )}
                  {exited ? (
                    <Link href={`/${lang}`} className={cn(buttonVariants({ size: "lg" }), "flex-1 font-semibold")} data-testid="button-exit-home">
                      <Home className="mr-2 h-5 w-5" />
                      {tq("navigation.home")}
                    </Link>
                  ) : currentId === FINALIZE ? (
                    <Button size="lg" onClick={submit} disabled={isSubmitting} className={`flex-1 font-semibold${missingField ? " opacity-60" : ""}`} data-testid="button-submit">
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : tq("steps.finalize.submit")}
                    </Button>
                  ) : (
                    <Button size="lg" onClick={() => tryGoToStep(seq[index + 1])} className={`flex-1 font-semibold${missingField ? " opacity-60" : ""}`} data-testid="button-next">
                      {tq("navigation.next")}
                      <ChevronRight className="ml-2 h-5 w-5" />
                    </Button>
                  )}
                </div>
              )}
              {submitError && <p className="text-xs text-destructive text-center w-full mt-1">{tq("steps.finalize.submitError")}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Lint, type-check, build**

Run: `npm run lint && npx tsc --noEmit -p . && npm run build`
Expected: all pass. The shell is not routed yet, so the build only proves it compiles.

- [ ] **Step 10: Commit**

```bash
git add src/components/quote-shell/
git commit -m "feat(quote-shell): coquille de funnel générique (accueil, contact, finalisation, navigation, soumission)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Battery step screens and funnel registration

**Files:**
- Create: `src/components/quote-shell/products/battery/steps.tsx`, `src/components/quote-shell/products/battery/index.ts`
- Modify: `src/components/quote-shell/funnels.ts`

**Interfaces:**
- Consumes: Task 8 (`BATTERY_INITIAL`, `BATTERY_BUCKETS`, `batteryFirstUnanswered`, `batteryFieldChange`, `isTenant`, `hasNoPv`, `parseDecimal`), Task 9 (`StepProps`, `ProductFunnel`, `RevealField`, `FieldLabel`), Task 7 (`fieldConfig`, `tooltipImageUrl`, `RangeButtonGroup` `allowNa`).
- Produces: `batteryFunnel: ProductFunnel`; `FUNNELS.battery`.

Translation keys read by these screens (all under `pages.quote-battery.`; Task 14 creates them): `steps.housing.*`, `steps.pv.*`, `steps.consumption.*`, `common.dontKnow`, `common.precisionHint`, `navigation.home`.

- [ ] **Step 1: Create `steps.tsx`**

```tsx
"use client";

import { useState } from "react";
import {
  Battery, BatteryCharging, Building2, CalendarClock, CalendarDays, Car, CircleSlash, Clock, Cpu,
  Gauge, Hammer, HelpCircle, Home, Key, Plug, Sun, Thermometer, User, Users, Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { IconButtonGroup, type IconButtonOption } from "@/components/quote/IconButtonGroup";
import { RangeButtonGroup } from "@/components/quote/RangeButtonGroup";
import { resolveBuckets } from "@/lib/quoteBuckets";
import { RevealField } from "../../RevealField";
import { FieldLabel } from "../../FieldLabel";
import { fieldConfig, tooltipImageUrl } from "../../pageConfig";
import type { StepProps } from "../../types";
import { BATTERY_BUCKETS } from "./buckets";
import type { BatteryFields } from "./fields";
import { parseDecimal } from "./validation";

const F = (step: string, field: string) => `steps.${step}.fields.${field}`;

function options(tq: StepProps["tq"], step: string, field: string, list: [string, IconButtonOption["icon"]][]): IconButtonOption[] {
  return list.map(([value, icon]) => ({ value, label: tq(`${F(step, field)}.options.${value}`), icon }));
}

function buckets(pageConfig: StepProps["pageConfig"], step: string, field: keyof typeof BATTERY_BUCKETS, unit: string) {
  return resolveBuckets(field, fieldConfig(pageConfig, step, field).buckets ?? BATTERY_BUCKETS[field], unit);
}

const notice = "rounded-lg border border-border/60 bg-muted/40 p-4 text-sm leading-relaxed";

export function HousingStep({ data, set, tq, tqOpt, pageConfig }: StepProps) {
  const d = data as Partial<BatteryFields>;
  const tenant = d.housingStatus === "tenant";
  const label = (field: string, icon: IconButtonOption["icon"]) => (
    <FieldLabel icon={icon} label={tq(`${F("housing", field)}.label`)} tooltip={tqOpt(`${F("housing", field)}.tooltip`)} image={tooltipImageUrl(pageConfig, "housing", field)} />
  );

  return (
    <>
      <div id="q-housingStatus">
        {label("housingStatus", User)}
        <IconButtonGroup
          options={options(tq, "housing", "housingStatus", [["owner", Home], ["co-owner", Building2], ["tenant", Key]])}
          value={d.housingStatus ?? ""}
          onChange={(v) => set("housingStatus", v)}
        />
      </div>

      <RevealField visible={tenant}>
        <div className={notice} role="status">{tq("steps.housing.tenantExit")}</div>
      </RevealField>

      <RevealField visible={!!d.housingStatus && !tenant}>
        <div id="q-housingType">
          {label("housingType", Home)}
          <IconButtonGroup
            options={options(tq, "housing", "housingType", [["house", Home], ["apartment", Building2]])}
            value={d.housingType ?? ""}
            onChange={(v) => set("housingType", v)}
            disabledValues={d.housingStatus === "owner" ? ["apartment"] : []}
          />
        </div>
      </RevealField>

      <RevealField visible={!!d.housingType && !tenant}>
        <div id="q-solarEquipment">
          {label("solarEquipment", Sun)}
          <IconButtonGroup
            options={options(tq, "housing", "solarEquipment", [["exists", Sun], ["in-progress", Hammer], ["none", CircleSlash]])}
            value={d.solarEquipment ?? ""}
            onChange={(v) => set("solarEquipment", v)}
          />
        </div>
      </RevealField>

      <RevealField visible={d.solarEquipment === "none" && !tenant}>
        <div className={notice} role="status">{tq("steps.housing.noPvNote")}</div>
      </RevealField>
    </>
  );
}

/** A bucket picker that can switch to a typed exact value. */
function ExactOrBuckets({ step, field, exactField, unit, icon, allowNa, data, set, tq, tqOpt, pageConfig }: StepProps & {
  step: string;
  field: "pvPower" | "annualConsumption";
  exactField: "pvPowerExact" | "annualConsumptionExact";
  unit: string;
  icon: IconButtonOption["icon"];
  allowNa: boolean;
}) {
  const exact = data[exactField] === true;
  const value = data[field];
  const [raw, setRaw] = useState(exact && typeof value === "number" ? String(value) : "");
  const k = F(step, field);

  return (
    <div id={`q-${field}`}>
      {exact || field === "annualConsumption" ? (
        <>
          <FieldLabel icon={icon} label={tq(`${k}.label`)} tooltip={tqOpt(`${k}.tooltip`)} image={tooltipImageUrl(pageConfig, step, field)} htmlFor={`${field}-exact`} />
          {exact && (
            <div className="flex items-center gap-2">
              <Input
                id={`${field}-exact`}
                inputMode="decimal"
                autoComplete="off"
                value={raw}
                onChange={(e) => { setRaw(e.target.value); set(field, parseDecimal(e.target.value)); }}
                className="max-w-40"
                data-testid={`input-${field}-exact`}
              />
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
          )}
        </>
      ) : (
        <RangeButtonGroup
          value={(value as number | "na" | null) ?? null}
          onChange={(v) => set(field, v)}
          options={buckets(pageConfig, step, field as "pvPower", unit)}
          label={tq(`${k}.label`)}
          naLabel={tq("common.dontKnow")}
          allowNa={allowNa}
          icon={icon}
          tooltip={tqOpt(`${k}.tooltip`)}
          tooltipImage={tooltipImageUrl(pageConfig, step, field)}
          testId={field}
        />
      )}
      <button
        type="button"
        className="text-sm text-primary hover:underline mt-2"
        onClick={() => { setRaw(""); set(exactField, !exact); }}
        data-testid={`toggle-${field}-exact`}
      >
        {exact ? tq(`${k}.hideExact`) : tq(`${k}.showExact`)}
      </button>
      {exact && <p className="text-xs text-muted-foreground mt-1">{tq("common.precisionHint")}</p>}
    </div>
  );
}

export function PvStep(props: StepProps) {
  const { data, set, tq, tqOpt, pageConfig } = props;
  const d = data as Partial<BatteryFields>;
  const sizeAnswered = d.pvPower !== null && d.pvPower !== undefined;

  return (
    <>
      <ExactOrBuckets {...props} step="pv" field="pvPower" exactField="pvPowerExact" unit="kWc" icon={Gauge} allowNa />

      <RevealField visible={sizeAnswered}>
        <div id="q-inverterBrand">
          <FieldLabel icon={Cpu} label={tq(`${F("pv", "inverterBrand")}.label`)} tooltip={tqOpt(`${F("pv", "inverterBrand")}.tooltip`)} image={tooltipImageUrl(pageConfig, "pv", "inverterBrand")} />
          <IconButtonGroup
            options={options(tq, "pv", "inverterBrand", [["solaredge", Cpu], ["fronius", Cpu], ["huawei", Cpu], ["sma", Cpu], ["other", Cpu], ["unknown", HelpCircle]])}
            value={d.inverterBrand ?? ""}
            onChange={(v) => set("inverterBrand", v)}
          />
        </div>
      </RevealField>

      <RevealField visible={!!d.inverterBrand}>
        <div id="q-existingBattery">
          <FieldLabel icon={Battery} label={tq(`${F("pv", "existingBattery")}.label`)} />
          <IconButtonGroup
            options={options(tq, "pv", "existingBattery", [["none", Battery], ["extend", BatteryCharging]])}
            value={d.existingBattery ?? ""}
            onChange={(v) => set("existingBattery", v)}
          />
        </div>
      </RevealField>
    </>
  );
}

export function ConsumptionStep(props: StepProps) {
  const { data, set, tq, tqOpt, pageConfig } = props;
  const d = data as Partial<BatteryFields>;
  const k = (field: string) => F("consumption", field);
  const countDone = d.householdCount != null && (d.householdCount !== 1 || d.householdSize != null);
  const evDone = typeof d.evCount === "number" && (d.evCount === 0 ? !!d.evPlanned : !!d.hasCharger);
  const yesNo = (field: string): IconButtonOption[] => options(tq, "consumption", field, [["yes", Zap], ["no", CircleSlash]]);

  return (
    <>
      <div id="q-householdCount">
        <RangeButtonGroup
          value={d.householdCount ?? null}
          onChange={(v) => set("householdCount", v)}
          options={buckets(pageConfig, "consumption", "householdCount", "")}
          label={tq(`${k("householdCount")}.label`)}
          allowNa={false}
          icon={Users}
          tooltip={tqOpt(`${k("householdCount")}.tooltip`)}
          tooltipImage={tooltipImageUrl(pageConfig, "consumption", "householdCount")}
          testId="householdCount"
        />
      </div>

      <RevealField visible={d.householdCount === 1}>
        <div id="q-householdSize">
          <RangeButtonGroup
            value={d.householdSize ?? null}
            onChange={(v) => set("householdSize", v)}
            options={buckets(pageConfig, "consumption", "householdSize", "")}
            label={tq(`${k("householdSize")}.label`)}
            allowNa={false}
            icon={User}
            testId="householdSize"
          />
        </div>
      </RevealField>

      <RevealField visible={countDone}>
        <ExactOrBuckets {...props} step="consumption" field="annualConsumption" exactField="annualConsumptionExact" unit="kWh" icon={Gauge} allowNa={false} />
      </RevealField>

      <RevealField visible={countDone}>
        <div id="q-heatPump">
          <FieldLabel icon={Thermometer} label={tq(`${k("heatPump")}.label`)} tooltip={tqOpt(`${k("heatPump")}.tooltip`)} />
          <IconButtonGroup options={yesNo("heatPump")} value={d.heatPump ?? ""} onChange={(v) => set("heatPump", v)} />
        </div>
      </RevealField>

      <RevealField visible={!!d.heatPump}>
        <div id="q-evCount">
          <RangeButtonGroup
            value={d.evCount ?? null}
            onChange={(v) => set("evCount", v)}
            options={buckets(pageConfig, "consumption", "evCount", "")}
            label={tq(`${k("evCount")}.label`)}
            allowNa={false}
            icon={Car}
            tooltip={tqOpt(`${k("evCount")}.tooltip`)}
            testId="evCount"
          />
        </div>
      </RevealField>

      <RevealField visible={d.evCount === 0}>
        <div id="q-evPlanned" className="pl-4 border-l-2 border-primary/20">
          <FieldLabel icon={Car} label={tq(`${k("evPlanned")}.label`)} />
          <IconButtonGroup options={yesNo("evPlanned")} value={d.evPlanned ?? ""} onChange={(v) => set("evPlanned", v)} />
        </div>
      </RevealField>

      <RevealField visible={typeof d.evCount === "number" && d.evCount >= 1}>
        <div id="q-hasCharger" className="pl-4 border-l-2 border-primary/20">
          <FieldLabel icon={Plug} label={tq(`${k("hasCharger")}.label`)} />
          <IconButtonGroup options={yesNo("hasCharger")} value={d.hasCharger ?? ""} onChange={(v) => set("hasCharger", v)} />
        </div>
      </RevealField>

      <RevealField visible={evDone}>
        <div id="q-deadline">
          <FieldLabel icon={Clock} label={tq(`${k("deadline")}.label`)} />
          <IconButtonGroup
            options={options(tq, "consumption", "deadline", [["asap", Zap], ["2-3mo", Clock], ["3-6mo", CalendarClock], ["6+mo", CalendarDays]])}
            value={d.deadline ?? ""}
            onChange={(v) => set("deadline", v)}
          />
        </div>
      </RevealField>
    </>
  );
}
```

- [ ] **Step 2: Create `index.ts`**

```ts
import { Home, Sun, Users } from "lucide-react";
import type { ProductFunnel } from "../../types";
import { BATTERY_INITIAL } from "./fields";
import { ConsumptionStep, HousingStep, PvStep } from "./steps";
import { batteryFieldChange, batteryFirstUnanswered, hasNoPv, isTenant } from "./validation";

export const batteryFunnel: ProductFunnel = {
  product: "battery",
  dictPageIds: ["quote-battery", "quote"],
  steps: [
    { id: "housing", icon: Home, Component: HousingStep, exit: isTenant },
    // Skipped only on an explicit "none", so the progress bar does not grow
    // by two steps after the first answer.
    { id: "pv", icon: Sun, Component: PvStep, skip: hasNoPv },
    { id: "consumption", icon: Users, Component: ConsumptionStep, skip: hasNoPv },
  ],
  initialData: { ...BATTERY_INITIAL },
  firstUnansweredField: batteryFirstUnanswered,
  applyChange: batteryFieldChange,
};
```

- [ ] **Step 3: Register it** — in `src/components/quote-shell/funnels.ts`:

```ts
import { batteryFunnel } from "./products/battery";
```
```ts
export const FUNNELS: Partial<Record<Product, ProductFunnel>> = { battery: batteryFunnel };
```

- [ ] **Step 4: Lint, type-check, test, build**

Run: `npm run lint && npx tsc --noEmit -p . && npm test && npm run build`
Expected: all pass. If `tsc` flags a lucide icon name as missing, replace it with `CircleHelp` (for `HelpCircle`) or `Battery` and note it in the commit body.

- [ ] **Step 5: Commit**

```bash
git add src/components/quote-shell/
git commit -m "feat(battery): écrans du funnel batterie (logement, installation, consommation)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Route the battery funnel and its success page

**Files:**
- Modify: `src/lib/route-resolver.ts`
- Modify: `src/app/[lang]/[slug]/page.tsx` (funnel rendering, dictionary fallback)
- Modify: `src/app/[lang]/[slug]/[sub1]/page.tsx` (success page per product, submission view dictionaries)
- Modify: `src/components/GoogleAdsConversion.tsx` (`nd=1` guard)
- Test: `src/lib/route-resolver.test.ts` (create)

**Interfaces:**
- Consumes: `isFunnelRoute`, `FUNNEL_ROUTES`, `successPageIds`, `viewPageIds` (Task 2); `QuoteShell` (Task 9).
- Produces:
  - `SlugRoute` quote variant: `{ type: "quote"; routeId: string; entry: PageRegistryEntry; product: Product }`
  - `Sub1Route` success variant: `{ type: "quote-success"; quoteEntry: PageRegistryEntry; product: Product }`
  - `QuoteSuccess` receives `product: Product` and `dictPageIds: string[]` (wired in Task 12)

- [ ] **Step 1: Write the failing tests** — create `src/lib/route-resolver.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { PageRegistryEntry } from "./directus-queries";

vi.mock("./directus-queries", () => ({
  fetchPageRegistry: vi.fn(async () => [
    { id: "quote", slugs: { fr: "demande-devis", de: "offertenanfrage" } },
    { id: "quote-battery", slugs: { fr: "devis-batterie-solaire", de: "offerte-solarbatterie" } },
    { id: "contact", slugs: { fr: "contact", de: "kontakt" } },
  ] as unknown as PageRegistryEntry[]),
}));

const UUID = "0b5e1f3c-1234-4abc-9def-0123456789ab";

describe("funnel routes", () => {
  it("resolves both funnel pages with their product", async () => {
    const { resolveSlugRoute } = await import("./route-resolver");
    expect(await resolveSlugRoute("demande-devis", "fr")).toMatchObject({ type: "quote", product: "ecp" });
    expect(await resolveSlugRoute("offerte-solarbatterie", "de")).toMatchObject({ type: "quote", product: "battery" });
    expect(await resolveSlugRoute("contact", "fr")).toMatchObject({ type: "contact" });
  });

  it("resolves the battery confirmation and submission pages", async () => {
    const { resolveSub1Route } = await import("./route-resolver");
    expect(await resolveSub1Route("devis-batterie-solaire", "confirmation", "fr")).toMatchObject({ type: "quote-success", product: "battery" });
    expect(await resolveSub1Route("devis-batterie-solaire", UUID, "fr")).toMatchObject({ type: "quote-submission", submissionId: UUID });
    expect(await resolveSub1Route("demande-devis", "confirmation", "fr")).toMatchObject({ type: "quote-success", product: "ecp" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/route-resolver.test.ts`
Expected: FAIL — the battery slug resolves to a CMS page; no `product` on routes.

- [ ] **Step 3: Update the resolver** — in `src/lib/route-resolver.ts`:

Add the import:

```ts
import { FUNNEL_ROUTES, isFunnelRoute, type Product } from "./products";
```

Change the two route types:

```ts
  | { type: "quote"; routeId: string; entry: PageRegistryEntry; product: Product }
```
```ts
  | { type: "quote-success"; quoteEntry: PageRegistryEntry; product: Product }
```

In `resolveSlugRoute`, replace the `INTERACTIVE_PAGES` block:

```ts
  if (isFunnelRoute(entry.id)) {
    return { type: "quote", routeId: entry.id, entry, product: FUNNEL_ROUTES[entry.id] };
  }
  if (entry.id === "contact") {
    return { type: "contact", routeId: entry.id, entry };
  }
```

In `resolveSub1Route`, replace `if (entry.id === "quote") {` and its body:

```ts
  if (isFunnelRoute(entry.id)) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(sub1)) {
      return { type: "quote-submission", submissionId: sub1, quoteEntry: entry };
    }
    return { type: "quote-success", quoteEntry: entry, product: FUNNEL_ROUTES[entry.id] };
  }
```

- [ ] **Step 4: Run the resolver tests**

Run: `npx vitest run src/lib/route-resolver.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the shell** — in `src/app/[lang]/[slug]/page.tsx`:

Add imports:

```ts
import { FUNNEL_ROUTES, isFunnelRoute } from "@/lib/products";
import { QuoteShell } from "@/components/quote-shell/QuoteShell";
```

Replace the dictionary construction (`const pageDict = …; const dictionary = { ...layoutDict, ...pageDict };`) with:

```ts
  const pageDict = extractPageDictionary(entry.id, page, locale);
  // A non-charger funnel reads the charger page's keys for its shared steps
  // (contact, finalize, navigation). Merged before the SLA interpolation below.
  const fallbackPage = isFunnelRoute(entry.id) && entry.id !== "quote" ? await fetchPage("quote", locale) : null;
  const fallbackDict = fallbackPage ? extractPageDictionary("quote", fallbackPage, locale) : {};
  const dictionary = { ...layoutDict, ...fallbackDict, ...pageDict };
```

Change `if (INTERACTIVE_PAGES.has(entry.id)) {` to `if (INTERACTIVE_PAGES.has(entry.id) || isFunnelRoute(entry.id)) {`, change `if (entry.id === "quote") {` to `if (isFunnelRoute(entry.id)) {`, and replace its `return (<QuoteForm … />);` with:

```tsx
      const product = FUNNEL_ROUTES[entry.id];
      if (product !== "ecp") {
        return (
          <QuoteShell
            product={product}
            lang={lang}
            dictionary={dictionary}
            quoteSlug={slug}
            logoSrc={logoSrc}
            logoDarkSrc={logoDarkSrc}
            heroImage={quoteHeroImage}
            pageConfig={quotePageConfig}
            globalConfig={globalConfig}
            pageRegistry={registry}
          />
        );
      }
      return (
        <QuoteForm
          lang={lang}
          dictionary={dictionary}
          quoteSlug={slug}
          logoSrc={logoSrc}
          logoDarkSrc={logoDarkSrc}
          heroImage={quoteHeroImage}
          pageConfig={quotePageConfig}
          globalConfig={globalConfig}
          pageRegistry={registry}
        />
      );
```

Run: `grep -n 'entry.id === "quote"' 'src/app/[lang]/[slug]/page.tsx'`
Expected: no output. If `generateMetadata` in this file special-cases `"quote"`, extend that test with `isFunnelRoute(entry.id)` the same way.

- [ ] **Step 6: Success page per product** — in `src/app/[lang]/[slug]/[sub1]/page.tsx`, add `import { successPageIds, viewPageIds } from "@/lib/products";` and replace the opening of the `quote-success` branch (from `const [quotePage, layoutData, registry] = await Promise.all([` through `: {};` of the dictionary) with:

```ts
    const pageIds = successPageIds(route.product);
    const [pages, layoutData, registry] = await Promise.all([
      Promise.all(pageIds.map((id) => fetchPage(id, locale))),
      fetchLayout(locale),
      fetchPageRegistry(),
    ]);
    // Charger page first, product page last: the product's own copy wins.
    const dictionary: Record<string, string> = Object.assign(
      {},
      ...pages.map((p, i) => (p ? extractPageDictionary(pageIds[i], p, locale) : {})).reverse(),
    );
    // Hero and CTAs come from the most specific page that exists.
    const quotePage = pages.find(Boolean);
```

(the existing `const heroBlock = quotePage?.blocks?.find(…)` lines below keep working). Replace the Ads lines:

```ts
    const adsConversionSendTo = adsSendTo(googleAds, "quote_submit", route.product);
```

and delete the `NOTE: quote-success doesn't know which product's funnel it terminates` comment. Pass the two new props to `QuoteSuccessClient`:

```tsx
          product={route.product}
          dictPageIds={pageIds}
```

- [ ] **Step 7: Submission view dictionaries** — in the `quote-submission` branch, replace the fetch and dictionary lines with:

```ts
    // Partner links always use the charger slug; the view picks its sections
    // from submission.product, so both products' copy is loaded.
    const formIds = ["quote", "quote-battery"];
    const viewIds = [...viewPageIds("battery")].reverse(); // quote-view, then quote-battery-view
    const [formPages, viewPages, layoutData] = await Promise.all([
      Promise.all(formIds.map((id) => fetchPage(id, locale))),
      Promise.all(viewIds.map((id) => fetchPage(id, locale))),
      fetchLayout(locale),
    ]);
    const dictionary: Record<string, string> = Object.assign(
      {},
      ...formPages.map((p, i) => (p ? extractPageDictionary(formIds[i], p, locale) : {})),
      ...viewPages.map((p, i) => (p ? extractPageDictionary(viewIds[i], p, locale) : {})),
    );
    const quotePage = formPages[0];
```

(keep `quoteConfig={quotePage?.config || {}}` as it is).

- [ ] **Step 8: Ads fallback skips non-dispatchable leads** — in `src/components/GoogleAdsConversion.tsx`:

```ts
  const submissionId = searchParams.get("submissionId") || undefined;
  // nd=1: the lead is stored but never dispatched (battery visitor without PV).
  const notALead = searchParams.get("nd") === "1";

  useEffect(() => {
    if (!sendTo || notALead) return;
```

and add `notALead` to the effect's dependency array: `}, [sendTo, submissionId, notALead]);`.

- [ ] **Step 9: Type-check (QuoteSuccess props land in Task 12) and run the tests**

Run: `npx vitest run src/lib && npx tsc --noEmit -p . 2>&1 | grep -v "QuoteSuccess" | head`
Expected: tests PASS; the only type errors left are the two unknown props `product` / `dictPageIds` on `QuoteSuccessClient`. Do not commit yet: Task 12 makes them real and commits both tasks together.

---

### Task 12: Success page cross-sell (`show_when`)

**Files:**
- Create: `src/lib/cta-conditions.ts`
- Modify: `src/components/quote/QuoteSuccess.tsx`
- Test: `src/lib/cta-conditions.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface CtaCondition { field: string; in?: Array<string | number>; gte?: number }`
  - `matchesShowWhen(showWhen: unknown, data: Record<string, unknown> | null): boolean`
  - `QuoteSuccess` props add `product: Product`, `dictPageIds: string[]`; `ctas[].show_when?: unknown`

`show_when` formats, as stored in the Directus CTA JSON:
- a list of conditions, all must hold: `[{ "field": "solarEquipment", "in": ["exists", "in-progress"] }, { "field": "homeBattery", "in": ["none"] }]`
- `{ "any": [[…], […]] }`: at least one group holds, each group a list as above.

- [ ] **Step 1: Write the failing tests** — create `src/lib/cta-conditions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchesShowWhen } from "./cta-conditions";

const chargerToBattery = [
  { field: "solarEquipment", in: ["exists", "in-progress"] },
  { field: "homeBattery", in: ["none"] },
];
const batteryToCharger = {
  any: [
    [{ field: "evCount", gte: 1 }, { field: "hasCharger", in: ["no"] }],
    [{ field: "evPlanned", in: ["yes"] }],
  ],
};

describe("matchesShowWhen", () => {
  it("always shows a CTA without a condition", () => {
    expect(matchesShowWhen(undefined, null)).toBe(true);
    expect(matchesShowWhen(null, { a: 1 })).toBe(true);
  });

  it("requires every condition of a list", () => {
    expect(matchesShowWhen(chargerToBattery, { solarEquipment: "exists", homeBattery: "none" })).toBe(true);
    expect(matchesShowWhen(chargerToBattery, { solarEquipment: "exists", homeBattery: "exists" })).toBe(false);
    expect(matchesShowWhen(chargerToBattery, { solarEquipment: "none", homeBattery: "none" })).toBe(false);
  });

  it("accepts any group of an `any` condition", () => {
    expect(matchesShowWhen(batteryToCharger, { evCount: 2, hasCharger: "no" })).toBe(true);
    expect(matchesShowWhen(batteryToCharger, { evCount: 2, hasCharger: "yes" })).toBe(false);
    expect(matchesShowWhen(batteryToCharger, { evCount: 0, evPlanned: "yes" })).toBe(true);
    expect(matchesShowWhen(batteryToCharger, { evCount: 0, evPlanned: "no" })).toBe(false);
  });

  it("compares `gte` on numbers only", () => {
    expect(matchesShowWhen([{ field: "evCount", gte: 1 }], { evCount: "2" })).toBe(false);
  });

  it("hides a conditional CTA while the lead data is unknown (fetch pending or failed)", () => {
    expect(matchesShowWhen(chargerToBattery, null)).toBe(false);
  });

  it("hides a CTA whose condition is malformed (Review Focus 5)", () => {
    expect(matchesShowWhen({ field: "x", in: ["y"] }, { x: "y" })).toBe(false);
    expect(matchesShowWhen([], { x: "y" })).toBe(false);
    expect(matchesShowWhen([{ field: "x" }], { x: "y" })).toBe(false);
    expect(matchesShowWhen([{ in: ["y"] }], { x: "y" })).toBe(false);
    expect(matchesShowWhen({ any: [] }, { x: "y" })).toBe(false);
    expect(matchesShowWhen({ any: [[{ field: "x", in: ["y"] }], "garbage"] }, { x: "y" })).toBe(false);
    expect(matchesShowWhen("x == y", { x: "y" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/cta-conditions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `src/lib/cta-conditions.ts`:

```ts
/**
 * Conditions on a success-page CTA, evaluated against the submission data.
 * Stored in Directus as `show_when` on each CTA:
 *   - a list of conditions, all must hold;
 *   - `{ any: [list, list, …] }`, at least one list must hold.
 * A malformed condition hides the CTA: a cross-sell shown to the wrong lead
 * costs more than one not shown.
 */
export interface CtaCondition {
  field: string;
  in?: Array<string | number>;
  gte?: number;
}

type Data = Record<string, unknown>;

function isCondition(c: unknown): c is CtaCondition {
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  const o = c as Record<string, unknown>;
  if (typeof o.field !== "string" || !o.field) return false;
  return Array.isArray(o.in) || typeof o.gte === "number";
}

function holds(c: CtaCondition, data: Data): boolean {
  const v = data[c.field];
  if (c.in && !c.in.some((x) => x === v)) return false;
  if (typeof c.gte === "number" && !(typeof v === "number" && v >= c.gte)) return false;
  return true;
}

/** true / false for a well-formed list, null for a malformed one. */
function allHold(list: unknown, data: Data): boolean | null {
  if (!Array.isArray(list) || list.length === 0 || !list.every(isCondition)) return null;
  return list.every((c) => holds(c, data));
}

export function matchesShowWhen(showWhen: unknown, data: Data | null): boolean {
  if (showWhen === undefined || showWhen === null) return true;
  if (!data) return false;
  if (Array.isArray(showWhen)) return allHold(showWhen, data) === true;
  if (typeof showWhen === "object" && Array.isArray((showWhen as { any?: unknown }).any)) {
    const groups = (showWhen as { any: unknown[] }).any;
    if (groups.length === 0) return false;
    const results = groups.map((g) => allHold(g, data));
    if (results.some((r) => r === null)) return false;
    return results.some((r) => r === true);
  }
  return false;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/cta-conditions.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into `QuoteSuccess`** — in `src/components/quote/QuoteSuccess.tsx`:

Imports:

```ts
import { matchesShowWhen } from "@/lib/cta-conditions";
import type { Product } from "@/lib/products";
```

Props: add `show_when?: unknown;` to the CTA item type, and

```ts
  product: Product;
  /** Directus pages holding this page's copy, most specific first. */
  dictPageIds: string[];
```

to `QuoteSuccessProps`; destructure `product` and `dictPageIds`.

Replace the `d` helper with a lookup across the page ids:

```ts
  const d = (key: string, vars?: Record<string, string | number>) => {
    let val = "";
    for (const id of dictPageIds) {
      const v = dictionary[`pages.${id}.${key}`];
      if (v) { val = v; break; }
    }
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        val = val.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return val;
  };
```

and drop the `pages.quote-success.` prefix from every `d(…)` call in the file: `d("blocks.hero.headline", …)`, `d("blocks.hero.subheadline", …)`, `d("blocks.hero.body", …)`, ``d(`blocks.hero.cta.${i}.label`)``.

Add `product` to the `quote_success_viewed` event properties: `{ form_type: "quote", product, locale: lang, submission_id: submissionId }` (and to its effect's dependency array).

Fetch the lead data only when a CTA needs it, then filter:

```ts
  const needsLeadData = ctas.some((c) => c.show_when !== undefined && c.show_when !== null);
  const [leadData, setLeadData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!needsLeadData || !submissionId) return;
    let cancelled = false;
    fetch(`/api/form-submissions/${submissionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const data = json?.data?.submission?.data;
        if (!cancelled && data && typeof data === "object") setLeadData(data as Record<string, unknown>);
      })
      .catch(() => { /* conditional CTAs stay hidden */ });
    return () => { cancelled = true; };
  }, [needsLeadData, submissionId]);

  // Keep each CTA's original index: its label key is cta.<index>.label.
  const visibleCtas = ctas
    .map((cta, i) => ({ cta, i }))
    .filter(({ cta }) => matchesShowWhen(cta.show_when, leadData));
```

In the JSX, replace `{ctas.length > 0 && (` with `{visibleCtas.length > 0 && (` and `{ctas.map((cta, i) => (` with `{visibleCtas.map(({ cta, i }) => (`. (`matchesShowWhen` returns true for CTAs without `show_when`, so they render immediately.)

- [ ] **Step 6: Lint, type-check, test, build**

Run: `npm run lint && npx tsc --noEmit -p . && npm test && npm run build`
Expected: all pass (Task 11's two pending prop errors are now resolved).

- [ ] **Step 7: Commit Tasks 11 and 12 together**

```bash
git add src/lib/route-resolver.ts src/lib/route-resolver.test.ts 'src/app/[lang]/[slug]/page.tsx' 'src/app/[lang]/[slug]/[sub1]/page.tsx' src/components/GoogleAdsConversion.tsx src/lib/cta-conditions.ts src/lib/cta-conditions.test.ts src/components/quote/QuoteSuccess.tsx
git commit -m "feat(battery): routage du funnel, page de succès par produit et CTA croisés conditionnels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Submission view shows battery answers

Partners open every lead through `/{lang}/demande-devis/{id}?view=partner`. The view hardcodes the charger sections; for a battery lead it must show the battery answers.

**Files:**
- Create: `src/components/quote/SubmissionFields.tsx` (moved `Field` and `Section`)
- Create: `src/components/quote/BatterySubmissionSections.tsx`
- Modify: `src/components/quote/QuoteSubmissionView.tsx`

**Interfaces:**
- Consumes: `BATTERY_BUCKETS` (Task 8).
- Produces: `Field`, `Section` exported from `SubmissionFields.tsx`; `BatterySubmissionSections({ fd, tb, yes, no, dontKnow, printSections })`.

- [ ] **Step 1: Move `Field` and `Section`.** Create `src/components/quote/SubmissionFields.tsx` with `"use client";`, the imports these two components use (`useState` from react; `Card, CardContent, CardHeader, CardTitle` from `@/components/ui/card`; `Collapsible, CollapsibleContent, CollapsibleTrigger` from `@/components/ui/collapsible`; `InfoTooltip` from `@/components/ui/info-tooltip`; `ChevronDown` from lucide-react), and the two functions `Field` and `Section` cut verbatim from `QuoteSubmissionView.tsx` (the block under `// ---------- Sub-components ----------`), each prefixed with `export`. In `QuoteSubmissionView.tsx`, delete the two functions and add `import { Field, Section } from "./SubmissionFields";`. Remove imports that become unused there (`npm run lint` lists them).

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: pass. Nothing changes visually.

- [ ] **Step 2: Create `BatterySubmissionSections.tsx`**

```tsx
"use client";

import { Field, Section } from "./SubmissionFields";
import { BATTERY_BUCKETS } from "@/components/quote-shell/products/battery/buckets";

interface Props {
  fd: Record<string, unknown>;
  /** pages.quote-battery.<key>, "" when missing */
  tb: (key: string) => string;
  yes: string;
  no: string;
  dontKnow: string;
  printSections: Record<string, boolean>;
}

const DASH = "—";

function withUnit(n: number, unit: string) {
  return unit ? `${n.toLocaleString("fr-CH")} ${unit}` : n.toLocaleString("fr-CH");
}

function bucketLabel(field: keyof typeof BATTERY_BUCKETS, v: unknown, unit: string, dontKnow: string): string {
  if (v === "na") return dontKnow;
  if (typeof v !== "number") return DASH;
  const b = BATTERY_BUCKETS[field].find((x) => x.value === v);
  return b ? b.label.replace("{u}", unit ? ` ${unit}` : "") : withUnit(v, unit);
}

export function BatterySubmissionSections({ fd, tb, yes, no, dontKnow, printSections }: Props) {
  const opt = (path: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return DASH;
    if (v === true) return yes;
    if (v === false) return no;
    return tb(`${path}.options.${v}`) || String(v);
  };
  const label = (path: string, fallback: string) => tb(`${path}.label`) || fallback;
  const H = "steps.housing.fields";
  const P = "steps.pv.fields";
  const C = "steps.consumption.fields";

  const pvPower = fd.pvPowerExact && typeof fd.pvPower === "number"
    ? withUnit(fd.pvPower, "kWc")
    : bucketLabel("pvPower", fd.pvPower, "kWc", dontKnow);
  const evCount = typeof fd.evCount === "number" ? fd.evCount : null;

  return (
    <>
      <Section title={tb("steps.housing.title") || "Logement"} printVisible={printSections.housing}>
        <Field label={label(`${H}.housingStatus`, "Statut")} value={opt(`${H}.housingStatus`, fd.housingStatus)} />
        <Field label={label(`${H}.housingType`, "Type de logement")} value={opt(`${H}.housingType`, fd.housingType)} />
        <Field label={label(`${H}.solarEquipment`, "Installation solaire")} value={opt(`${H}.solarEquipment`, fd.solarEquipment)} />
      </Section>

      <Section title={tb("steps.pv.title") || "Installation solaire"} printVisible={printSections.installation}>
        <Field label={label(`${P}.pvPower`, "Puissance")} value={pvPower} />
        <Field label={label(`${P}.inverterBrand`, "Onduleur")} value={opt(`${P}.inverterBrand`, fd.inverterBrand)} />
        <Field label={label(`${P}.existingBattery`, "Batterie existante")} value={opt(`${P}.existingBattery`, fd.existingBattery)} />
      </Section>

      <Section title={tb("steps.consumption.title") || "Consommation"} printVisible={printSections.consumption}>
        <Field label={label(`${C}.householdCount`, "Ménages")} value={bucketLabel("householdCount", fd.householdCount, "", dontKnow)} />
        {fd.householdCount === 1 && (
          <Field label={label(`${C}.householdSize`, "Personnes")} value={bucketLabel("householdSize", fd.householdSize, "", dontKnow)} />
        )}
        {fd.annualConsumptionExact === true && typeof fd.annualConsumption === "number" && (
          <Field label={label(`${C}.annualConsumption`, "Consommation annuelle")} value={withUnit(fd.annualConsumption, "kWh")} />
        )}
        <Field label={label(`${C}.heatPump`, "Pompe à chaleur")} value={opt(`${C}.heatPump`, fd.heatPump)} />
        <Field label={label(`${C}.evCount`, "Véhicules électriques")} value={bucketLabel("evCount", fd.evCount, "", dontKnow)} />
        {evCount === 0 && <Field label={label(`${C}.evPlanned`, "Véhicule prévu")} value={opt(`${C}.evPlanned`, fd.evPlanned)} />}
        {evCount !== null && evCount >= 1 && <Field label={label(`${C}.hasCharger`, "Borne existante")} value={opt(`${C}.hasCharger`, fd.hasCharger)} />}
        <Field label={label(`${C}.deadline`, "Délai")} value={opt(`${C}.deadline`, fd.deadline)} />
      </Section>
    </>
  );
}
```

- [ ] **Step 3: Branch the view on the product** — in `QuoteSubmissionView.tsx`:

Add `import { BatterySubmissionSections } from "./BatterySubmissionSections";`.

Replace the `sectionIds` constant and the `printSections` state initialiser:

```ts
  const ECP_SECTION_IDS = ["metadata", "contact", "housing", "parking", "charger", "vehicle", "finalize"] as const;
  const BATTERY_SECTION_IDS = ["metadata", "contact", "housing", "installation", "consumption", "finalize"] as const;
  const [printSections, setPrintSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries([...ECP_SECTION_IDS, ...BATTERY_SECTION_IDS].map((id) => [id, true])),
  );
```

After the line where the fetched data is available as `data` (the `SubmissionData` state), derive:

```ts
  const isBattery = data?.submission?.product === "battery";
  const sectionIds = isBattery ? BATTERY_SECTION_IDS : ECP_SECTION_IDS;
  const tb = (key: string) => dictionary[`pages.quote-battery.${key}`] ?? "";
```

(the print-settings list keeps iterating `sectionIds`, now product-aware).

Wrap the four charger sections — from `{/* 3. Housing */}` through the closing `</Section>` of `{/* 6. Vehicle */}` — in:

```tsx
          {isBattery ? (
            <BatterySubmissionSections
              fd={fd}
              tb={tb}
              yes={tCommon("yes", "Oui")}
              no={tCommon("no", "Non")}
              dontKnow={tq("common.dontKnow") || tCommon("dontKnow", "Je ne sais pas")}
              printSections={printSections}
            />
          ) : (
            <>
              {/* the four existing charger sections, unchanged */}
            </>
          )}
```

where the fragment holds the existing JSX, moved as-is.

- [ ] **Step 4: Lint, type-check, test, build**

Run: `npm run lint && npx tsc --noEmit -p . && npm test && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/quote/SubmissionFields.tsx src/components/quote/BatterySubmissionSections.tsx src/components/quote/QuoteSubmissionView.tsx
git commit -m "feat(battery): la vue de la demande affiche les réponses batterie aux partenaires

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Directus content, partner configuration and docs

Every Directus write goes through the easyrecharge MCP (`mcp__easyrecharge__directus_*`) and needs Yoan's explicit go on the shown payload. JSON fields are sent whole.

**Files:**
- Create: `docs/directus-templates/quote-battery-content.md` (the reviewed copy, fr + de)
- Modify: `CLAUDE.md` (route table, key components), `docs/operations/partner-dispatch.md` (category table)

- [ ] **Step 1: Read the shapes to mirror.** With `mcp__easyrecharge__directus_query`, read the `pages` item whose `route_id` is `quote` (fields `*,translations.*,blocks.*`) and the one whose `route_id` is `quote-success`. Note: the translations field holding the nested copy, the slug field, the `languages_code` values (`fr-FR`, `de-DE`), and how the success hero CTAs are stored (`block_hero` translations `ctas`). Also find which partner page holds `category.owner_solar` and `score.factors.ownership` (query `pages` with `route_id` in `partner-leads`, `partner-invoices`).

- [ ] **Step 2: Write `docs/directus-templates/quote-battery-content.md`** with the copy below as two nested JSON objects (fr-FR, de-DE) shaped like the `quote` page's translation content. German is a working translation to be proofread by a native speaker before production (same rule as `docs/home-direction-b-contenu.md`).

| Key | fr | de |
|---|---|---|
| `welcome.title` | Une batterie pour votre installation solaire | Ein Speicher für Ihre Solaranlage |
| `welcome.subtitle` | Un installateur vous contacte sous {first_contact} h. | Ein Installateur meldet sich innert {first_contact} Std. |
| `welcome.stats.installations.label` | installations réalisées | realisierte Installationen |
| `welcome.stats.rating.label` | note Trustpilot | Trustpilot-Bewertung |
| `welcome.usps.certified` | Installateurs certifiés en Suisse romande | Zertifizierte Installateure |
| `welcome.usps.fast` | Devis chiffré en {quote_delivery_timeline} jours | Detailliertes Angebot in {quote_delivery_timeline} Tagen |
| `welcome.usps.transparent` | Sans engagement | Unverbindlich |
| `welcome.cta` | Commencer | Starten |
| `navigation.home` | Retour à l'accueil | Zur Startseite |
| `common.dontKnow` | Je ne sais pas | Weiss ich nicht |
| `common.precisionHint` | Plus l'indication est précise, plus le calcul l'est. | Je genauer die Angabe, desto genauer die Berechnung. |
| `steps.housing.title` | Votre logement | Ihr Zuhause |
| `steps.housing.fields.housingStatus.label` | Vous êtes | Sie sind |
| `…housingStatus.options.owner` / `co-owner` / `tenant` | Propriétaire / Copropriétaire / Locataire | Eigentümer / Stockwerkeigentümer / Mieter |
| `steps.housing.fields.housingType.label` | Type de logement | Wohnform |
| `…housingType.options.house` / `apartment` | Maison / Appartement | Haus / Wohnung |
| `steps.housing.fields.solarEquipment.label` | Installation solaire | Solaranlage |
| `…solarEquipment.options.exists` / `in-progress` / `none` | En service / En cours de pose / Pas encore | In Betrieb / Im Bau / Noch keine |
| `steps.housing.tenantExit` | Une batterie se décide avec le propriétaire du bâtiment. Parlez-lui de ce projet : il pourra faire sa demande ici. | Ein Speicher wird mit dem Eigentümer entschieden. Sprechen Sie mit ihm: Er kann seine Anfrage hier stellen. |
| `steps.housing.noPvNote` | Une batterie se dimensionne avec une installation solaire. Laissez-nous vos coordonnées : nous reviendrons vers vous pour un projet solaire avec batterie. | Ein Speicher wird zusammen mit einer Solaranlage geplant. Hinterlassen Sie Ihre Kontaktdaten: Wir melden uns für ein Solarprojekt mit Speicher. |
| `steps.pv.title` | Votre installation solaire | Ihre Solaranlage |
| `steps.pv.fields.pvPower.label` | Puissance de l'installation | Leistung der Anlage |
| `steps.pv.fields.pvPower.tooltip` | Indiquée en kWc sur l'offre de votre installateur ou dans l'application de votre onduleur. | In kWp auf der Offerte Ihres Installateurs oder in der App Ihres Wechselrichters. |
| `steps.pv.fields.pvPower.showExact` / `hideExact` | Je connais la puissance exacte / Choisir une tranche | Ich kenne die genaue Leistung / Bereich wählen |
| `steps.pv.fields.inverterBrand.label` | Marque de l'onduleur | Marke des Wechselrichters |
| `steps.pv.fields.inverterBrand.tooltip` | Le boîtier qui convertit le courant des panneaux. Sa marque figure dessus et dans l'application de suivi. | Das Gerät, das den Strom der Module umwandelt. Die Marke steht darauf und in der Monitoring-App. |
| `…inverterBrand.options.solaredge` / `fronius` / `huawei` / `sma` / `other` / `unknown` | SolarEdge / Fronius / Huawei / SMA / Autre / Je ne sais pas | SolarEdge / Fronius / Huawei / SMA / Andere / Weiss ich nicht |
| `steps.pv.fields.existingBattery.label` | Batterie actuelle | Bestehender Speicher |
| `…existingBattery.options.none` / `extend` | Aucune / Oui, à agrandir | Keiner / Ja, zu erweitern |
| `steps.consumption.title` | Votre consommation | Ihr Verbrauch |
| `steps.consumption.fields.householdCount.label` | Ménages sur cette installation | Haushalte an dieser Anlage |
| `steps.consumption.fields.householdCount.tooltip` | Plusieurs ménages partagent la même installation dans une PPE ou un regroupement de consommation propre. | Mehrere Haushalte teilen sich eine Anlage im Stockwerkeigentum oder in einem ZEV. |
| `steps.consumption.fields.householdSize.label` | Personnes dans le ménage | Personen im Haushalt |
| `steps.consumption.fields.annualConsumption.label` | Consommation annuelle | Jahresverbrauch |
| `steps.consumption.fields.annualConsumption.showExact` / `hideExact` | Je connais ma consommation annuelle / Je ne la connais pas | Ich kenne meinen Jahresverbrauch / Ich kenne ihn nicht |
| `steps.consumption.fields.heatPump.label` | Pompe à chaleur | Wärmepumpe |
| `…heatPump.options.yes` / `no` | Oui / Non | Ja / Nein |
| `steps.consumption.fields.evCount.label` | Véhicules électriques rechargés sur cette installation | Elektroautos, die an dieser Anlage laden |
| `steps.consumption.fields.evPlanned.label` | Un véhicule électrique est-il prévu ? | Ist ein Elektroauto geplant? |
| `…evPlanned.options.yes` / `no` | Oui / Non | Ja / Nein |
| `steps.consumption.fields.hasCharger.label` | Avez-vous déjà une borne de recharge ? | Haben Sie bereits eine Ladestation? |
| `…hasCharger.options.yes` / `no` | Oui / Non | Ja / Nein |
| `steps.consumption.fields.deadline.label` | Quand souhaitez-vous installer la batterie ? | Wann möchten Sie den Speicher installieren? |
| `…deadline.options.asap` / `2-3mo` / `3-6mo` / `6+mo` | Dès que possible / Dans 2 à 3 mois / Dans 3 à 6 mois / Plus tard | So bald wie möglich / In 2–3 Monaten / In 3–6 Monaten / Später |
| `steps.finalize.fields.approval.co-owner.label` | Avez-vous l'accord de la copropriété pour ce projet ? | Hat die Stockwerkeigentümergemeinschaft dem Projekt zugestimmt? |

Partner dashboard keys (same page as `category.owner_solar`, both languages):

| Key | fr | de |
|---|---|---|
| `category.owner_pv_small` | Propriétaire · PV < 10 kWc | Eigentümer · PV < 10 kWp |
| `category.owner_pv_large` | Propriétaire · PV ≥ 10 kWc | Eigentümer · PV ≥ 10 kWp |
| `category.co_owner_pv_small` | Copropriétaire · PV < 10 kWc | Stockwerkeigentümer · PV < 10 kWp |
| `category.co_owner_pv_large` | Copropriétaire · PV ≥ 10 kWc | Stockwerkeigentümer · PV ≥ 10 kWp |
| `category.no_pv` | Sans installation solaire | Ohne Solaranlage |
| `score.factors.pv_size` | Taille de l'installation | Anlagengrösse |
| `score.factors.load` | Véhicules et pompe à chaleur | Fahrzeuge und Wärmepumpe |

Submission view (`quote-view` page, both languages): `sections.installation.title` = Installation solaire / Solaranlage; `sections.consumption.title` = Consommation / Verbrauch.

Commit the file:

```bash
git add docs/directus-templates/quote-battery-content.md
git commit -m "docs(battery): textes du funnel batterie à charger dans Directus (fr, de de travail)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Ask Yoan to review the copy and the slugs** (`devis-batterie-solaire` / `offerte-solarbatterie`). Apply his edits to the file before any write.

- [ ] **Step 4: Create the pages (after the go).** Using the shapes from Step 1:
  - `pages` item `route_id = "quote-battery"`, published, slugs from Step 3, translation content from the file, `config = { "product": "battery", "steps": [] }`.
  - `pages` item `route_id = "quote-battery-success"`, published, with a `block_hero` whose translations hold the charger success copy adapted to the battery and one CTA per language:
    `{ "label": "Une borne pour vos véhicules ?", "variant": "outline", "page_route_id": "quote", "show_when": { "any": [[{ "field": "evCount", "gte": 1 }, { "field": "hasCharger", "in": ["no"] }], [{ "field": "evPlanned", "in": ["yes"] }]] } }` (de label: "Eine Ladestation für Ihre Fahrzeuge?").
  - On the existing `quote-success` page, append to each language's `ctas` (send the whole array):
    `{ "label": "Combien pourriez-vous stocker ?", "variant": "outline", "page_route_id": "quote-battery", "show_when": [{ "field": "solarEquipment", "in": ["exists", "in-progress"] }, { "field": "homeBattery", "in": ["none"] }] }` (de label: "Wie viel könnten Sie speichern?").
  - Add the partner dashboard keys and the two `quote-view` section titles to their pages, sending each translation's content object whole.

- [ ] **Step 5: Partner configuration (after the go).** Ask Yoan for the CHF price of each battery category per pricing policy, then write `settings.prices.battery = { "owner_pv_small": …, "owner_pv_large": …, "co_owner_pv_small": …, "co_owner_pv_large": … }` into each policy, sending `settings` whole. `no_pv` gets no price (never dispatched). Partners that should receive battery leads need `partner_areas` for their cantons as for the charger (`docs/operations/partner-dispatch.md`, "Adding a partner").

- [ ] **Step 6: Google Ads (after Yoan creates the conversion actions in Google Ads).** Write `global_config.google_ads.conversions.battery = { "quote_start": { "label": "<label>" }, "quote_submit": { "label": "<label>" } }` with the labels he provides, sending `global_config.google_ads` whole. Until then the keys stay absent and conversions are inert by design.

- [ ] **Step 7: Make (Yoan, outside the repo).** Hand him this checklist: route the partner e-mail on `product = battery` to a battery template (fields: pvPower, pvPowerExact, inverterBrand, existingBattery, householdCount, householdSize, annualConsumption, heatPump, evCount, evPlanned, hasCharger, deadline); map `battery` to its Ads conversion action; check that the visitor confirmation e-mail fires when `dispatch.summary.reasons` contains `not_dispatchable` and sends no partner e-mail.

- [ ] **Step 8: Update the docs.**

`CLAUDE.md`: in the route-type list for `[slug]`, change `quote` to `quote (charger) | quote-battery (battery, via QuoteShell)`; in the Components table add `quote-shell/QuoteShell.tsx | Client | Product-agnostic quote funnel (battery); charger still on QuoteForm`.

`docs/operations/partner-dispatch.md`: under the category table, add:

```markdown
Battery funnel (`product = battery`):

| `housingStatus` | `pvPower` (kWc) | → `lead_category` |
|---|---|---|
| `owner` | ≥ 10 | `owner_pv_large` |
| `owner` | < 10, `na`, missing | `owner_pv_small` |
| `co-owner` | ≥ 10 | `co_owner_pv_large` |
| `co-owner` | < 10, `na`, missing | `co_owner_pv_small` |
| any, with `solarEquipment = none` (or tenant) | — | `no_pv` — stored, never dispatched, no ledger row; PostHog `dispatch_not_dispatchable` |

Dedup is per product: a charger lead and a battery lead from the same e-mail are both dispatched.
```

```bash
git add CLAUDE.md docs/operations/partner-dispatch.md
git commit -m "docs: funnel batterie dans CLAUDE.md et le runbook de dispatch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Verify in the browser, then end to end on staging

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `npm run lint && npm test && npm run build`
Expected: all pass.

- [ ] **Step 2: Click through on the dev server** (`npm run dev`, then `http://localhost:3000/fr/devis-batterie-solaire`; the Directus page from Task 14 must exist on the instance `.env.local` points to). Check, in order:
  1. Welcome → housing: owner → house → "en service" reveals in order; owner greys out "appartement".
  2. Tenant shows the exit text, no Continue, a "Retour à l'accueil" link.
  3. "Pas encore" shows the note; Continue goes straight to contact; the progress bar shows 3 steps.
  4. PV step: bucket, "je ne sais pas", exact entry with `12,5`; Continue blocked on `0` with the nudge ring.
  5. Consumption: 1 household reveals size; 3 households does not; EV 2 → "borne ?"; EV 0 → "véhicule prévu ?".
  6. Refresh on the consumption step: answers restored. Open `/fr/demande-devis` in the same tab: no battery answer appears there.
  7. `?step=finalize` on a fresh tab lands on the first incomplete step.
  8. Every option responds on the first tap anywhere on the card (native buttons: no dead zones, one autocapture click per tap in PostHog).
  9. `/de/offerte-solarbatterie` shows the German copy; contact and finalize steps show the charger's German strings.

- [ ] **Step 3: Staging end to end.** Commit state on `staging`, ask Yoan before pushing (Vercel preview deploy). With an e-mail matching `dispatch.test_email_patterns`, submit one lead per category: owner large, owner small ("je ne sais pas"), co-owner large, co-owner small, no PV. For each, check:
  - `form_submissions.product = battery` and the answers in `data`;
  - `partner_dispatches`: one `skipped_test` row with the expected `lead_category` and `product = battery` for the four PV leads, **no row** for no PV;
  - the Make run: partner template for PV leads, confirmation only for no PV;
  - PostHog: `quote_step_viewed` … `quote_submitted` with `product = battery`; `dispatch_not_dispatchable` for no PV;
  - success page: battery copy; "Une borne pour vos véhicules ?" only for a lead with EVs and no charger; no Ads conversion request in the network tab for the no-PV lead (`nd=1`);
  - partner view `/fr/demande-devis/{id}?view=partner`: battery sections filled.
  Then submit one charger lead with solar and no battery: the charger success page shows "Combien pourriez-vous stocker ?"; submit the same e-mail in the battery funnel: both leads reach the partner (dedup per product).

- [ ] **Step 4: Report** the results to Yoan with any deviation, and update the memory file `project_battery_vertical.md` with the deployment state.
