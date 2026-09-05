# Mini-Quote UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the mini-quote widget's three P0 defects (locality dropdown clipped by the card, hero variant analytically invisible, silently-disabled CTA) and four P1 interaction gaps (summary rows mostly dead, no selected-state in hero grid, no focus handoff, dropdown can clip at viewport bottom).

**Architecture:** Two near-duplicate components — `MiniQuoteCard` (embedded in blog/vehicles/subsidies pages, standard theme) and `MiniQuoteForm` (home hero, glass-on-photo theme) — share `LocalityAutocomplete`. Fixes are applied to both variants symmetrically; the dropdown reuses the already-tested `dropdownPlacement` lib from the big-form work; the CTA guard reuses the `.er-field-nudge` pulse from `globals.css`. No new pure logic → no new unit tests; verification is the existing suite (76 tests must stay green) + a headless-Chrome DOM check reusing the scratchpad harness pattern.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, PostHog (`usePostHog` + `useFormTelemetry`), playwright-core with system Chrome (already installed at the scratchpad, see Task 6).

## Global Constraints

- Branch `staging`. Never `git add -A`/`git add .`. Do not push.
- The deployed prod is fine — this is a new iteration on top of `652375b`.
- `MiniQuoteCard` is server-rendered in the subsidies sidebar for CLS reasons — all new behavior must live in effects/handlers (no SSR-divergent markup).
- The `.er-field-nudge` pulse class already exists in `src/app/globals.css` — reuse it, do not redefine.
- `dropdownPlacement(input, viewportHeight, bottomClearance = 0)` from `src/lib/dropdownPlacement.ts` returns `{ placement: "down" | "up", maxHeight: number }` — reuse as-is (already unit-tested; mini-quote surfaces have no fixed bottom bar → clearance 0 default).
- PostHog event names must mirror the card's existing ones exactly: `mini_quote_viewed`, `mini_quote_submitted`, plus new `mini_quote_nudge` — always with a `form_type` property (`"mini-quote-card"` / `"mini-quote-form"`).
- Gates per task: `npx tsc --noEmit && npm test` (76 passing, unchanged count) and `npx eslint <touched files>` (no NEW issues).
- A dev server may be running on port 3000 — reuse it; do not spawn a second one.
- P2 items are explicitly OUT of scope: `useMiniQuote` extraction, combobox ARIA/keyboard nav.

---

### Task 1: Unclip the card — dropdown must escape `MiniQuoteCard`

**Files:**
- Modify: `src/components/MiniQuoteCard.tsx` (lines 153 and 156)

**Interfaces:** none new.

- [ ] **Step 1: Remove the clip, round the gradient bar instead**

Line 153 — remove `overflow-hidden` from the Card className:

```tsx
      className={`group relative flex flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-md transition-shadow duration-300 hover:shadow-lg ${className}`}
```

Line 156 — the gradient bar's corners were what `overflow-hidden` existed for; round it directly:

```tsx
      <div className="h-1 w-full rounded-t-2xl bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
```

- [ ] **Step 2: Gates**

Run: `npx tsc --noEmit && npm test && npx eslint src/components/MiniQuoteCard.tsx`
Expected: tsc clean, 76 tests, no new lint.

- [ ] **Step 3: Visual sanity via dev server**

`curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/fr/blog` → 200 (BlogListing embeds MiniQuoteCard; if that page lacks the card in this environment, use the vehicles listing — find its slug via `curl -s http://localhost:3000/api/debug/urls | grep -o '"/fr/[a-z-]*"' | sort -u`). Full DOM verification happens in Task 6.

- [ ] **Step 4: Commit**

```bash
git add src/components/MiniQuoteCard.tsx
git commit -m "fix(mini-quote): locality dropdown no longer clipped by the card (overflow-hidden removed)"
```

---

### Task 2: `LocalityAutocomplete` owns its dropdown geometry (flip-up + height cap)

**Files:**
- Modify: `src/components/LocalityAutocomplete.tsx`
- Modify: `src/components/MiniQuoteForm.tsx` (line ~285 — strip positioning from `dropdownClassName`)

**Interfaces:**
- `dropdownClassName` prop becomes SKIN-ONLY (colors/borders/shadows); the component owns positioning (`absolute`, direction, `maxHeight`). Existing default skin preserved.

- [ ] **Step 1: Rework the component**

Replace `src/components/LocalityAutocomplete.tsx` content with:

