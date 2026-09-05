# Quote Form UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three reported quote-form UX defects (unreliable scroll-to-revealed-question, address-autocomplete dropdown hidden behind the fixed nav bar, slider-as-required-field traps) and harden conversion (guarded Continue with scroll-to-missing-answer, sessionStorage resume).

**Architecture:** The form is one large client component (`src/components/quote/QuoteForm.tsx`, ~1870 LOC) with progressive disclosure via a local `RevealField` wrapper and a fixed bottom nav bar (`z-50`). Sliders become tap-button "bucket" groups backed by a pure, unit-tested bucket module — stored values stay `number | "na" | null` so dispatch, Make payloads, and partner emails are untouched. Scroll logic is centralized in a fixed `RevealField`; the autocomplete gets a placement helper (pure, tested) + z-index fix. Step validation is unified into a pure `firstUnansweredField()` helper that both gates Continue and powers scroll-to-missing.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, shadcn/ui, Vitest (node environment — NO jsdom/testing-library in this repo: components are verified by tsc + dev server, pure logic by unit tests).

## Global Constraints

- Branch `staging`. Never `git add -A`/`git add .` — always add explicit paths. Do not push.
- Stored form-data shape for the four slider fields MUST remain `number | "na" | null` (values flow into the Make webhook and partner emails; `deriveLeadCategory` reads only `housingStatus`/`solarEquipment` so bucket values can't affect pricing).
- NO new Directus translation keys may be required for the form to function. Bucket labels are numeric + unit (language-neutral), units come from existing keys (`…fields.<field>.unit`), the "je ne sais pas" labels come from existing keys (`checkboxLabel` / `.na`). New UI copy (missing-answer hint) uses `tqOpt()` with hardcoded fr/de fallbacks.
- The fixed bottom nav bar is `z-50` and ~72px tall ([QuoteForm.tsx:1632](../../src/components/quote/QuoteForm.tsx)); anything that must paint above it needs `z-[60]`, anything scrolled into view must not land under it.
- Respect `prefers-reduced-motion: reduce` for every `scrollIntoView` this plan adds (use `behavior: "auto"` when reduced).
- Existing PostHog telemetry (`quote_step_viewed`/`quote_step_completed`, `telemetry.trackChange`) must keep firing unchanged — bucket buttons go through the existing `handleFieldChange`.
- Gates per task: `npx tsc --noEmit`, `npm test`, and `npx eslint <touched files>` (repo has pre-existing lint issues; gate = no NEW ones).
- Existing tests count: 56. Each task states its expected new total.

---

### Task 1: Bucket definitions module

**Files:**
- Create: `src/lib/quoteBuckets.ts`
- Test: `src/lib/quoteBuckets.test.ts`

**Interfaces:**
- Produces: `interface BucketOption { value: number; label: string }`, `resolveBuckets(fieldKey: string, configBuckets: unknown, unit: string): BucketOption[]`, `DEFAULT_BUCKETS: Record<string, { value: number; label: string }[]>`. Task 2's component consumes `BucketOption`; Task 3's form wiring calls `resolveBuckets`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/quoteBuckets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveBuckets, DEFAULT_BUCKETS } from "./quoteBuckets";

