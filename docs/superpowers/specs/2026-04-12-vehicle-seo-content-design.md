# Vehicle Page SEO Content Enrichment — Design Spec

**Date:** 2026-04-12
**Status:** Draft
**Goal:** Add template-driven editorial content, FAQ, cost estimates, and enhanced schema markup to all 626 vehicle pages to capture charging-time search intent (92% of vehicle-page traffic).

---

## Context

Vehicle pages currently rank pos 5-8 for charging queries (e.g., "temps de recharge tesla model 3") with zero editorial content — only data tables and spec cards. GSC shows 1,323 impressions from charging-time queries across 215 vehicle-related keywords.

Adding 300-400 words of contextual content per page + FAQ schema + Product schema targets:
- Position improvement to 1-3 for charging queries
- FAQ rich snippets (2-3x CTR increase)
- Product rich results in SERP
- Coverage of "prise domestique" intent (272 impressions)

All content is **template-driven** from existing vehicle data — no manual CMS entry needed for 626 pages.

---

## Architecture

```
Vehicle data (Directus)
    ↓
vehicle-content.ts  ←  vehicle-content-strings.ts (FR/DE templates)
    ↓                   ←  global_config.electricity_tariff_chf (Directus)
Structured content objects
    ↓
VehicleSeoSections.tsx (Server Component)
    ↓                   → jsonLd.ts (FAQPage + enhanced Product)
Rendered HTML
```

### New Files