```tsx
"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { useLocalitySearch } from "@/hooks/useLocalitySearch";
import { dropdownPlacement } from "@/lib/dropdownPlacement";
import type { LocalityResponse } from "@/lib/localities";

export function LocalityAutocomplete(props: {
  value: string;
  onValueChange: (v: string) => void;
  onSelect: (loc: LocalityResponse) => void;
  placeholder?: string;
  limit?: number;
  locale?: string;
  dataTestId?: string;
  inputClassName?: string;
  iconClassName?: string;
  /** Skin only (colors/border/shadow) — positioning and max-height are owned by the component. */
  dropdownClassName?: string;
  /** Focus the input on mount on fine-pointer (desktop) devices. */
  autoFocusOnFine?: boolean;
}) {
  const { value, onValueChange, onSelect } = props;
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [geometry, setGeometry] = useState<{ dir: "down" | "up"; maxHeight: number }>({ dir: "down", maxHeight: 220 });

  const { items, loading } = useLocalitySearch(value, {
    limit: props.limit ?? 5,
    locale: props.locale,
  });

  const updateGeometry = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const res = dropdownPlacement({ top: r.top, bottom: r.bottom }, vh);
    setGeometry({ dir: res.placement, maxHeight: res.maxHeight });
  };

  // Desktop-only autofocus: popping the mobile keyboard uninvited is worse
  // than one extra tap, so gate on a fine pointer.
  const autoFocused = useRef(false);
  if (typeof window !== "undefined" && props.autoFocusOnFine && !autoFocused.current) {
    autoFocused.current = true;
    requestAnimationFrame(() => {
      if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    });
  }

  const skin = props.dropdownClassName ?? "bg-popover border border-border rounded-lg shadow-lg";
  const positioned = `absolute left-0 right-0 z-50 overflow-auto ${geometry.dir === "up" ? "bottom-full mb-2" : "top-full mt-2"} ${skin}`;

  return (
    <div className="relative">
      <MapPin className={props.iconClassName ?? "absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10 pointer-events-none"} />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          const shouldOpen = e.target.value.trim().length >= 2;
          if (shouldOpen) updateGeometry();
          setOpen(shouldOpen);
        }}
        placeholder={props.placeholder}
        onFocus={() => {
          if (value.trim().length >= 2) {
            updateGeometry();
            setOpen(true);
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        data-testid={props.dataTestId}
        className={props.inputClassName ?? "h-12 pl-12"}
      />

      {open && items.length > 0 && (
        <div className={positioned} style={{ maxHeight: geometry.maxHeight }}>
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center px-4 py-3 cursor-pointer hover:bg-muted transition-colors"
              onMouseDown={() => {
                onSelect(item);
                setOpen(false);
              }}
            >
              <MapPin className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">
                {item.postalCode} {item.locality}
              </span>
              <Badge variant="secondary" className="ml-2">
                {item.canton}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {open && !loading && value.trim().length >= 2 && items.length === 0 && (
        <div className={`${positioned} p-3 text-sm text-muted-foreground`}>
          Aucun résultat
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Strip positioning from the hero caller**

In `src/components/MiniQuoteForm.tsx` (~line 285), the `dropdownClassName` currently repeats positioning; reduce it to skin only:

```tsx
              dropdownClassName="bg-popover border border-border rounded-lg shadow-lg"
