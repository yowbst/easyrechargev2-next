# Battery Quote Funnel — Design

**Date:** 2026-10-03
**Status:** Approved in conversation, pending written review
**Author:** Yoan (with Claude)

## Goal

Open a second lead vertical, the home solar battery, on the same business model as
the EV charger: a visitor answers a short funnel, the lead is categorised, dispatched
to partner installers, priced and invoiced through the existing chain. The funnel
targets owners of an existing PV installation. The full chain (dispatch, pricing,
invoicing, Ads conversions) is live from day one.

Two follow-up sub-projects are out of scope here but shape a few hooks: a public
self-consumption calculator (B) that will sit at the top of this funnel, and a paid
ROI analysis service (C) marketed from it.

## Decisions (locked)

| Question | Decision |
|---|---|
| Audience | Owners (and co-owners) of an existing or in-progress PV installation. Tenants exit softly. Visitors without PV are captured but never dispatched. |
| Partner chain | Full chain from launch: dispatch, pricing matrix, invoicing, Ads conversions. No pilot phase. |
| Lead categories | Housing status × PV size (threshold 10 kWc): `owner_pv_small`, `owner_pv_large`, `co_owner_pv_small`, `co_owner_pv_large`, plus `no_pv` (stored, not dispatchable). "Don't know" counts as small. |
| Form implementation | New product-agnostic `QuoteShell` + battery steps. `QuoteForm.tsx` (EV charger) is not modified; its migration onto the shell is a later, separate change. |
| Design | The funnel opts into direction B via `data-direction-b` and reuses the charger funnel's components re-tokenised. No new component family. |
| Consumption input | Proxy by household count and household size, with an optional exact kWh entry. Typical profiles live in Directus page config, sourced from a cited public reference. |
| Cross-sell | Only after submission, on the success page, conditional on the lead's own answers, in both directions. Nothing is added before the contact step. |

## Current state (from codebase exploration)

- `src/lib/products.ts`: `PRODUCTS = ["ecp"]`. A product is already defined as "a
  distinct lead vertical (own quote funnel, own partner pricing column, own Ads
  conversion actions)" with a four-step checklist for adding one.
- Pricing is `pricing_policy.settings.prices[product][category]` with free string keys
  (`src/lib/dispatch/queries.ts` `buildPartnerLeadPrices`). Dispatch context, Make
  webhook payload, ledger, billing scope and invoice document all carry `product`.
  None of these need a schema change.
- Two functions are hard-wired to the charger: `deriveLeadCategory`
  (`src/lib/dispatch/categorize.ts`, six categories from `housingStatus` ×
  `solarEquipment`) and lead scoring (`src/lib/dispatch/scoring.ts`, factors
  `volume` = chargers and `solar_upsell`).
- `LeadCategory` is a closed TS union in `src/lib/dispatch/types.ts`, consumed by
  13 files. Partner UI labels categories through Directus translations
  `category.<key>` in one shared namespace.
- Routing recognises the funnel by `entry.id === "quote"` in three places:
  `src/lib/route-resolver.ts` (`INTERACTIVE_PAGES`, sub1 handling for
  `/confirmation` and `/{uuid}`), `src/app/[lang]/[slug]/page.tsx` (render),
  `QuoteSuccess` / `QuoteSubmissionView` (dictionary prefixes `pages.quote-success`,
  `pages.quote-view`).
- `QuoteForm.tsx` is ~1 800 lines: seven `{step === N && (...)}` JSX blocks. Steps
  1–4 (housing, parking, charger, vehicle) are charger-specific (~476 lines); welcome,
  contact (address first), finalize, navigation, draft resume, guarded Continue,
  analytics and submission are generic (~1 300 lines).
- Pure, reusable modules already exist: `stepValidation.ts` (pattern),
  `quoteBuckets.ts`, `quoteDraft.ts` (single key `er-quote-draft-v1`),
  `leanVariant.ts`, `RangeButtonGroup`, `IconButtonGroup`, `RevealField`,
  `PlaceAutocomplete`.
- Uncommitted design-system work tokenises `ui/button`, `badge`, `input`, `textarea`
  (`--control-h-*`, `--field-h`, `--badge-radius`, tone colours) with `:root` defaults
  equal to the current sizes and direction-B values scoped under
  `html:has([data-direction-b])` and `[data-partner-shell]`. This socle must be
  committed before the funnel is built.