| File | Purpose |
|------|---------|
| `src/lib/vehicle-content.ts` | Pure content generation functions — no JSX, no framework deps |
| `src/lib/i18n/vehicle-content-strings.ts` | FR/DE template strings with `{placeholder}` interpolation |
| `src/components/VehicleSeoSections.tsx` | Server component rendering all new sections |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/seo/jsonLd.ts` | Replace `buildVehicleProduct()` with `buildVehicleCar()` (Car schema, no offers); keep `buildFAQPage()` as-is |
| `src/app/[lang]/[slug]/[sub1]/page.tsx` | Import `VehicleSeoSections`, replace `buildVehicleProduct` with `buildVehicleCar`, add FAQ to JSON-LD graph |
| `src/app/[lang]/[slug]/[sub1]/[sub2]/page.tsx` | Same for `vehicle-model-detail` render |

---

## Section Placement

```
[Existing]  Hero + Spec Cards + Sidebar
[NEW]       1. Editorial intro paragraph
[Existing]  Home Charging Table
[NEW]       2. "Quelle prise" charging advice
[NEW]       3. Cost estimate table
[Existing]  Fast Charging + Smart Charging
[Existing]  Real World Range
[Existing]  Technical Specifications
[NEW]       4. FAQ accordion + FAQPage schema
[Existing]  GetQuote CTA
```

---

## New Sections Detail

### Section 1: Editorial Intro (80-100 words)

**Position:** Between hero/spec cards and home charging table.

**Template (FR):**
> La {brand} {model}, avec sa batterie de {battery} et son autonomie de {range}, se recharge en {chargeTime11kw} à domicile avec une borne 11 kW triphasée. Voici tout ce qu'il faut savoir pour recharger votre {model} chez vous en Suisse : temps de recharge par type de prise, coût estimé, et conseils d'installation.

**Template (DE):**
> Der {brand} {model} mit seiner {battery}-Batterie und einer Reichweite von {range} lässt sich zu Hause mit einer 11 kW Dreiphasen-Wallbox in {chargeTime11kw} vollständig laden. Hier finden Sie alles Wissenswerte zum Laden Ihres {model} zu Hause in der Schweiz: Ladezeiten nach Steckertyp, geschätzte Kosten und Installationshinweise.

**Data source:** `vehicle.batteryDisplay`, `vehicle.rangeDisplay`, charge time at 11 kW from `homeChargingDetails` array.

**Rendering:** `<p>` within existing section container. Styled as `text-lg text-muted-foreground`.

### Section 2: Charging Advice ("Quelle prise pour recharger votre {model} ?")

**Position:** After home charging table section.

**Content:** One advice card per power level from `homeChargingDetails`, each containing:
- Power level name and kW rating
- Charge time for this vehicle (from existing data)
- Contextual advice paragraph (40-60 words)
- Recommended badge (boolean — true for the level matching or just below AC max power)

**Power levels and advice templates:**

| Power Level | FR Advice Template | Recommended Logic |
|-------------|-------------------|-------------------|
| 2.3 kW (domestic) | "Dépannage uniquement. {time} pour une charge complète. Risque de surchauffe si utilisation prolongée. Non recommandé comme solution permanente." | Never |
| 3.7 kW (reinforced) | "Solution économique (~CHF 200-400 d'installation). {time} de charge. Suffisant si vous roulez moins de 50 km/jour." | Only if AC max ≤ 3.7 kW |
| 7.4 kW (single-phase wallbox) | "Bon compromis qualité-prix. {time} de charge. Installation par électricien certifié ESTI (~CHF 1'500-2'500)." | Only if AC max = 7.4 kW |
| 11 kW (three-phase wallbox) | "Recommandé. {time} de charge. Nécessite un raccordement triphasé (standard en Suisse). Installation ~CHF 2'000-3'500." | If AC max ≥ 11 kW |
| 22 kW (three-phase fast) | "Non exploitée par ce véhicule (chargeur embarqué limité à {acMax} kW). Une borne 11 kW offre les mêmes performances pour moins cher." OR "Exploitée pleinement. {time} de charge. Pour les professionnels ou usage intensif." | If AC max ≥ 22 kW |

**Power level availability:** Only show advice cards for power levels present in `homeChargingDetails`. If a vehicle only has 3 entries, show 3 cards. Don't fabricate data for missing levels.

**Key logic:** If `vehicle.acPower < powerLevel`, mark as "not exploited" and explain why. The `recommended` flag is set on the highest power level that the vehicle can actually use (i.e., ≤ AC max power).

**Rendering:** Vertical card list. Each card shows: power level badge, charge time, advice text. Recommended card gets a green border/highlight.

### Section 3: Cost Estimate

**Position:** After charging advice section.

**Data source:** `vehicle.batteryCapacity` (numeric), `vehicle.efficiency` (Wh/km), `global_config.electricity_tariff_chf` (from Directus).

**Table rows:**

| Scenario | Calculation |
|----------|------------|
| Full charge (0→100%) | `batteryCapacity × tariff` |
| Daily charge (50 km) | `50 × (efficiency / 1000) × tariff` |
| Monthly estimate (1000 km) | `1000 × (efficiency / 1000) × tariff` |

**Footer note:** "Basé sur le tarif moyen suisse {year} (source: Elcom). Varie selon votre fournisseur d'électricité."

**Rendering:** Simple table within a Card component. Three columns: Scenario, kWh, Cost (CHF). Currency formatted with 2 decimal places.

**Fallback:** If `electricity_tariff_chf` is not set in Directus, default to `0.32`.

### Section 4: FAQ Accordion

**Position:** After technical specifications, before GetQuote CTA.

**Questions (6 templates per locale):**

1. **Charge time at home**
   - FR: "Combien de temps pour recharger la {name} à domicile ?"
   - Answer: "{chargeTime11kw} avec une borne 11 kW triphasée, {chargeTime2_3kw} avec une prise domestique 2.3 kW. Le chargeur embarqué de la {model} accepte un maximum de {acMax} kW en courant alternatif."

2. **Which charger**
   - FR: "Quelle borne choisir pour la {name} ?"
   - Answer: "Une borne 11 kW triphasée est recommandée pour la {model}. Le chargeur embarqué accepte jusqu'à {acMax} kW en AC.{notExploitedNote}"

3. **Cost per charge**
   - FR: "Combien coûte une recharge complète de la {name} en Suisse ?"
   - Answer: "Environ CHF {fullChargeCost} à domicile au tarif moyen suisse de CHF {tariff}/kWh. Pour un usage quotidien de 50 km, comptez environ CHF {dailyCost} par jour."

4. **Installation requirements**
   - FR: "Faut-il une installation spéciale pour recharger la {name} ?"
   - Answer: "Une borne murale nécessite un raccordement par un électricien certifié ESTI. En Suisse, la plupart des habitations disposent déjà d'un raccordement triphasé, ce qui facilite l'installation d'une borne 11 kW."

5. **Fast charging compatibility**
   - FR: "La {name} est-elle compatible avec la recharge rapide ?"
   - Answer: Dynamic based on `fastChargingData`: "Oui, via port {dcPort}, jusqu'à {dcMaxPower} de puissance maximale. Temps de charge de 10% à 80% : {dcTime}." OR "Ce véhicule ne dispose pas de recharge rapide DC."

6. **Real-world range**
   - FR: "Quelle est l'autonomie réelle de la {name} en Suisse ?"
   - Answer: "{rangeMax} en conditions optimales (temps doux, ville). En hiver : {coldCombined}. Sur autoroute : {mildHighway}."

**Schema:** `buildFAQPage(faqItems)` added to the JSON-LD graph alongside BreadcrumbList and Product.

**Rendering:** Reuse the existing `<FAQ>` component from `src/components/FAQ.tsx` (accepts `items: FAQItem[]`, renders Accordion). No image sidebar needed for vehicle FAQ.

### Section 5: Schema Markup Changes

#### Replace Product with Car Schema

**Why:** easyRecharge does not sell vehicles — it provides charging information and installation services. Google has already rejected the existing Product schema due to missing price. Product schema is semantically incorrect for this use case.

**Action:** Remove `buildVehicleProduct()` usage from vehicle pages. Replace with `buildVehicleCar()` using `@type: "Car"` (schema.org/Car, a subtype of Vehicle).

**No `offers` field** — we are not selling the car. The Car schema describes the vehicle's specifications relevant to charging.

```typescript
buildVehicleCar({
  name: "Tesla Model 3 Premium AWD Highland",
  brand: "Tesla",
  description: "...",
  imageUrl: "...",
  url: "...",
  // Car-specific properties
  fuelType: "https://schema.org/ElectricFuel",
  vehicleConfiguration: "AWD",  // if available from performance.drive_type
  // EV charging properties as additionalProperty
  properties: {
    batteryCapacity: "75 kWh",
    range: "500 km",
    acChargingPower: "11 kW",
    dcMaxChargingPower: "250 kW",
    chargePort: "CCS",
    efficiency: "150 Wh/km",
  },
})
```

The Car schema provides structured data for Google's knowledge panels and vehicle search features, without requiring pricing or availability.

#### FAQPage Schema (Primary SEO Play)

FAQPage schema is the main rich snippet opportunity. Google reliably shows FAQ dropdowns in SERP for pages with valid FAQPage markup.

Add `buildFAQPage(generatedFAQItems)` to the `wrapInGraph()` call on both vehicle pages. Strip any HTML from FAQ answers before passing to schema builder.

---

## i18n Strategy

### String file: `src/lib/i18n/vehicle-content-strings.ts`

```typescript
type Locale = "fr" | "de";