```

(`MiniQuoteCard` doesn't pass `dropdownClassName` — default skin applies; nothing to change there.)

- [ ] **Step 3: Gates**

Run: `npx tsc --noEmit && npm test && npx eslint src/components/LocalityAutocomplete.tsx src/components/MiniQuoteForm.tsx`
Expected: tsc clean, 76 tests, no new lint. Also grep: `grep -rn "LocalityAutocomplete" src --include="*.tsx"` — confirm only MiniQuoteForm/MiniQuoteCard consume it (if another caller passes a positioning `dropdownClassName`, strip it the same way).

- [ ] **Step 4: Commit**

```bash
git add src/components/LocalityAutocomplete.tsx src/components/MiniQuoteForm.tsx
git commit -m "fix(mini-quote): locality dropdown flips up and caps height to available space"
```

---

### Task 3: Hero variant telemetry parity

**Files:**
- Modify: `src/components/MiniQuoteForm.tsx`

**Interfaces:** emits the same PostHog events as MiniQuoteCard, with `form_type: "mini-quote-form"`.

- [ ] **Step 1: Add the instrumentation**

Imports:

```tsx
import { useFormTelemetry } from "@/hooks/use-form-telemetry";
import { usePostHog } from "@/components/PostHogProvider";
```

Inside the component (after `const router = useRouter();`):

```tsx
  const ph = usePostHog();
  const telemetry = useFormTelemetry({ formType: "mini-quote-form", locale: lang });

  const containerRef = useRef<HTMLDivElement>(null);
  const hasTrackedView = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || hasTrackedView.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTrackedView.current) {
          hasTrackedView.current = true;
          ph?.capture("mini_quote_viewed", { form_type: "mini-quote-form", page_id: pageId, locale: lang });
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ph, pageId, lang]);
```

Attach `ref={containerRef}` to the root `<div>` (line ~170).

In `handleHousingStatusSelect`, first line: `telemetry.trackChange("housingStatus", status);`
In `handleSelectLocality`, first line: `telemetry.trackChange("postalCode", item.postalCode);`

In `handleQuoteClick`, after the early-return guard:

```tsx
    telemetry.trackSubmit(true, { housingStatus, postalCode: selectedLocality.postalCode });
    ph?.capture("mini_quote_submitted", { form_type: "mini-quote-form", page_id: pageId, locale: lang, housing_status: getHousingStatusValue(housingStatus) });
```

And add the PostHog IDs to the POST body (mirroring the card):

```tsx
          posthog: {
            phDistinctId: ph?.get_distinct_id?.() ?? null,
            phSessionId: ph?.get_session_id?.() ?? null,
          },
```

- [ ] **Step 2: Gates + commit**

Run: `npx tsc --noEmit && npm test && npx eslint src/components/MiniQuoteForm.tsx` — clean/76/no new.

```bash
git add src/components/MiniQuoteForm.tsx
git commit -m "feat(mini-quote): hero variant telemetry parity (viewed/changes/submitted + PH ids)"
```

---

### Task 4: Guarded CTA with pulse nudge (both variants)

**Files:**
- Modify: `src/components/MiniQuoteCard.tsx`
- Modify: `src/components/MiniQuoteForm.tsx`

**Interfaces:** new PostHog event `mini_quote_nudge` `{ form_type, field: "housingStatus" | "locality" }`.

- [ ] **Step 1: Shared pulse helper (duplicate the 8 lines in each file — P2 owns the dedup)**

In BOTH components, above the component function:

```tsx
// Pulse the missing section when the CTA is pressed too early — reuses the
// big form's .er-field-nudge ring (globals.css).
function pulse(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("er-field-nudge");
  void el.offsetWidth;
  el.classList.add("er-field-nudge");
  window.setTimeout(() => el.classList.remove("er-field-nudge"), 2600);
}
```

- [ ] **Step 2: MiniQuoteCard wiring**

Add refs:

```tsx
  const statusSectionRef = useRef<HTMLDivElement>(null);
  const localitySectionRef = useRef<HTMLDivElement>(null);
```

Attach `ref={statusSectionRef}` to the status section wrapper (`<div className="space-y-2">`, line ~181) and `ref={localitySectionRef}` to the locality section wrapper (the `space-y-2 animate-in…` div, line ~221).

Rework the guard at the top of `handleQuoteSubmit` (replacing the silent early return):

```tsx
    if (isSubmitting) return;
    if (!housingStatus) {
      ph?.capture("mini_quote_nudge", { form_type: "mini-quote-card", field: "housingStatus" });
      pulse(statusSectionRef.current);
      return;
    }
    if (!selectedLocality) {
      ph?.capture("mini_quote_nudge", { form_type: "mini-quote-card", field: "locality" });
      pulse(localitySectionRef.current);
      localitySectionRef.current?.querySelector("input")?.focus();
      return;
    }
```

Button (line ~275): keep it operable, mute it visually:

```tsx
        <Button
          className={`w-full h-11 font-semibold rounded-xl text-sm tracking-wide${housingStatus && selectedLocality ? "" : " opacity-70"}`}
          disabled={isSubmitting}
          data-testid="button-submit-quote"
          onClick={handleQuoteSubmit}
        >