## Funnel content

Nine to twelve answers depending on branches, one step fewer than the charger funnel.

| # | Step | Fields | Purpose |
|---|---|---|---|
| 0 | Welcome | none | Promise, trust figures. Reserved slot for the calculator hook (B). |
| 1 | Housing | `housingStatus` owner / co-owner / tenant · `housingType` house / apartment · `solarEquipment` exists / in-progress / none | Price category. Tenant → soft exit message, no capture. `none` → short message, then straight to Contact; category `no_pv`. |
| 2 | PV installation | `pvPower` buckets < 6 / 6–10 / 10–20 / > 20 kWc / don't know, plus "I know the exact value" → numeric kWc · `inverterBrand` solaredge / fronius / huawei / sma / other / unknown · `existingBattery` none / exists-wants-extension | Price category (10 kWc threshold); DC vs AC coupling hint for the partner. Hidden when `solarEquipment = none`. |
| 3 | Consumption & project | `householdCount` 1 / 2 / 3 / 4+ · `householdSize` 1 / 2 / 3–4 / 5+ (only when one household) · `annualConsumption` optional numeric kWh behind "I know my annual consumption" · `heatPump` yes / no · `evCount` 0 / 1 / 2 / 3+ vehicles charging on this installation · `evPlanned` yes / no (revealed when `evCount = 0`) · `hasCharger` yes / no (revealed when `evCount ≥ 1`) · `deadline` asap / 2-3mo / 3-6mo / 6+mo | Calculator inputs (B), scoring. `deadline` is the existing urgency factor. `hasCharger` decides the charger cross-sell on the success page. Hidden when `solarEquipment = none`. |
| 4 | Contact | address first, then identity and phone | Shell step, identical to the charger. Address yields the canton. |
| 5 | Finalize | `approval` (co-owners only), `comment`, `acceptTerms` | Shell step. |

Conventions carried over from the charger funnel:

- Bucket fields store a representative numeric value (e.g. `pvPower = 8` for
  "6–10 kWc"), as in `quoteBuckets.ts`, so Make, partner e-mails and the calculator
  receive a number. An exact entry overrides the bucket value in the same field;
  a sibling boolean (`pvPowerExact`, `annualConsumptionExact`) records that the
  value was typed, for the calculator's precision message.
- Every step has a `firstUnansweredField` validator mirroring its reveal logic.
- Typical consumption profiles per household size are **not** part of this
  sub-project: the funnel does not use them. They move to the calculator (B), with
  a cited source.
- Option cards use native-button components (`IconButtonGroup`,
  `RangeButtonGroup`), never the Base UI `RadioGroup`: no `forwardCardClick` shim,
  no synthetic double clicks in autocapture. `RangeButtonGroup` gains
  `allowNa` (default `true`, charger unchanged) for questions without
  "don't know" (household count, EV count).

## Category derivation

`deriveLeadCategory(product, data)`:

| product | input | category |
|---|---|---|
| ecp | unchanged | one of the six existing categories |
| battery | `solarEquipment = none` | `no_pv` |
| battery | `housingStatus = tenant` | never reaches the server (soft exit) — defensively `no_pv` |
| battery | owner, `pvPower ≥ 10` | `owner_pv_large` |
| battery | owner, `pvPower < 10` or unknown | `owner_pv_small` |
| battery | co-owner, same split | `co_owner_pv_large` / `co_owner_pv_small` |

`isDispatchable(category)` returns false for `no_pv`.

## Product, routing and pages

- `PRODUCTS = ["ecp", "battery"]`; `DEFAULT_PRODUCT` stays `ecp`.
- `FUNNEL_ROUTES: Record<string, Product> = { quote: "ecp", "quote-battery": "battery" }`
  in `products.ts`. The resolver, `[slug]/page.tsx` and the success/view pages use
  this table instead of testing `"quote"`. `SlugRoute` / `Sub1Route` quote variants
  gain a `product` field.
- Directus: page `route_id = "quote-battery"`, slugs per language, `config.product =
  "battery"`, `config.steps` overrides (tooltips, bucket overrides) as for the
  charger, translations under `pages.quote-battery.*`.
