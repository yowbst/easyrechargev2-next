# Lean Quote Funnel A/B Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a PostHog-flag-gated "lean" variant of the quote funnel that removes six informational questions, so we can A/B test whether a shorter funnel lifts submission rate.

**Architecture:** A single source-of-truth module lists the six fields hidden in the `lean` variant. `QuoteForm` resolves the variant once (via a PostHog multivariate feature flag `quote-lean-funnel`, defaulting to `control`, overridable with `?qv=`), then (a) folds a `showField()` guard into each of the six `RevealField` conditions, (b) passes the hidden-set to `firstUnansweredField` so gated fields aren't required, and (c) stamps `variant` on every quote PostHog event. The experiment itself (flag + goal metric + launch) is configured in PostHog with no further code.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, `posthog-js` (via `usePostHog()`), Vitest.

## Global Constraints

- **Variant values:** exactly `"control"` and `"lean"` (string variant keys) — copied verbatim into the PostHog flag.
- **Flag key:** exactly `quote-lean-funnel`.
- **Six lean-hidden fields (exact keys):** `electricalBoardType`, `electricalLineDistance`, `electricalLineHoleCount`, `ecpProvided`, `vehicleTripDistance`, `vehicleChargingHours`.
- **Default-safe:** anything that can't resolve the flag (PostHog not loaded / blocked) MUST behave as `control`.
- **Lock-once:** the variant is resolved a single time and never flips within a session.
- **No routing/schema change:** do not touch `deriveLeadCategory`, the Make webhook payload, or `src/shared/validation.ts` (dead schema).
- **QA override:** `?qv=lean` / `?qv=control` query param wins over the flag and must survive step navigation.
- Run `npm test` and `npm run lint` before each commit.

---

## File Structure

- **Create** `src/components/quote/leanVariant.ts` — single source of truth: the hidden-field set, the `QuoteVariant` type, and `hiddenFieldsFor(variant)`. Imported by both the validator and the component so they can never drift.
- **Create** `src/components/quote/leanVariant.test.ts` — unit tests for `hiddenFieldsFor`.
- **Modify** `src/components/quote/stepValidation.ts` — add an optional `hidden` param to `firstUnansweredField` that suppresses gated fields.
- **Modify** `src/components/quote/stepValidation.test.ts` — tests for the hidden param.
- **Modify** `src/components/quote/QuoteForm.tsx` — variant state + resolution effect, `showField()` gating on the six blocks, the `deadline` successor fix, `firstUnansweredField` call site, `ecpProvided` default guard, and `variant` on `quoteEventProps()`.
- **PostHog dashboard** (no file) — create + launch the experiment.

---

## Task 1: Lean-variant source of truth

**Files:**
- Create: `src/components/quote/leanVariant.ts`
- Test: `src/components/quote/leanVariant.test.ts`

**Interfaces:**
- Produces:
  - `type QuoteVariant = "control" | "lean"`
  - `const LEAN_HIDDEN_FIELDS: ReadonlySet<string>` — the six keys
  - `function hiddenFieldsFor(variant: QuoteVariant): ReadonlySet<string>` — `LEAN_HIDDEN_FIELDS` for `"lean"`, an empty set for `"control"`

- [ ] **Step 1: Write the failing test**

Create `src/components/quote/leanVariant.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hiddenFieldsFor, LEAN_HIDDEN_FIELDS } from "./leanVariant";

describe("hiddenFieldsFor", () => {
  it("control hides nothing", () => {
    expect(hiddenFieldsFor("control").size).toBe(0);
  });

  it("lean hides exactly the six target fields", () => {
    const lean = hiddenFieldsFor("lean");
    expect([...lean].sort()).toEqual(
      [
        "ecpProvided",
        "electricalBoardType",
        "electricalLineDistance",
        "electricalLineHoleCount",
        "vehicleChargingHours",
        "vehicleTripDistance",
      ].sort(),
    );
  });

  it("exposes the canonical set", () => {
    expect(LEAN_HIDDEN_FIELDS.has("electricalBoardType")).toBe(true);
    expect(LEAN_HIDDEN_FIELDS.has("housingStatus")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/quote/leanVariant.test.ts`