```

- [ ] **Step 3: MiniQuoteForm wiring — same pattern**

Same two refs on the equivalent wrappers (status section `<div className="space-y-3">` line ~191; locality section line ~236), same guard in `handleQuoteClick` with `form_type: "mini-quote-form"`, and the Button (line ~298):

```tsx
        <Button
          className={`w-full h-12 font-semibold rounded-lg text-[14px]${housingStatus && selectedLocality ? "" : " opacity-70"}`}
          disabled={isSubmitting}
          data-testid="button-mini-quote"
          onClick={handleQuoteClick}
        >
```

- [ ] **Step 4: Gates + commit**

Run: `npx tsc --noEmit && npm test && npx eslint src/components/MiniQuoteCard.tsx src/components/MiniQuoteForm.tsx` — clean/76/no new.

```bash
git add src/components/MiniQuoteCard.tsx src/components/MiniQuoteForm.tsx
git commit -m "feat(mini-quote): guarded CTA pulses the missing section instead of sitting disabled"
```

---

### Task 5: Interaction polish — clickable summary rows, hero selected-state, focus handoff

**Files:**
- Modify: `src/components/MiniQuoteCard.tsx`
- Modify: `src/components/MiniQuoteForm.tsx`

- [ ] **Step 1: Summary rows fully clickable (both components, both rows)**

Each "selected" summary row (status + location) gets `cursor-pointer` and an onClick matching its "Modifier" button; the inner button stays for a11y/affordance (bubbling triggers the same state change — idempotent):

MiniQuoteCard status row (line ~183): add to the div: `onClick={() => setIsEditingHousingStatus(true)}` and append `cursor-pointer` to its className.
MiniQuoteCard location row (line ~224): add `onClick={() => { setIsEditingLocation(true); setSearchValue(`${selectedLocality.postalCode} ${selectedLocality.locality}`); setSelectedLocality(null); }}` and `cursor-pointer`.
MiniQuoteForm status row (line ~193) and location row (line ~240): same treatment with their respective handlers.

- [ ] **Step 2: Hero grid selected-state**

In MiniQuoteForm's option grid (line ~217), the buttons get a conditional class (they're shown when editing an existing choice too):

```tsx
                className={`flex flex-col items-center justify-center gap-2 h-20 rounded-lg border transition-all ${
                  housingStatus === status
                    ? "border-white bg-white/25 ring-1 ring-white/40"
                    : "border-white/30 bg-white/10 hover:bg-white/20 hover:border-white/50"
                }`}
```

(MiniQuoteCard already has this — line ~202.)

- [ ] **Step 3: Focus handoff to the locality input**

Both components: pass `autoFocusOnFine` to `LocalityAutocomplete` (the component from Task 2 handles the fine-pointer gate). The autocomplete only mounts once housing status is chosen, so mount-time focus == right-after-selection focus:

```tsx
              autoFocusOnFine