- `QuoteSuccess` and `QuoteSubmissionView` take a `dictPrefix` and look up
  `pages.quote-battery-success.*` / `pages.quote-battery-view.*` first, falling back
  to `pages.quote-success.*` / `pages.quote-view.*`. Only differing copy is
  translated.
- Draft key is namespaced per product: `er-quote-draft-v1:<product>`. The charger
  keeps reading the legacy un-suffixed key until it migrates.
- Sitemap, hreflang and the language switcher read the page registry and need no
  change.
- **Cross-sell CTA on the success page.** `QuoteSuccess` already renders CTAs from
  Directus (`cta.page_route_id`). Each CTA gains an optional `show_when` condition
  evaluated against the submission data (`field`, `in: [values]`, all conditions
  must hold). Two rules ship in Directus:
  - on `quote-success` (charger): `solarEquipment in [exists, in-progress]` and
    `homeBattery in [none]` → CTA to `quote-battery`;
  - on `quote-battery-success`: `evCount ≥ 1` and `hasCharger = no`, or
    `evPlanned = yes` → CTA to `quote`.
  The success page today only reads `firstName` from the query string. When at
  least one CTA carries `show_when`, it fetches the submission once
  (`GET /api/form-submissions/{id}`, already used by the submission view); a CTA
  with `show_when` stays hidden until the data is loaded, and stays hidden if the
  fetch fails or the condition is malformed. Answer handoff between funnels is
  sub-project D (see below).
- **Submission view and partner link.** The partner dashboard links every lead to
  `/{lang}/demande-devis/{id}?view=partner`, and `QuoteSubmissionView` hardcodes
  the charger sections. The view picks its sections from `submission.product`
  (battery: installation and consumption sections instead of housing, parking,
  charger, vehicle), and the `[sub1]` submission route merges the
  `quote-battery` / `quote-battery-view` dictionaries over the charger ones. The
  partner link therefore keeps working unchanged for battery leads.

## Server chain

- `src/lib/dispatch/types.ts`: add the five battery categories to the `LeadCategory`
  union **and** `LEAD_CATEGORIES`. `DispatchStatus` is unchanged.
  Directus translations `category.<key>` (fr-FR, de-DE) ship in the same change,
  per the enum checklist in memory.
- `/api/quote`: compute the category with the product; if not dispatchable, skip
  `runDispatch` and write **no ledger row** (`partner_dispatches.partner` is
  required, and coverage gaps are already PostHog-only by convention — see
  `docs/directus-partners-schema.md`). Capture a server PostHog event
  `dispatch_not_dispatchable`, and still fire the Make webhook with a dispatch block
  whose `targets` is empty and `summary.reasons` is `["not_dispatchable"]`, so the
  visitor confirmation e-mail goes out. The response carries `dispatchable: false`;
  the client then fires no Ads `quote_submit` conversion and appends `nd=1` to the
  success URL, which makes the success-page fallback conversion
  (`GoogleAdsConversion`) a no-op too.
- **Dispatch dedup per product.** `findRecentDispatchesByEmail` filters the ledger
  on partner, environment, window and e-mail only; a charger lead followed by a
  battery lead within the window would be skipped at a partner who does both. Add
  `filter[product][_eq]` (the `partner_dispatches.product` column already exists)
  and pass `product` from `runDispatch`. Test: same e-mail, same partner, two
  products inside the window → both dispatched.
- Pricing: `prices.battery.<category>` in partner pricing policies. No code change.
  Missing rows behave as today (gift, `no_price_row` warning).
- Scoring becomes per product. Battery factors: `ownership`, `authorization`,
  `urgency` reused; `pv_size` (small 0.6 / large 1); `load` (3+ EVs 1 / 1–2 EVs or
  heat pump 0.8 / EV planned 0.5 / none 0.3). Default weights 0.2 / 0.2 / 0.25 /
  0.15 / 0.2. Translations `score.factors.pv_size`, `score.factors.load`.
  Per-partner weight overrides work by key, unchanged.
- Billing: no change. Invoices mix products per partner; a per-product invoice
  filter in `billing/scope.ts` is a later decision.
- Make (outside the repo): route the partner e-mail to a battery template on
  `product`, map `battery` to its Ads conversion actions, confirm the visitor
  confirmation template handles `no_pv`.
- Google Ads: `global_config.google_ads.conversions.battery.{quote_start,
  quote_submit}` in Directus; code already keyed by product.
