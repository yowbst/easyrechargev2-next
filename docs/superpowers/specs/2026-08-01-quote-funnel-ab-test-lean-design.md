# Lean Quote Funnel A/B Test — Design

**Date:** 2026-08-01
**Status:** Approved, ready for implementation plan
**Author:** Yoan (with Claude)

## Goal

Test whether removing six informational questions from the quote funnel increases
the submission rate, without permanently committing to the change until we have
data. One lean variant vs the current funnel (control), 50/50.

## Decisions (locked)

| Question | Decision |
|---|---|
| Variant structure | **One lean variant vs control** (50/50). Not multiple/sequential. |
| Primary metric | **Submission rate**: `exposure → quote_submitted`. |
| Guardrail | **None** — optimize submissions only; lead-quality impact assessed manually after the test. |
| Assignment mechanism | **PostHog Experiments** (client-side feature flag), resolved once at welcome → step 1. |

## Fields removed in the `lean` variant

All six are **informational data forwarded to partners** — verified they do **not**
feed lead categorization or partner routing:

- `deriveLeadCategory` (`src/lib/dispatch/categorize.ts`) reads only `housingStatus`
  and `solarEquipment` — neither is removed.
- The Make webhook (`src/lib/dispatch/webhook.ts`) forwards the whole `quoteData`
  blob and references none of the six by name.

| Field | Step | Label |
|---|---|---|
| `electricalBoardType` | 1 (housing) | tableau électrique |
| `electricalLineDistance` | 2 (parking) | distance ligne électrique |
| `electricalLineHoleCount` | 2 (parking) | nb of walls / walls to cross |
| `ecpProvided` | 3 (charger) | borne/wallbox fournie |
| `vehicleTripDistance` | 4 (vehicle) | distance quotidienne |
| `vehicleChargingHours` | 4 (vehicle) | recharge quotidienne |

**No step becomes empty** in the lean variant:
- Step 1 keeps housingStatus, housingType, solarEquipment, homeBattery (cond.), neighborhoodEquipment (cond.).
- Step 2 keeps parkingSpotLocation.
- Step 3 keeps parkingSpotCount, deadline.
- Step 4 keeps vehicleStatus.

Therefore `totalSteps` stays **6** and `ProgressBar` is untouched.

## Architecture

### Current state (from codebase exploration)

- `src/components/quote/QuoteForm.tsx` (~1924 lines): steps are **hardcoded JSX**
  gated by `{step === N && (...)}`, with per-question progressive reveal via the
  `RevealField` wrapper. There is **no step-config array**.
- Client validation lives in `src/components/quote/stepValidation.ts` —
  `firstUnansweredField(step, formData)` returns the first missing field key in
  visual order and drives `canProceed` / the nudge. **This must mirror the reveal
  logic**, or the Next button gates on an invisible field.
- The Zod schema in `src/shared/validation.ts` is **dead and stale** (not imported,
  out of sync). No change needed there.
- Server (`src/app/api/quote/route.ts`) validates only firstName/lastName/email and
  stores the rest as an untyped `quoteData` blob → Directus + Make webhook.
- **No feature-flag / experiment infrastructure exists** in the app today. PostHog
  is wired for events only; its client is lazy-initialized (`requestIdleCallback` /
  5s) and can be `null` on first render.

### Change 1 — Variant resolution (locked once, control-safe)

In `QuoteForm`, resolve the variant **exactly once**, the first time `step` becomes ≥ 1:

- Read `ph?.getFeatureFlag('quote-lean-funnel')`.
- If `undefined` / not yet loaded → default to `'control'`.
- Store in component state and **never re-read** — the funnel must not flip
  mid-session even if flags load late.
- The welcome screen (step 0, no questions) buffers PostHog's lazy init, so by the
  time the user reaches step 1 the flag is essentially always ready.
- A `?qv=lean` / `?qv=control` query param **overrides** the flag (QA + verification).

Calling `getFeatureFlag` emits `$feature_flag_called` = the experiment exposure
event. Exposure therefore means "reached the first question step," which aligns the
denominator of the primary metric with experiment participants.

### Change 2 — Single source of truth + gating

```ts
const LEAN_HIDDEN = new Set([
  'electricalBoardType','electricalLineDistance','electricalLineHoleCount',
  'ecpProvided','vehicleTripDistance','vehicleChargingHours',
]);
const isHidden = (field: string) => variant === 'lean' && LEAN_HIDDEN.has(field);
```

- **JSX:** fold `&& !isHidden('<field>')` into each of the six `RevealField`
  render/visible conditions.
- **Validation:** extend `firstUnansweredField(step, formData, hiddenFields)` with a
  hidden-set parameter and skip those keys. This is the one non-obvious correctness
  point — without it the step is unadvanceable.
- **`ecpProvided` default effect** (QuoteForm ~lines 300-307): skip when hidden.
  Harmless either way, keeps state clean.

### Change 3 — Analytics wiring

- `getFeatureFlag` auto-attaches `$feature/quote-lean-funnel` to subsequent events;
  this is what the PostHog experiment reads.
- Belt-and-suspenders: add `variant` into `quoteEventProps()` so every quote event
  carries the variant for manual funnel breakdowns / cross-checks.

### Change 4 — PostHog experiment (dashboard, no code)

- Flag `quote-lean-funnel`, variants `control` (50%) / `lean` (50%).
- Experiment goal metric: funnel `$feature_flag_called → quote_submitted`.
- Run until PostHog significance or an agreed minimum sample / duration.

## Data / payload impact

Hidden fields stay at their initial empty-string state and flow to Directus + the
Make webhook as empty values. **Not stripped** from the submission (simplest, no
routing dependency). Acceptable because nothing downstream keys on them.

## Rollout

1. Ship the gated code with the experiment **not yet launched** → everyone resolves
   to `control`, nothing changes for existing users. Verify control is untouched.
2. Flip the experiment to 50/50 from the PostHog dashboard — **no second deploy**.
3. Ramp / kill from the dashboard.

## Testing

- **Unit** (`stepValidation.test.ts`): for each affected step (1–4), assert
  `firstUnansweredField` skips hidden fields and returns the next real field, so lean
  steps stay advanceable; and that with an empty hidden-set (control) behavior is
  unchanged.
- **Manual / verify** via `?qv=lean`: all six questions absent, every step advances,
  submission succeeds with the six keys empty/absent. Repeat `?qv=control` to confirm
  the full funnel is intact.

## Out of scope

- Multiple / sequential variant designs (may follow if the lean variant wins and we
  want per-question attribution).
- Guardrail metric automation — lead-quality assessed manually post-test.
- Any change to `deriveLeadCategory`, the webhook payload, or the dead Zod schema.
- Reworking the hardcoded-JSX step structure into a config array (not needed for
  this test; would be a larger refactor).

## Open risks

- Adblocked / PostHog-blocked users fall to `control` (lost sample, not corrupted
  data). Acceptable.
- If lean wins, remember the six fields were partner-facing info — evaluate whether
  partners miss that data before making the removal permanent.