```

- [ ] **Step 4: Gates + commit**

Run: `npx tsc --noEmit && npm test && npx eslint src/components/MiniQuoteCard.tsx src/components/MiniQuoteForm.tsx` — clean/76/no new.

```bash
git add src/components/MiniQuoteCard.tsx src/components/MiniQuoteForm.tsx
git commit -m "feat(mini-quote): clickable summary rows, hero selected-state, desktop focus handoff"
```

---

### Task 6: End-to-end DOM verification (headless Chrome)

**Files:**
- Create: `/private/tmp/claude-501/-Users-yoanbasset-Code-easyrechargev2-next/387ccbfa-e04b-4aed-839f-fe29a6ab58b3/scratchpad/clicktest/miniquote.js` (scratchpad — NOT committed)

The harness setup already exists (`scratchpad/clicktest/` has playwright-core + system Chrome channel). Dev server on port 3000 must be running.

- [ ] **Step 1: Write and run the verification script**

```js
const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  // --- Home hero variant ---
  await page.goto("http://localhost:3000/fr", { waitUntil: "networkidle" });
  const hero = page.locator('[data-testid="mini-quote-form"]').first();
  await hero.scrollIntoViewIfNeeded();

  // 1) Guarded CTA: press with nothing selected -> status section pulses
  await page.locator('[data-testid="button-mini-quote"]').click();
  await page.waitForTimeout(200);
  const heroPulse = await page.evaluate(() => !!document.querySelector(".er-field-nudge"));
  console.log("hero nudge pulse on empty CTA:", heroPulse ? "PASS" : "FAIL");

  // 2) Select status -> selected-state class present when re-opened via Modifier
  await page.locator('[data-testid="card-owner"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="button-change-status"]').click();
  await page.waitForTimeout(300);
  const selectedState = await page.locator('[data-testid="card-owner"]').getAttribute("class");
  console.log("hero selected-state:", /bg-white\/25/.test(selectedState) ? "PASS" : "FAIL");
  await page.locator('[data-testid="card-owner"]').click();
  await page.waitForTimeout(300);

  // 3) Locality dropdown opens and is fully hit-testable
  await page.locator('[data-testid="input-postal-code"]').fill("1040");
  await page.waitForTimeout(800);
  const heroItems = page.locator('[data-testid="mini-quote-form"] .cursor-pointer:visible');
  const heroCount = await heroItems.count();
  console.log("hero dropdown items:", heroCount > 0 ? `PASS (${heroCount})` : "FAIL");

  // --- Embedded card variant (blog listing) ---
  await page.goto("http://localhost:3000/fr/blog", { waitUntil: "networkidle" });
  const card = page.locator('[data-testid="card-mini-quote"]').first();
  if ((await card.count()) === 0) { console.log("card variant: not present on /fr/blog — try another page"); await browser.close(); return; }
  await card.scrollIntoViewIfNeeded();
  await card.locator('[data-testid="card-owner"]').click();
  await page.waitForTimeout(300);
  await card.locator('[data-testid="input-locality-search"]').fill("1040");
  await page.waitForTimeout(800);

  // 4) THE unclip check: last dropdown item must be hit-testable even past the card edge
  const cardBox = await card.boundingBox();
  const items = card.locator('[data-testid="card-mini-quote"] div:has(> span)'); // fallback selector below
  const rows = await page.evaluate(() => {
    const dd = document.querySelector('[data-testid="card-mini-quote"] [data-testid="input-locality-search"]')
      ?.closest(".relative")?.querySelector("div[style]");
    if (!dd) return null;
    const rects = [...dd.children].map((c) => c.getBoundingClientRect());
    const last = rects[rects.length - 1];
    const hit = document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2);
    return { count: rects.length, lastBottom: last.bottom, hitInsideDropdown: dd.contains(hit) };
  });
  console.log("card dropdown rows:", JSON.stringify(rows));
  console.log("card unclipped:", rows && rows.hitInsideDropdown ? "PASS" : "FAIL",
    rows && cardBox ? `(last row bottom ${Math.round(rows.lastBottom)} vs card bottom ${Math.round(cardBox.y + cardBox.height)})` : "");

  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
```

Run: `cd <scratchpad>/clicktest && node miniquote.js`
Expected: all four checks PASS. If the `/fr/blog` card is absent, find an embedding page via `curl -s http://localhost:3000/api/debug/urls` and adjust the URL.

- [ ] **Step 2: Full gates**

`npx tsc --noEmit && npm run lint && npm test` — tsc clean, lint no worse than repo baseline (44 errors), 76 tests.

- [ ] **Step 3: Report**

Summarize commits, the four DOM-check results, and remind: new PostHog events to watch post-deploy — `mini_quote_viewed`/`mini_quote_submitted` now fire from the hero too (`form_type` distinguishes variants), and `mini_quote_nudge` shows where people hit the CTA early. P2 ticket: extract `useMiniQuote` hook + combobox ARIA for `LocalityAutocomplete`.

---

## Self-Review (done at plan time)

- **Coverage vs agreed scope:** P0-1 clip (T1+T2), P0-2 telemetry (T3), P0-3 guarded CTA (T4), P1 summary rows/selected-state/focus handoff (T5), P1 dropdown geometry (T2). Progress-bar complaint dropped — re-verified: third segment fills when locality is selected (`currentStep` reaches 3 before the CTA), behavior already correct.
- **Ordering dependency:** T3 (adds `ph` to MiniQuoteForm) MUST run before T4 (uses `ph` in the hero guard) — tasks are ordered accordingly.
- **Placeholder scan:** all code steps carry full code; the verification script is complete.
- **Type consistency:** `pulse(el: HTMLElement | null)` duplicated by design (P2 owns dedup); `autoFocusOnFine` prop defined in T2, consumed in T5; `dropdownClassName` semantics change (skin-only) is applied to its only two consumers, checked by grep in T2.
- **Risk note:** removing `overflow-hidden` (T1) could theoretically let other card content overflow — the card's only edge-touching child is the gradient bar (handled); hover ring/shadow unaffected. The T6 DOM check is the safety net.