interface VehicleContentStrings {
  intro: string;
  sectionTitles: {
    advice: string;  // "Quelle prise pour recharger votre {model} ?"
    cost: string;    // "Coût de recharge estimé"
    faq: string;     // "Questions fréquentes sur la {name}"
  };
  advice: Record<string, { description: string }>;
  adviceNotExploited: string;
  adviceRecommended: string;
  cost: {
    fullCharge: string;
    daily: string;
    monthly: string;
    source: string;
    colScenario: string;
    colKwh: string;
    colCost: string;
  };
  faq: Record<string, { question: string; answer: string }>;
}

export const vehicleContentStrings: Record<Locale, VehicleContentStrings>;
```

**Placeholder syntax:** `{variableName}` — same as the existing `t()` function in `src/lib/i18n/dictionaries.ts`.

**Interpolation:** A simple `interpolate(template, vars)` helper replaces `{key}` with values from a vars object. Reuse pattern from existing `t()` function.

---

## Data Flow

### Tariff from Directus

**New field:** `electricity_tariff_chf` (number) in `site_settings.global_config`.

**Access path:** `layoutData.global_config.electricity_tariff_chf`

**Fallback:** `0.32` if field is missing or null.

**Fetch:** Already available via `fetchLayout(locale)` — no new API call. The vehicle detail pages already call `fetchLayout()` (Sub1 via `buildDictionary()`, Sub2 directly).

### Content Generation Flow

```
1. Page fetches vehicle data + layout data (existing calls)
2. Extract tariff: layoutData.global_config.electricity_tariff_chf ?? 0.32
3. Call generateVehicleIntro(directusVehicle, vehicle, locale)
4. Call generateChargingAdvice(directusVehicle, homeChargingDetails, locale)
5. Call generateCostEstimate(vehicle, tariff, locale)
6. Call generateVehicleFAQ(vehicle, directusVehicle, homeChargingDetails, costData, locale)
7. Pass all to <VehicleSeoSections> component
8. Add FAQ items to JSON-LD graph
```

---

## Component Design: `VehicleSeoSections`

```typescript
interface VehicleSeoSectionsProps {
  locale: "fr" | "de";
  intro: { text: string };
  advice: {
    title: string;
    items: ChargingAdviceItem[];
  };
  cost: {
    title: string;
    rows: CostRow[];
    tariff: number;
    source: string;
  };
  faq: {
    title: string;
    items: Array<{ id: string; question: string; answer: string }>;
  };
  lang: string;
  pageRegistry: PageRegistryEntry[];
}
```

The component is a Server Component (no "use client"). It renders four distinct `<section>` elements with consistent styling matching the existing vehicle page sections.

The FAQ section reuses the existing `<FAQ>` component from `src/components/FAQ.tsx`.

**The component does NOT handle data generation** — it receives pre-computed content objects as props. This keeps rendering separate from content logic.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Vehicle with no home charging data | Skip intro, advice, cost sections. Still show FAQ with available data. |
| Vehicle with no DC fast charging | FAQ question 5 answers "not available" variant. |
| Vehicle with no real-world range data | FAQ question 6 uses WLTP range fallback. |
| AC max power unknown | Advice section skips "not exploited" logic, shows all levels neutrally. |
| Efficiency data missing | Cost section not rendered (can't calculate without consumption). |
| Battery capacity is 0 or null | Cost section not rendered. |
| Tariff field missing in Directus | Falls back to 0.32 CHF/kWh. |
| Template placeholder has no data | Replace with "-" or skip the sentence containing it. |

---

## Verification Plan

1. **Build check:** `npm run build` — ensure no type errors and all 626+ static pages generate successfully.
2. **Visual check:** `npm run dev` → navigate to a vehicle page (e.g., Tesla Model 3) and verify:
   - Intro paragraph appears between hero and charging table
   - Advice cards appear after charging table with correct times and recommendations
   - Cost table shows correct calculations (battery × tariff)
   - FAQ accordion expands/collapses, content is interpolated correctly
3. **Schema validation:** View page source → copy JSON-LD → paste into [Google Rich Results Test](https://search.google.com/test/rich-results):
   - FAQPage schema validates with all 6 questions
   - Car schema validates with fuelType and additionalProperty entries (no offers/price)
   - BreadcrumbList still valid
4. **Both page types:** Check both a `vehicle-detail` page (Sub1) and a `vehicle-model-detail` page (Sub2) to confirm both render identically.
5. **Language check:** Switch to `/de/` and verify German templates render correctly.
6. **Edge case:** Check a vehicle with minimal data (no DC charging, no real-world range) to verify graceful degradation.
7. **Lint:** `npm run lint` passes.