- PostHog: same event names (`quote_step_viewed`, `quote_step_completed`,
  `quote_submitted`, `quote_missing_answer_nudge`, `quote_success_viewed`) with
  `product` in the properties. Existing funnels get a product filter rather than a
  copy.

## Components

```
src/components/quote-shell/
  QuoteShell.tsx          form state, navigation, progress, guarded Continue,
                          per-product draft, PostHog + Ads events, submission
  WelcomeStep.tsx         extracted from QuoteForm step 0, behaviour unchanged
  ContactStep.tsx         extracted from QuoteForm step 5 (address first)
  FinalizeStep.tsx        extracted from QuoteForm step 6
  types.ts                ProductFunnel = { product, steps: StepDef[],
                          firstUnansweredField, initialData, deriveSubmitExtras }
  products/battery/
    index.ts              the ProductFunnel for battery
    steps.tsx             HousingStep, PvStep, ConsumptionStep
    validation.ts         firstUnansweredField for steps 1–3 (+ tests)
    buckets.ts            pvPower, annualConsumption, householdSize defaults
```

Extraction means copying the three generic step bodies out of `QuoteForm.tsx`
into the shell files; `QuoteForm.tsx` keeps its own copies until it migrates. The
duplication is temporary and bounded to those three steps.

`[slug]/page.tsx` renders `QuoteForm` for `ecp` and `<QuoteShell funnel={battery} />`
for `battery`. The shell page root carries `data-direction-b`.

## Design

Direction B tokens apply through `data-direction-b`. The funnel reuses the charger
funnel's option cards, bucket buttons, progress bar and step card. Product-specific
work is limited to the welcome step (visual, promise, calculator slot) and the icons
of the new options. A frontend-design pass happens at implementation time for the
welcome step only.

## Testing

- Vitest: `products/battery/validation.ts` (tenant exit, no-PV branch, one vs many
  households, exact entries, `evPlanned` and `hasCharger` reveals); success-page
  `show_when` evaluation; `deriveLeadCategory` per product
  incl. threshold and unknown; battery scoring; `/api/quote` `no_pv` short-circuit
  (ledger row, no dispatch, webhook with empty targets).
- Browser: replay the July headless-Chrome option-card click test on the new funnel
  (Base UI radios render spans; the dead-click class of bug is known).
- Staging end-to-end: one lead per category with a test e-mail pattern, verify ledger,
  Make run, partner e-mail template, PostHog events with `product = battery`.

## Rollout

1. Commit the design-system socle (`globals.css` tokens + four `ui/` primitives)
   separately from the home-B content work.
2. Deploy the funnel to staging with the Directus page, config and translations.
3. Create battery partners, areas, `prices.battery.*` and Ads conversion entries in
   Directus.
4. Adapt the Make scenario.
5. Run the staging end-to-end checks.
6. Production. `DISPATCH_MODE` is global, so the battery funnel is live immediately.

## Follow-ups and parallel work

- **Sub-project D — answer handoff between funnels (bounded, right after A).** A
  cross-sold visitor starts the second funnel with identity, address and housing
  prefilled from the first submission (same mechanism as the mini-quote session
  token, extended to the shared fields), skipping the contact step. The shell is
  built with a `prefill` input so D is additive.
- **Content (Directus, in parallel with the code).** Pillar page
  `/fr/batterie-solaire` (+ de) built from existing blocks: calculator hook (B),
  how it works, price expectations, FAQ, CTA to the funnel. A blog category
  "batterie" with three to five guides at launch. A secondary block and a nav
  entry on the home; no new home page.
- **solarcharge.ch.** 301 to the pillar page via a host-conditioned redirect in
  `next.config.ts` once the domain is attached to the Vercel project. Revisit as a
  content microsite only if the pillar page shows a brand-fit problem.
- **Make.** A delayed follow-up to charger leads with solar and no battery, reusing
  the same signals as the on-site cross-sell.

## Out of scope

- Migrating the charger funnel onto `QuoteShell`.
- The self-consumption calculator (sub-project B) and the paid ROI service (C).
- 301 redirect of solarcharge.ch to the battery funnel page.
- Per-product invoices.
- Cross-selling charger leads with `solarEquipment = exists` and `homeBattery = none`
  into the battery vertical (data already captured; a later query, not a funnel change).