Expected: FAIL — cannot resolve module `./leanVariant`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/quote/leanVariant.ts`:

```ts
// Single source of truth for the quote-funnel A/B test.
// The "lean" variant removes six informational questions; "control" is the
// full funnel. Both the client-side validator (stepValidation.ts) and the
// QuoteForm JSX gating import from here so the two can never drift.

export type QuoteVariant = "control" | "lean";

export const LEAN_HIDDEN_FIELDS: ReadonlySet<string> = new Set([
  "electricalBoardType",     // step 1 (housing)
  "electricalLineDistance",  // step 2 (parking)
  "electricalLineHoleCount", // step 2 (parking)
  "ecpProvided",             // step 3 (charger)
  "vehicleTripDistance",     // step 4 (vehicle)
  "vehicleChargingHours",    // step 4 (vehicle)
]);

const NONE_HIDDEN: ReadonlySet<string> = new Set();

export function hiddenFieldsFor(variant: QuoteVariant): ReadonlySet<string> {
  return variant === "lean" ? LEAN_HIDDEN_FIELDS : NONE_HIDDEN;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/quote/leanVariant.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/quote/leanVariant.ts src/components/quote/leanVariant.test.ts
git commit -m "feat(quote-ab): lean-variant field source of truth"
```

---

## Task 2: Suppress gated fields in step validation

**Files:**
- Modify: `src/components/quote/stepValidation.ts:57-106`
- Test: `src/components/quote/stepValidation.test.ts`

**Interfaces:**
- Consumes: nothing new (plain `ReadonlySet<string>`).
- Produces: new signature
  `firstUnansweredField(step: number, f: StepFields, hidden?: ReadonlySet<string>): string | null`
  — a field key present in `hidden` is treated as answered (never returned). Default (omitted) = empty set = unchanged behavior.

- [ ] **Step 1: Write the failing test**

Append to `src/components/quote/stepValidation.test.ts` (inside the top-level `describe`, add a new `describe` block; also add the import):

```ts
import { hiddenFieldsFor } from "./leanVariant";

describe("firstUnansweredField — lean variant hides gated fields", () => {
  const lean = hiddenFieldsFor("lean");

  it("step 1: electricalBoardType not required when hidden", () => {
    expect(firstUnansweredField(1, { ...complete, electricalBoardType: "" }, lean)).toBeNull();
    // still enforces earlier, non-hidden fields
    expect(firstUnansweredField(1, { ...complete, electricalBoardType: "", solarEquipment: "" }, lean)).toBe("solarEquipment");
  });

  it("step 2: line distance & hole count not required when hidden; location still is", () => {
    expect(
      firstUnansweredField(2, { ...complete, electricalLineDistance: null, electricalLineHoleCount: null }, lean),
    ).toBeNull();
    expect(
      firstUnansweredField(2, { ...complete, parkingSpotLocation: "exterior", electricalLineDistance: null }, lean),
    ).toBe("parkingSpotLocation");
  });

  it("step 3: ecpProvided not required when hidden; deadline still is", () => {
    expect(firstUnansweredField(3, { ...complete, ecpProvided: "" }, lean)).toBeNull();
    expect(firstUnansweredField(3, { ...complete, ecpProvided: "", deadline: "" }, lean)).toBe("deadline");
  });

  it("step 4: trip distance & charging hours not required when hidden; status still is", () => {
    expect(
      firstUnansweredField(4, { ...complete, vehicleTripDistance: null, vehicleChargingHours: null }, lean),
    ).toBeNull();
    expect(
      firstUnansweredField(4, { ...complete, vehicleStatus: "", vehicleTripDistance: null }, lean),
    ).toBe("vehicleStatus");
  });

  it("control (no hidden set) is unchanged: gated fields still required", () => {
    expect(firstUnansweredField(1, { ...complete, electricalBoardType: "" })).toBe("electricalBoardType");
    expect(firstUnansweredField(3, { ...complete, ecpProvided: "" })).toBe("ecpProvided");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/quote/stepValidation.test.ts`
Expected: FAIL — `firstUnansweredField` ignores the 3rd arg, so the "hidden" assertions return the field key instead of `null`.

- [ ] **Step 3: Write minimal implementation**

In `src/components/quote/stepValidation.ts`, change the signature and guard each of the six returns. Replace the function header (line 57) and the six relevant lines:

Header:
```ts
export function firstUnansweredField(
  step: number,
  f: StepFields,
  hidden: ReadonlySet<string> = new Set(),
): string | null {
```

Then wrap each gated return so a hidden field is skipped:

- Line 65 →
  ```ts
      if (!hidden.has("electricalBoardType") && !f.electricalBoardType) return "electricalBoardType";
  ```
- Line 70 →
  ```ts
      if (!hidden.has("electricalLineDistance") && f.electricalLineDistance === null) return "electricalLineDistance";
  ```
- Line 71 →
  ```ts
      if (!hidden.has("electricalLineHoleCount") && f.electricalLineHoleCount === null) return "electricalLineHoleCount";
  ```
- Line 76 →
  ```ts
      if (!hidden.has("ecpProvided") && !f.ecpProvided) return "ecpProvided";
  ```
- Line 82 →
  ```ts
      if (!hidden.has("vehicleTripDistance") && f.vehicleTripDistance === null) return "vehicleTripDistance";
  ```
- Line 83 →
  ```ts
      if (!hidden.has("vehicleChargingHours") && f.vehicleChargingHours === null) return "vehicleChargingHours";
  ```

Leave all other checks (housingStatus, parkingSpotLocation, parkingSpotCount, deadline, vehicleStatus, contact, terms) untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/quote/stepValidation.test.ts`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/quote/stepValidation.ts src/components/quote/stepValidation.test.ts
git commit -m "feat(quote-ab): skip hidden fields in step validation"
```

---

## Task 3: Wire the variant into QuoteForm

**Files:**
- Modify: `src/components/quote/QuoteForm.tsx`

**Interfaces:**
- Consumes: `hiddenFieldsFor`, `type QuoteVariant` from `./leanVariant`; `firstUnansweredField(step, formData, hidden)` from Task 2.
- Produces: no exported API change. Adds `variant` to the `quote_*` event property bag; gates six fields + fixes the `deadline` successor reveal.

This task has no unit test (the surface is a large client component); it is verified manually via `?qv=` at the end. Right-sized as one task because resolution, gating, and the successor fix are interdependent — none is shippable alone.

- [ ] **Step 1: Add the import**

Near the other `./` imports at the top of `QuoteForm.tsx`, add:

```ts
import { hiddenFieldsFor, LEAN_HIDDEN_FIELDS, type QuoteVariant } from "./leanVariant";
```

- [ ] **Step 2: Add variant state + derived helpers**

Immediately after `const [step, setStep] = useState(0);` and `const ph = usePostHog();` (around line 206-207), add:

```ts
  const [variant, setVariant] = useState<QuoteVariant>("control");
  const variantResolved = useRef(false);
  const hiddenFields = hiddenFieldsFor(variant);
  const showField = (field: string) => !hiddenFields.has(field);
```

(`useRef` is already imported — it's used by `RevealField`.)

- [ ] **Step 3: Add the resolution effect (lock-once, default control)**

Add this effect below the state (e.g. after the URL-sync mount effect near line 213). It resolves once the user is on a question step (`step >= 1`), honoring `?qv=` first, otherwise the flag via `onFeatureFlags` (which fires immediately if flags are already loaded, else when they arrive):

```ts
  // Resolve the A/B variant exactly once, when the user first reaches a
  // question step. Defaults to "control" and never flips mid-session. The
  // six lean-hidden fields are all progressive-reveal fields (hidden on
  // fresh step entry), so resolving here — before the user answers the
  // preceding question — is flicker-free in practice.
  useEffect(() => {
    if (variantResolved.current || step < 1) return;

    const qv = new URLSearchParams(window.location.search).get("qv");
    if (qv === "lean" || qv === "control") {
      variantResolved.current = true;
      setVariant(qv);
      return;
    }
    if (!ph) return; // wait for PostHog; stay "control" until it loads

    const unsub = ph.onFeatureFlags(() => {
      if (variantResolved.current) return;
      variantResolved.current = true;
      setVariant(ph.getFeatureFlag("quote-lean-funnel") === "lean" ? "lean" : "control");
    });
    return unsub;
  }, [step, ph]);
```

- [ ] **Step 4: Stamp `variant` on every quote event**

In `quoteEventProps` (lines 400-405), add `variant`:

```ts
  const quoteEventProps = () => ({
    form_type: "quote",
    product,
    locale: lang,
    entry_point: miniQuoteSessionTokenRef.current ? "mini-quote" : "direct",
    variant,
  });
```

- [ ] **Step 5: Pass the hidden set to validation**

Change line 382 from:

```ts
  const missingField = firstUnansweredField(step, formData);
```
to:
```ts
  const missingField = firstUnansweredField(step, formData, hiddenFields);
```

- [ ] **Step 6: Guard the `ecpProvided` default effect**

So a hidden `ecpProvided` stays empty in the lean payload, change the effect at lines 300-307 to skip when the field is hidden. Add `variant` to the dependency array:

```ts
  // Apply page-config defaults for fields with configurable defaults
  useEffect(() => {
    if (LEAN_HIDDEN_FIELDS.has("ecpProvided") && variant === "lean") return;
    const ecpProvidedDefault = getFieldConfig("charger", "ecpProvided").default as string | undefined;
    setFormData((prev) => ({
      ...prev,
      ecpProvided: prev.ecpProvided || ecpProvidedDefault || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageConfig, variant]);
```

- [ ] **Step 7: Gate the six field blocks in JSX**

Fold `showField(...)` into each `RevealField`'s `visible` prop:

- **electricalBoardType** (line 885):
  ```tsx
  <RevealField visible={!!formData.solarEquipment && showField("electricalBoardType")}>
  ```
- **electricalLineDistance** (line 998):
  ```tsx
  <RevealField visible={VALID_PARKING_LOCATIONS.includes(formData.parkingSpotLocation) && showField("electricalLineDistance")}>
  ```
- **electricalLineHoleCount** (line 1015):
  ```tsx
  <RevealField visible={VALID_PARKING_LOCATIONS.includes(formData.parkingSpotLocation) && formData.electricalLineDistance !== null && showField("electricalLineHoleCount")}>
  ```
- **ecpProvided** (line 1076):
  ```tsx
  <RevealField visible={!!formData.parkingSpotCount && showField("ecpProvided")}>
  ```
- **vehicleTripDistance** (line 1198):
  ```tsx
  <RevealField visible={!!formData.vehicleStatus && showField("vehicleTripDistance")}>
  ```
- **vehicleChargingHours** (line 1215):
  ```tsx
  <RevealField visible={!!formData.vehicleStatus && formData.vehicleTripDistance !== null && showField("vehicleChargingHours")}>
  ```

- [ ] **Step 8: Fix the `deadline` successor reveal (critical)**

`deadline` currently reveals only once `ecpProvided` is answered. When `ecpProvided` is hidden it never gets answered, which would strand step 3. Change line 1106 so `deadline` reveals when `ecpProvided` is answered **or** hidden:

```tsx
  <RevealField visible={!!formData.parkingSpotCount && (!!formData.ecpProvided || !showField("ecpProvided"))}>
```

(The other five hidden fields are step-terminal — nothing reveals after them — so no further successor fixes are needed.)

- [ ] **Step 9: Typecheck, lint, and run the full unit suite**

Run:
```bash
npm run lint && npm test
```
Expected: lint clean; all tests pass (Tasks 1-2 suites included).

- [ ] **Step 10: Manual verification — lean**

Run `npm run dev`, open the quote page with `?qv=lean` appended (keep it in the URL), and walk the full funnel:
- Step 1: `electricalBoardType` is absent; step advances after solar/battery answers.
- Step 2: after picking a parking location, **no** distance / walls questions appear; Next works.
- Step 3: after parking-spot count, **no** "supplies" question; `deadline` still appears and Next works.
- Step 4: after vehicle status, **no** trip-distance / charging-hours questions; Next works.
- Steps 5-6 unchanged; submission succeeds.
- In the PostHog debug/network panel confirm `quote_step_viewed` events carry `variant: "lean"` and a `$feature/quote-lean-funnel` property.

- [ ] **Step 11: Manual verification — control**

Reload with `?qv=control`: all six questions are present and the funnel behaves exactly as today. Events carry `variant: "control"`.

- [ ] **Step 12: Commit**

```bash
git add src/components/quote/QuoteForm.tsx
git commit -m "feat(quote-ab): gate lean-variant questions behind quote-lean-funnel flag"
```

---

## Task 4: Create and launch the PostHog experiment

**Files:** none (PostHog dashboard, or via the PostHog MCP tools).

No code — this is configuration. Do it after Task 3 is deployed so the gated code is live (everyone resolves to `control` until the experiment launches).

- [ ] **Step 1: Create the feature flag / experiment**

In PostHog (project **eR PROD**, id 103083) create an **Experiment** named `quote-lean-funnel` backed by a multivariate flag with variant keys exactly `control` (rollout 50%) and `lean` (rollout 50%). Leave it **draft/not launched** for now.

- [ ] **Step 2: Define the goal metric**

Primary metric = **funnel**: step 1 `$feature_flag_called` (exposure) → step 2 `quote_submitted`. Ensure "filter test accounts" is on. This measures submission rate per variant with the exposed population as the denominator.

- [ ] **Step 3: Deploy the code (control-only) and sanity-check**

Deploy per `CLAUDE.md` (staging → main). With the experiment still in draft, confirm production traffic behaves as `control` (all six questions present) and that `quote_*` events now carry a `variant` property.

- [ ] **Step 4: Launch**

Launch the experiment to 50/50. Confirm in PostHog Live events that both `variant: "control"` and `variant: "lean"` are arriving and that `$feature/quote-lean-funnel` splits ~50/50.

- [ ] **Step 5: Monitor & decide**

Let it run until PostHog reports significance (or an agreed minimum sample / duration). Winner = higher `exposure → quote_submitted` rate. Before making a lean win permanent, manually review whether partners miss the six informational fields (no guardrail metric is automated for this test).

---

## Self-Review Notes

- **Spec coverage:** variant structure (Task 1/3), primary metric = exposure→quote_submitted (Task 4 Step 2), no guardrail (Task 4 Step 5 manual note), PostHog-flag assignment resolved at welcome→step-1 with control default and lock-once (Task 3 Step 3), six-field removal (Tasks 1-3), QA `?qv` override (Task 3 Step 3 + verify), analytics `variant` prop (Task 3 Step 4), rollout control-first then dashboard flip (Task 4), no routing/schema change (respected — only JSX + validation touched). The one dependency the spec did not call out but that surfaced during planning — `deadline` reveals off `ecpProvided` — is handled in Task 3 Step 8.
- **Placeholders:** none — every step carries concrete code.
- **Type consistency:** `QuoteVariant`, `hiddenFieldsFor`, `LEAN_HIDDEN_FIELDS`, and the 3-arg `firstUnansweredField(step, f, hidden)` signature are used consistently across Tasks 1-3.