describe("quoteBuckets", () => {
  it("has defaults for all four former slider fields", () => {
    for (const key of ["electricalLineDistance", "electricalLineHoleCount", "vehicleTripDistance", "vehicleChargingHours"]) {
      expect(DEFAULT_BUCKETS[key]?.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("interpolates the unit with a non-breaking space", () => {
    const buckets = resolveBuckets("electricalLineDistance", undefined, "m");
    expect(buckets[0]).toEqual({ value: 5, label: "≤ 5 m" });
    expect(buckets[3]).toEqual({ value: 40, label: "> 30 m" });
  });

  it("leaves label untouched when there is no {u} placeholder", () => {
    const buckets = resolveBuckets("electricalLineHoleCount", undefined, "murs");
    expect(buckets.map((b) => b.label)).toEqual(["0", "1", "2", "3+"]);
  });

  it("uses valid page-config buckets when provided", () => {
    const cfg = [{ value: 1, label: "petit" }, { value: 99, label: "grand" }];
    expect(resolveBuckets("electricalLineDistance", cfg, "m")).toEqual(cfg);
  });

  it("falls back to defaults on malformed config", () => {
    expect(resolveBuckets("vehicleTripDistance", [{ value: "x" }], "km").length).toBe(4);
    expect(resolveBuckets("vehicleTripDistance", "nope", "km").length).toBe(4);
    expect(resolveBuckets("unknownField", undefined, "")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/quoteBuckets.test.ts`
Expected: FAIL — cannot resolve `./quoteBuckets`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/quoteBuckets.ts`:

```ts
// Tap-button "bucket" choices that replaced the quote-form sliders
// (2026-07). Stored values stay numeric so the Make webhook payload,
// partner emails, and dispatch categorization are unchanged; the number
// is the bucket's representative value (e.g. "> 30 m" stores 40 — same
// false precision the slider produced, but one tap instead of a drag).
// Labels are numeric + unit → language-neutral, no Directus keys needed.
// A page-config field may override with `buckets: [{ value, label }]`.

export interface BucketOption {
  value: number;
  label: string;
}

export const DEFAULT_BUCKETS: Record<string, { value: number; label: string }[]> = {
  electricalLineDistance: [
    { value: 5, label: "≤ 5{u}" },
    { value: 10, label: "5–15{u}" },
    { value: 20, label: "15–30{u}" },
    { value: 40, label: "> 30{u}" },
  ],
  electricalLineHoleCount: [
    { value: 0, label: "0" },
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3+" },
  ],
  vehicleTripDistance: [
    { value: 15, label: "< 25{u}" },
    { value: 40, label: "25–50{u}" },
    { value: 75, label: "50–100{u}" },
    { value: 130, label: "> 100{u}" },
  ],
  vehicleChargingHours: [
    { value: 5, label: "< 6{u}" },
    { value: 7, label: "6–8{u}" },
    { value: 9, label: "> 8{u}" },
  ],
};

function isValidConfigBuckets(raw: unknown): raw is { value: number; label: string }[] {
  return (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((b) => b && typeof b === "object" && typeof (b as { value?: unknown }).value === "number" && typeof (b as { label?: unknown }).label === "string")
  );
}

/** `{u}` in a label renders as NBSP + unit; absent placeholder = label used as-is. */
export function resolveBuckets(fieldKey: string, configBuckets: unknown, unit: string): BucketOption[] {
  const source = isValidConfigBuckets(configBuckets) ? configBuckets : (DEFAULT_BUCKETS[fieldKey] ?? []);
  return source.map((b) => ({
    value: b.value,
    label: b.label.replace("{u}", unit ? ` ${unit}` : ""),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/quoteBuckets.test.ts`
Expected: PASS (5 tests). Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quoteBuckets.ts src/lib/quoteBuckets.test.ts
git commit -m "feat(quote): bucket definitions replacing slider values (pure module)"
```

---

### Task 2: RangeButtonGroup component + replace the four sliders

**Files:**
- Create: `src/components/quote/RangeButtonGroup.tsx`
- Modify: `src/components/quote/QuoteForm.tsx` (four `SliderWithCheckbox` blocks at ~lines 951-981 and ~1151-1188; imports at top)
- Delete: `src/components/quote/SliderWithCheckbox.tsx` (QuoteForm is its only importer — verify with `grep -rn "SliderWithCheckbox" src/` before deleting; do NOT delete `src/components/ui/slider.tsx`, other components may use it — check with `grep -rn "ui/slider" src/`)

**Interfaces:**
- Consumes: `BucketOption`, `resolveBuckets` from `@/lib/quoteBuckets` (Task 1).
- Produces: `<RangeButtonGroup value onChange options label naLabel icon tooltip tooltipImage className />` with `value: number | "na" | null`, `onChange: (v: number | "na") => void`. Reveal conditions in QuoteForm (`!== null` checks) are UNCHANGED.

- [ ] **Step 1: Create the component**

Create `src/components/quote/RangeButtonGroup.tsx`:

```tsx
"use client";

import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { BucketOption } from "@/lib/quoteBuckets";

interface RangeButtonGroupProps {
  value: number | "na" | null;
  onChange: (value: number | "na") => void;
  options: BucketOption[];
  label: string;
  naLabel?: string;
  icon?: LucideIcon;
  tooltip?: ReactNode;
  tooltipImage?: string;
  className?: string;
  testId?: string;
}

/** Tap-button bucket picker that replaced SliderWithCheckbox: one tap =
 * answered, and the unanswered state is visually obvious (nothing
 * selected), unlike a slider thumb parked at min. */
export function RangeButtonGroup({
  value,
  onChange,
  options,
  label,
  naLabel = "Je ne sais pas",
  icon: Icon,
  tooltip,
  tooltipImage,
  className = "",
  testId,
}: RangeButtonGroupProps) {
  const isNA = value === "na";
  const cols = options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4";

  return (
    <div className={className}>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 block">
        <InfoTooltip className="flex items-center gap-1.5" content={tooltip} image={tooltipImage}>
          {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
          {label}
        </InfoTooltip>
      </Label>

      <div className={`grid grid-cols-2 ${cols} gap-2`}>
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              className={`py-3 px-2 rounded-lg border text-sm font-medium transition-all ${
                isSelected
                  ? "border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30"
                  : "border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 text-foreground"
              }`}
              onClick={() => onChange(option.value)}
              data-testid={testId ? `bucket-${testId}-${option.value}` : undefined}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-pressed={isNA}
        className={`w-full mt-2 py-2 px-3 rounded-lg border text-sm text-left transition-all ${
          isNA
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border/60 bg-muted/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => onChange("na")}
        data-testid={testId ? `bucket-${testId}-na` : undefined}
      >
        {naLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Replace the four sliders in QuoteForm.tsx**

Imports: remove `import { SliderWithCheckbox } from "@/components/quote/SliderWithCheckbox";` and add:

```tsx
import { RangeButtonGroup } from "@/components/quote/RangeButtonGroup";
import { resolveBuckets } from "@/lib/quoteBuckets";
```

Replace the `electricalLineDistance` block (inside its existing `RevealField`, keep the `RevealField` wrapper and `visible` condition exactly as-is):

```tsx
                    <RangeButtonGroup
                      value={formData.electricalLineDistance}
                      onChange={(value) => handleFieldChange("electricalLineDistance", value)}
                      options={resolveBuckets("electricalLineDistance", getFieldConfig("parking", "electricalLineDistance").buckets, tq("steps.parking.fields.electricalLineDistance.unit"))}
                      label={tq("steps.parking.fields.electricalLineDistance.label")}
                      naLabel={tq("steps.parking.fields.electricalLineDistance.checkboxLabel")}
                      icon={Cable}
                      tooltip={tqOpt("steps.parking.fields.electricalLineDistance.tooltip")}
                      tooltipImage={tooltipImage("parking", "electricalLineDistance")}
                      testId="electricalLineDistance"
                    />
```

Replace the `electricalLineHoleCount` block the same way (keep its `RevealField`):

```tsx
                    <RangeButtonGroup
                      value={formData.electricalLineHoleCount}
                      onChange={(value) => handleFieldChange("electricalLineHoleCount", value)}
                      options={resolveBuckets("electricalLineHoleCount", getFieldConfig("parking", "electricalLineHoleCount").buckets, "")}
                      label={tq("steps.parking.fields.electricalLineHoleCount.label")}
                      naLabel={tq("steps.parking.fields.electricalLineHoleCount.checkboxLabel")}
                      icon={Blocks}
                      tooltip={tqOpt("steps.parking.fields.electricalLineHoleCount.tooltip")}
                      tooltipImage={tooltipImage("parking", "electricalLineHoleCount")}
                      testId="electricalLineHoleCount"
                    />
```

Replace `vehicleTripDistance` (keep its `RevealField`):

```tsx
                    <RangeButtonGroup
                      value={formData.vehicleTripDistance}
                      onChange={(value) => handleFieldChange("vehicleTripDistance", value)}
                      options={resolveBuckets("vehicleTripDistance", getFieldConfig("vehicle", "vehicleTripDistance").buckets, tq("steps.vehicle.fields.vehicleTripDistance.unit"))}
                      label={tq("steps.vehicle.fields.vehicleTripDistance.label")}
                      naLabel={tq("steps.vehicle.fields.vehicleTripDistance.na")}
                      icon={Navigation}
                      tooltip={tqOpt("steps.vehicle.fields.vehicleTripDistance.tooltip")}
                      tooltipImage={tooltipImage("vehicle", "vehicleTripDistance")}
                      testId="vehicleTripDistance"
                    />
```

Replace `vehicleChargingHours` (keep its `RevealField`):

```tsx
                    <RangeButtonGroup
                      value={formData.vehicleChargingHours}
                      onChange={(value) => handleFieldChange("vehicleChargingHours", value)}
                      options={resolveBuckets("vehicleChargingHours", getFieldConfig("vehicle", "vehicleChargingHours").buckets, tq("steps.vehicle.fields.vehicleChargingHours.unit"))}
                      label={tq("steps.vehicle.fields.vehicleChargingHours.label")}
                      naLabel={tq("steps.vehicle.fields.vehicleChargingHours.na")}
                      icon={Gauge}
                      tooltip={tqOpt("steps.vehicle.fields.vehicleChargingHours.tooltip")}
                      tooltipImage={tooltipImage("vehicle", "vehicleChargingHours")}
                      testId="vehicleChargingHours"
                    />
```

- [ ] **Step 3: Delete SliderWithCheckbox if orphaned**

Run: `grep -rn "SliderWithCheckbox" src/` — expect only the (now removed) QuoteForm import. Delete `src/components/quote/SliderWithCheckbox.tsx`. Run `grep -rn "components/ui/slider" src/` — if other files import `ui/slider`, keep it; if none, still keep it (shadcn primitive, out of scope).

- [ ] **Step 4: Gates**

Run: `npx tsc --noEmit && npm test && npx eslint src/components/quote/RangeButtonGroup.tsx src/components/quote/QuoteForm.tsx`
Expected: tsc clean; 61 tests pass (56 + 5 from Task 1); no new lint issues.

- [ ] **Step 5: Manual dev-server check**

`npm run dev`, open `http://localhost:3000/fr/devis?step=2`. Verify: parking step shows the distance buckets after picking a location; tapping a bucket instantly reveals the walls question; "je ne sais pas" works and deselects when a bucket is tapped; same on step 4 (vehicle). Kill the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/quote/RangeButtonGroup.tsx src/components/quote/QuoteForm.tsx
git rm src/components/quote/SliderWithCheckbox.tsx
git commit -m "feat(quote): replace sliders with tap-button buckets (kills silent required-slider trap)"
```

---

### Task 3: Fix reveal scrolling (RevealField v2 + wrap stray conditionals)

**Files:**
- Modify: `src/components/quote/QuoteForm.tsx` — `RevealField` (~lines 79-109), parking sub-options block (~line 923), contact-step address subfields block (~line 1331)

**Interfaces:**
- Consumes: nothing new. Produces: same `<RevealField visible>` API; behavior change only.

- [ ] **Step 1: Replace RevealField**

Replace the whole `RevealField` function (and add the module-level guard above it):

```tsx
// Shared guard: when one answer reveals several fields at once, only the
// topmost (first effect to fire) scrolls — competing smooth-scrolls cancel
// each other and land nowhere.
const lastRevealScroll = { at: 0 };

/** Progressive-reveal wrapper: renders children hidden until `visible` is true, with a slide-down animation. */
function RevealField({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hasBeenVisible = useRef(false);

  // Once visible, scroll into view — AFTER the 300ms height transition, so
  // the element's final geometry is what gets centered. block:"center"
  // keeps it clear of the fixed bottom nav bar (which scrollIntoView
  // doesn't know about).
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

- [ ] **Step 2: Wrap the two stray conditional blocks**

(a) Parking sub-options (~line 923): the block `{parkingSubOptions[option.value] && getParkingMainValue() === option.value && (<div className="ml-8 mt-2 …">…)}` — wrap its inner `<div className="ml-8 …">` in `<RevealField visible={…same condition…}>` and change the outer condition to only gate on `parkingSubOptions[option.value]` existing, i.e.:

```tsx
                          {parkingSubOptions[option.value] && (
                            <RevealField visible={getParkingMainValue() === option.value}>
                              <div className="ml-8 mt-2 space-y-2 pl-4 border-l-2 border-primary/20">
                                {/* …existing sub-option mapping unchanged… */}
                              </div>
                            </RevealField>
                          )}
```

(b) Contact-step address subfields (~line 1331): wrap the `{(formData.streetName || formData.locality) && (<div className="space-y-3">…)}` block:

```tsx
                        <RevealField visible={!!(formData.streetName || formData.locality)}>
                          <div className="space-y-3">
                            {/* …existing subfields unchanged… */}
                          </div>
                        </RevealField>
```

(keep the outer conditional removed — RevealField handles hiding; children are controlled inputs so state lives in formData).

- [ ] **Step 3: Gates + manual check**

Run: `npx tsc --noEmit && npm test`. Then `npm run dev`: on step 1, answer each question and confirm the next one scrolls to viewport center (not hidden behind the bottom bar); answer `solarEquipment` (two blocks reveal at once) and confirm exactly one smooth scroll happens; on step 2 pick a parking type with sub-options and confirm the sub-options reveal+scroll; on step 5 select an address and confirm the subfields reveal+scroll. Kill the server.

- [ ] **Step 4: Commit**

```bash
git add src/components/quote/QuoteForm.tsx
git commit -m "fix(quote): revealed questions scroll to viewport center after transition settles"
```

---

### Task 4: Autocomplete dropdown placement + visibility

**Files:**
- Create: `src/lib/dropdownPlacement.ts`
- Test: `src/lib/dropdownPlacement.test.ts`
- Modify: `src/components/quote/PlaceAutocomplete.tsx`

**Interfaces:**
- Produces: `dropdownPlacement(input: { top: number; bottom: number }, viewportHeight: number): "down" | "up"`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/dropdownPlacement.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dropdownPlacement, NAV_BAR_CLEARANCE } from "./dropdownPlacement";

describe("dropdownPlacement", () => {
  it("opens down when there is ample room below", () => {
    expect(dropdownPlacement({ top: 100, bottom: 140 }, 800)).toBe("down");
  });

  it("opens up when the input sits just above the fixed nav bar", () => {
    // 800px viewport, input bottom at 700 → 100px below minus nav clearance < min height
    expect(dropdownPlacement({ top: 660, bottom: 700 }, 800)).toBe("up");
  });

  it("still opens down when above is even tighter than below", () => {
    expect(dropdownPlacement({ top: 40, bottom: 80 }, 300)).toBe("down");
  });

  it("exports the nav bar clearance used by the layout", () => {
    expect(NAV_BAR_CLEARANCE).toBeGreaterThanOrEqual(64);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dropdownPlacement.test.ts` — expect module-not-found FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/dropdownPlacement.ts`:

```ts
// The quote form has a fixed bottom nav bar (~72px, z-50). A dropdown
// opening downward near the bottom of the viewport lands under it, so we
// flip upward when the usable space below the input is too small.

export const NAV_BAR_CLEARANCE = 72;

const MIN_DROPDOWN_HEIGHT = 160; // ~3 suggestion rows

export function dropdownPlacement(
  input: { top: number; bottom: number },
  viewportHeight: number,
): "down" | "up" {
  const usableBelow = viewportHeight - input.bottom - NAV_BAR_CLEARANCE;
  if (usableBelow >= MIN_DROPDOWN_HEIGHT) return "down";
  return input.top > usableBelow ? "up" : "down";
}
```

Run: `npx vitest run src/lib/dropdownPlacement.test.ts` — PASS (4 tests).

- [ ] **Step 4: Wire into PlaceAutocomplete**

In `src/components/quote/PlaceAutocomplete.tsx`:

Add imports and state:

```tsx
import { dropdownPlacement } from "@/lib/dropdownPlacement";
```

```tsx
  const [placement, setPlacement] = useState<"down" | "up">("down");
```

In the suggestions effect, right before `setIsOpen(mapped.length > 0);`, compute placement from the input's rect:

```tsx
        if (mapped.length > 0 && inputRef.current) {
          const r = inputRef.current.getBoundingClientRect();
          setPlacement(dropdownPlacement({ top: r.top, bottom: r.bottom }, window.innerHeight));
        }
```

Add an `onFocus` to the `<Input>` that centers it (helps mobile keyboards and guarantees room for the list):

```tsx
        onFocus={() => {
          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          inputRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
        }}
```

Change the dropdown container class from:

```tsx
          className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto"
```

to:

```tsx
          className={`absolute z-[60] w-full bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto ${
            placement === "up" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
```

(`z-[60]` beats the fixed nav bar's `z-50`; `bottom-full` flips it above the input when space below is short.)

- [ ] **Step 5: Gates + manual check**

`npx tsc --noEmit && npm test && npx eslint src/components/quote/PlaceAutocomplete.tsx src/lib/dropdownPlacement.ts` — expect 65 tests (61 + 4), no new lint.
Dev server: step 5, focus the address field (it should center in the viewport), type "Rue de la Gare 1" — suggestions must be fully visible above the bottom bar; shrink the window so the input sits near the bottom and confirm the list flips upward. Kill server.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dropdownPlacement.ts src/lib/dropdownPlacement.test.ts src/components/quote/PlaceAutocomplete.tsx
git commit -m "fix(quote): address dropdown above nav bar, flips up when space is short, input centers on focus"
```

---

### Task 5: Guarded Continue with scroll-to-missing-answer

**Files:**
- Create: `src/components/quote/stepValidation.ts`
- Test: `src/components/quote/stepValidation.test.ts`
- Modify: `src/components/quote/QuoteForm.tsx` (validity block ~lines 330-377, nav buttons ~lines 1631-1760, question wrappers gain `id` anchors)

**Interfaces:**
- Produces: `firstUnansweredField(step: number, form: StepFields): string | null` — returns a field key (matching a `q-<key>` DOM id) or null when the step is complete. `StepFields` is a structural subset of QuoteForm's `FormData` (all fields the validator reads, typed exactly as in FormData).

- [ ] **Step 1: Write the failing test**

Create `src/components/quote/stepValidation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { firstUnansweredField, type StepFields } from "./stepValidation";

const complete: StepFields = {
  housingStatus: "owner",
  housingType: "house",
  solarEquipment: "none",
  homeBattery: "",
  neighborhoodEquipment: "",
  electricalBoardType: "recent",
  parkingSpotLocation: "garage-adjacent",
  electricalLineDistance: 10,
  electricalLineHoleCount: 1,
  parkingSpotCount: "1",
  ecpProvided: "no",
  deadline: "1-3-months",
  vehicleStatus: "owned",
  vehicleTripDistance: 40,
  vehicleChargingHours: 9,
  firstName: "A",
  lastName: "B",
  email: "a@b.ch",
  phone: "0791234567",
  phoneCountry: "CH",
  addressMode: "google",
  address: "Rue 1, 1000 Lausanne",
  postalCode: "1000",
  locality: "Lausanne",
  canton: "VD",
  streetName: "",
  streetNb: "",
  acceptTerms: true,
};

describe("firstUnansweredField", () => {
  it("returns null for complete steps", () => {
    for (const step of [1, 2, 3, 4, 5, 6]) {
      expect(firstUnansweredField(step, complete)).toBeNull();
    }
  });

  it("step 1: returns fields in visual order and respects conditional visibility", () => {
    expect(firstUnansweredField(1, { ...complete, housingStatus: "" })).toBe("housingStatus");
    expect(firstUnansweredField(1, { ...complete, solarEquipment: "" })).toBe("solarEquipment");
    // homeBattery only required when solar exists / in progress
    expect(firstUnansweredField(1, { ...complete, solarEquipment: "exists", homeBattery: "" })).toBe("homeBattery");
    // neighborhoodEquipment required for tenant+apartment
    expect(
      firstUnansweredField(1, { ...complete, housingStatus: "tenant", housingType: "apartment", neighborhoodEquipment: "" }),
    ).toBe("neighborhoodEquipment");
  });

  it("step 2: slider-successor fields distinguish null from na/0", () => {
    expect(firstUnansweredField(2, { ...complete, parkingSpotLocation: "exterior" })).toBe("parkingSpotLocation");
    expect(firstUnansweredField(2, { ...complete, electricalLineDistance: null })).toBe("electricalLineDistance");
    expect(firstUnansweredField(2, { ...complete, electricalLineDistance: "na" })).toBeNull();
    expect(firstUnansweredField(2, { ...complete, electricalLineHoleCount: 0 })).toBeNull();
  });

  it("step 5: validates email/phone content and address per mode", () => {
    expect(firstUnansweredField(5, { ...complete, email: "not-an-email" })).toBe("email");
    expect(firstUnansweredField(5, { ...complete, phone: "1" })).toBe("phone");
    expect(firstUnansweredField(5, { ...complete, canton: "" })).toBe("address");
    expect(
      firstUnansweredField(5, { ...complete, addressMode: "manual", streetName: "", address: "" }),
    ).toBe("address");
  });

  it("step 6: terms", () => {
    expect(firstUnansweredField(6, { ...complete, acceptTerms: false })).toBe("acceptTerms");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`npx vitest run src/components/quote/stepValidation.test.ts` — module-not-found FAIL.

- [ ] **Step 3: Implement**

Create `src/components/quote/stepValidation.ts`:

```ts
// Single source of truth for "is this step answerable / what's missing".
// Returns the FIRST unanswered field key in visual order — the form
// scrolls to `#q-<key>` when Continue is pressed on an incomplete step.
// Mirrors the per-step validity rules that used to live inline in
// QuoteForm (isStep1Valid…isStep6Valid).

import { validatePhone } from "@/lib/phone-utils";
import type { CountryCode } from "libphonenumber-js";

export interface StepFields {
  housingStatus?: string;
  housingType: string;
  solarEquipment: string;
  homeBattery: string;
  neighborhoodEquipment: string;
  electricalBoardType: string;
  parkingSpotLocation: string;
  electricalLineDistance: number | "na" | null;
  electricalLineHoleCount: number | "na" | null;
  parkingSpotCount: string;
  ecpProvided: string;
  deadline: string;
  vehicleStatus: string;
  vehicleTripDistance: number | "na" | null;
  vehicleChargingHours: number | "na" | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  addressMode: string;
  address: string;
  postalCode?: string;
  locality?: string;
  canton?: string;
  streetName?: string;
  streetNb?: string;
  acceptTerms: boolean;
}

export const VALID_PARKING_LOCATIONS = [
  "exterior-adjacent", "exterior-standalone",
  "garage-adjacent", "garage-standalone",
  "covered-adjacent", "covered-standalone",
  "underground",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function shouldShowNeighborhoodEquipment(f: StepFields): boolean {
  return (
    (f.housingStatus === "co-owner" && ["apartment", "house"].includes(f.housingType)) ||
    (f.housingStatus === "tenant" && f.housingType === "apartment")
  );
}

export function firstUnansweredField(step: number, f: StepFields): string | null {
  switch (step) {
    case 1: {
      if (!f.housingStatus) return "housingStatus";
      if (!f.housingType) return "housingType";
      if (!f.solarEquipment) return "solarEquipment";
      if (["exists", "in-progress"].includes(f.solarEquipment) && !f.homeBattery) return "homeBattery";
      if (shouldShowNeighborhoodEquipment(f) && !f.neighborhoodEquipment) return "neighborhoodEquipment";
      if (!f.electricalBoardType) return "electricalBoardType";
      return null;
    }
    case 2: {
      if (!f.parkingSpotLocation || !VALID_PARKING_LOCATIONS.includes(f.parkingSpotLocation)) return "parkingSpotLocation";
      if (f.electricalLineDistance === null) return "electricalLineDistance";
      if (f.electricalLineHoleCount === null) return "electricalLineHoleCount";
      return null;
    }
    case 3: {
      if (!f.parkingSpotCount) return "parkingSpotCount";
      if (!f.ecpProvided) return "ecpProvided";
      if (!f.deadline) return "deadline";
      return null;
    }
    case 4: {
      if (!f.vehicleStatus) return "vehicleStatus";
      if (f.vehicleTripDistance === null) return "vehicleTripDistance";
      if (f.vehicleChargingHours === null) return "vehicleChargingHours";
      return null;
    }
    case 5: {
      if (!f.firstName.trim()) return "firstName";
      if (!f.lastName.trim()) return "lastName";
      if (!EMAIL_RE.test(f.email)) return "email";
      if (!f.phone || !validatePhone(f.phone, f.phoneCountry as CountryCode)) return "phone";
      const addressOk =
        f.addressMode === "google"
          ? f.address && f.postalCode && f.locality && f.canton
          : f.postalCode && f.locality && f.streetName && f.streetNb && f.canton;
      if (!addressOk) return "address";
      return null;
    }
    case 6:
      return f.acceptTerms ? null : "acceptTerms";
    default:
      return null;
  }
}
```

Run: `npx vitest run src/components/quote/stepValidation.test.ts` — PASS (5 tests).

- [ ] **Step 4: Wire into QuoteForm**

In `src/components/quote/QuoteForm.tsx`:

(a) Import: `import { firstUnansweredField, VALID_PARKING_LOCATIONS } from "@/components/quote/stepValidation";`. Delete the inline `isStep1Valid` … `isStep6Valid` and `validParkingLocations` definitions (~lines 330-377; keep `isEmailValid`/`isPhoneValid` ONLY if referenced by inline error rendering — grep first: `isPhoneValid` is used at line ~1303 for the phone error message, keep it; replace other uses of `validParkingLocations` with the imported constant). Replace with:

```tsx
  const missingField = firstUnansweredField(step, formData);
  const canProceed = missingField === null;
```

(b) Add hint state + guarded navigation next to `goToStep`:

```tsx
  const [showMissingHint, setShowMissingHint] = useState(false);

  // Continue pressed on an incomplete step: scroll to the first unanswered
  // question and show a hint instead of a silently disabled button.
  const tryGoToStep = (nextStep: number) => {
    if (nextStep > step && missingField) {
      setShowMissingHint(true);
      ph?.capture("quote_missing_answer_nudge", { step, field: missingField });
      const el = document.getElementById(`q-${missingField}`);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      return;
    }
    setShowMissingHint(false);
    goToStep(nextStep);
  };
```

(c) Anchors: add `id="q-<fieldKey>"` to the wrapper `<div>` of every question the validator can return (`housingStatus`, `housingType`, `solarEquipment`, `homeBattery`, `neighborhoodEquipment`, `electricalBoardType`, `parkingSpotLocation`, `electricalLineDistance` (on the RevealField's inner div or the RangeButtonGroup wrapper div — add a plain wrapper `<div id="q-electricalLineDistance">` around the RangeButtonGroup), `electricalLineHoleCount`, `parkingSpotCount`, `ecpProvided`, `deadline`, `vehicleStatus`, `vehicleTripDistance`, `vehicleChargingHours`, `firstName`, `lastName`, `email`, `phone`, `address`, `acceptTerms`).

(d) Buttons (~lines 1631-1760): change every forward `onClick={() => goToStep(N)}` to `onClick={() => tryGoToStep(N)}`; REMOVE `disabled={!isStepXValid}` and instead style conditionally so the affordance persists:

```tsx
                  className={`… existing classes …${canProceed ? "" : " opacity-60"}`}
```

Back buttons keep plain `goToStep` (never guarded). The final submit button keeps its existing submit handler but gains the same guard at the top:

```tsx
                        if (missingField) {
                          setShowMissingHint(true);
                          document.getElementById(`q-${missingField}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                          return;
                        }
```

(e) Hint line inside the fixed nav container, above the buttons:

```tsx
              {showMissingHint && missingField && (
                <p className="text-xs text-destructive text-center mb-2" role="status">
                  {tqOpt("navigation.missingAnswer") ??
                    (lang === "de"
                      ? "Oben fehlt noch eine Antwort — wir haben sie für Sie markiert."
                      : "Il manque une réponse ci-dessus — nous vous y avons amené.")}
                </p>
              )}
```

Clear the hint when the missing field gets answered: add to `handleFieldChange` (top of function): `if (showMissingHint) setShowMissingHint(false);`

- [ ] **Step 5: Gates + manual check**

`npx tsc --noEmit && npm test && npx eslint src/components/quote/QuoteForm.tsx src/components/quote/stepValidation.ts` — expect 70 tests (65 + 5), no new lint.
Dev server: on step 1 with nothing answered press Continue → page scrolls to the first question, hint appears, PostHog devtools shows `quote_missing_answer_nudge`; answer it → hint clears; complete the step → Continue advances. Kill server.

- [ ] **Step 6: Commit**

```bash
git add src/components/quote/stepValidation.ts src/components/quote/stepValidation.test.ts src/components/quote/QuoteForm.tsx
git commit -m "feat(quote): guarded Continue scrolls to first unanswered question with hint"
```

---

### Task 6: sessionStorage resume

**Files:**
- Create: `src/lib/quoteDraft.ts`
- Test: `src/lib/quoteDraft.test.ts`
- Modify: `src/components/quote/QuoteForm.tsx`

**Interfaces:**
- Produces: `serializeQuoteDraft(data: Record<string, unknown>, now: number): string`, `parseQuoteDraft(raw: string | null, now: number): Record<string, unknown> | null`, `QUOTE_DRAFT_KEY = "er-quote-draft-v1"`, `QUOTE_DRAFT_TTL_MS`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/quoteDraft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { serializeQuoteDraft, parseQuoteDraft, QUOTE_DRAFT_TTL_MS } from "./quoteDraft";

describe("quoteDraft", () => {
  const NOW = 1_800_000_000_000;

  it("round-trips form data", () => {
    const data = { firstName: "A", electricalLineDistance: 10, acceptTerms: true };
    const parsed = parseQuoteDraft(serializeQuoteDraft(data, NOW), NOW + 1000);
    expect(parsed).toMatchObject({ firstName: "A", electricalLineDistance: 10 });
  });

  it("never restores acceptTerms", () => {
    const parsed = parseQuoteDraft(serializeQuoteDraft({ acceptTerms: true }, NOW), NOW);
    expect(parsed?.acceptTerms).toBeUndefined();
  });

  it("expires after the TTL", () => {
    const raw = serializeQuoteDraft({ firstName: "A" }, NOW);
    expect(parseQuoteDraft(raw, NOW + QUOTE_DRAFT_TTL_MS + 1)).toBeNull();
  });

  it("tolerates garbage input", () => {
    expect(parseQuoteDraft(null, NOW)).toBeNull();
    expect(parseQuoteDraft("not json", NOW)).toBeNull();
    expect(parseQuoteDraft('{"v":99,"t":1,"data":{}}', NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run src/lib/quoteDraft.test.ts` — module-not-found FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/quoteDraft.ts`:

```ts
// Quote-form draft persistence: the step number already survives reloads
// via the URL (?step=N), but form data lived only in React state — a
// refresh on step 4 landed the visitor on an empty step 4 with a blocked
// Continue and no explanation. Drafts live in sessionStorage (per-tab,
// cleared on browser exit) with a TTL as a second bound.

export const QUOTE_DRAFT_KEY = "er-quote-draft-v1";
export const QUOTE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const VERSION = 1;

export function serializeQuoteDraft(data: Record<string, unknown>, now: number): string {
  // Consent must be re-affirmed on every submission attempt.
  const { acceptTerms: _dropped, ...rest } = data;
  return JSON.stringify({ v: VERSION, t: now, data: rest });
}

export function parseQuoteDraft(raw: string | null, now: number): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: number; t?: number; data?: unknown };
    if (parsed.v !== VERSION) return null;
    if (typeof parsed.t !== "number" || now - parsed.t > QUOTE_DRAFT_TTL_MS) return null;
    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) return null;
    return parsed.data as Record<string, unknown>;
  } catch {
    return null;
  }
}
```

Run: `npx vitest run src/lib/quoteDraft.test.ts` — PASS (4 tests).

- [ ] **Step 4: Wire into QuoteForm**

In `QuoteForm.tsx` add import `import { QUOTE_DRAFT_KEY, serializeQuoteDraft, parseQuoteDraft } from "@/lib/quoteDraft";` then:

(a) Restore once on mount — add to the EXISTING hero-prefill effect (~line 243), at its top, BEFORE the URL-param prefill so explicit URL params win:

```tsx
    try {
      const draft = parseQuoteDraft(sessionStorage.getItem(QUOTE_DRAFT_KEY), Date.now());
      if (draft) setFormData((prev) => ({ ...prev, ...draft }));
    } catch { /* storage unavailable (private mode) — start fresh */ }
```

(b) Save on change (debounced) — new effect after the telemetry hook:

```tsx
  // Persist a draft so refresh / back-navigation resumes instead of
  // dead-ending on a later step with empty state.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        sessionStorage.setItem(QUOTE_DRAFT_KEY, serializeQuoteDraft(formData as unknown as Record<string, unknown>, Date.now()));
      } catch { /* quota/private mode — non-fatal */ }
    }, 400);
    return () => clearTimeout(id);
  }, [formData]);
```

(c) Clear on successful submit — in the submit handler where `result.submissionId` is confirmed (next to `telemetry.trackSubmit(true, …)`):

```tsx
                        try { sessionStorage.removeItem(QUOTE_DRAFT_KEY); } catch { /* ignore */ }
```

- [ ] **Step 5: Gates + manual check**

`npx tsc --noEmit && npm test` — 74 tests (70 + 4).
Dev server: fill step 1-2, reload the page → answers are still there and the step matches the URL; submit a test lead (test email) → draft cleared (sessionStorage empty). Kill server.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quoteDraft.ts src/lib/quoteDraft.test.ts src/components/quote/QuoteForm.tsx
git commit -m "feat(quote): resume drafts from sessionStorage (refresh no longer dead-ends)"
```

---

### Task 7: Final verification + funnel definition

**Files:** none created (report only).

- [ ] **Step 1: Full gates**

`npx tsc --noEmit && npm run lint && npm test` — tsc clean, lint no worse than the 47-error baseline, 74 tests passing.

- [ ] **Step 2: Full manual walkthrough**

Dev server, mobile viewport (390×844 via devtools) AND desktop: complete the entire form end-to-end with a test-pattern email (`test-ux@example.com`), covering: every reveal scrolls visibly and nothing lands under the bottom bar; buckets answer in one tap; address dropdown fully visible (bottom-of-screen case included); Continue-guard scroll + hint; reload-resume mid-form; submission succeeds (`{"success":true,…}`) and the success page renders.

- [ ] **Step 3: Report**

Report includes: commits, test counts, the manual-walkthrough checklist results, and this PostHog funnel definition for before/after measurement (user creates it in the easyRecharge PostHog project, insight type Funnel, conversion window 24h):
`quote_step_viewed [step=1] → quote_step_completed [step=1] → quote_step_completed [step=2] → quote_step_completed [step=3] → quote_step_completed [step=4] → quote_step_completed [step=5] → quote_step_completed [step=6]`, segmented by device type; plus a trends insight on the new `quote_missing_answer_nudge` event broken down by `field` to see which questions block people.

---

## Self-Review (done at plan time)

- **Coverage vs agreed scope:** scroll fix (Task 3), dropdown fix (Task 4), sliders→buckets (Tasks 1-2), Continue guard (Task 5), sessionStorage resume (Task 6), funnel measurement (Task 7). P2 items intentionally excluded.
- **Placeholder scan:** every code step carries full code; grep steps carry expected outcomes.
- **Type consistency:** `BucketOption` (T1) consumed by `RangeButtonGroup` (T2); slider fields stay `number | "na" | null` end-to-end; `firstUnansweredField(step, formData)` matches `StepFields` as a structural subset of `FormData` (extra FormData fields are fine — TS structural typing); `q-<key>` anchor ids match the validator's return values; `VALID_PARKING_LOCATIONS` replaces the inline `validParkingLocations` everywhere it was used (validity + RevealField conditions at lines 950/967).
- **Known risk:** Task 5 touches many scattered lines of a 1870-LOC file (anchors + button handlers) — the reviewer must diff-check that no `goToStep` forward call bypasses the guard and that removed `isStepXValid` references are all cleaned up (`grep -n "isStep[0-9]Valid" src/components/quote/QuoteForm.tsx` must return only `isPhoneValid`/`isEmailValid` if still used by inline errors).
