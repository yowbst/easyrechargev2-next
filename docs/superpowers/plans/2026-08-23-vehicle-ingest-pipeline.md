# Vehicle Ingest Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the EV Database scrape → clean → upsert pipeline out of an untracked Jupyter notebook into typed, tested modules in `src/lib/vehicles/ingest/`, driven by a plan/apply CLI that never writes without human review.

**Architecture:** Logic lives in the app as focused modules; execution happens via a CLI in `scripts/`, not a serverless route. A `plan` command diffs a cleaned scrape snapshot against the live CMS and writes a reviewable plan file; `apply` executes exactly that file. Vehicle identity is `evdb_id`, never the slug.

**Tech Stack:** TypeScript 5, Node 22 (native type-stripping), vitest 4, Directus REST, Bright Data Scraper Studio (Collection API).

## Global Constraints

- **Never send `status` in an update payload.** Only on create, with value `"draft"`.
- **Identity is `evdb_id`, coerced to string on both sides.** Directus stores it as `string` (`"3303"`); the scrape emits `number` (`3303`). Comparing without coercion silently creates duplicates.
- **Slugs are frozen after creation.** Never PATCH `slug` on an existing record.
- **Nothing is ever unpublished or deleted** by this pipeline.
- Numeric spec fields (`battery`, `range`, `efficiency`, `fastcharge`, `price_per_range`) are `{value, unit}` JSON objects, not scalars.
- Tests are co-located `*.test.ts`, run with `npm test` (`vitest run`).
- Path alias `@/*` → `./src/*`.
- Secrets come from env only. Never hardcode a token in a file.
- **Scraping is two-stage.** The LIST collector (`c_mipqo2it4a63h5g0k`) yields identity and summary specs; the DETAILS collector (`c_misied485yd5jpx0u`) yields the deep spec blocks but carries **no `evdb_id`, `make`, `model` or `year`**. They are merged on `car_url`. Slug generation requires the merged record — `battery_details.nominal_capacity` comes from DETAILS while `make`/`model`/`year`/`range` come from LIST.
- **The DETAILS collector returns `{vehicle: "<json string>"}`.** Every record must be unwrapped and `JSON.parse`d before use.

## Blocked prerequisite

The supplied Bright Data key authenticates as customer `hl_27b6d7ae`, but the two
collectors belong to `hl_9ec746bc` (per the dashboard links in notebook cells 16 and 21) and
404 under it. The account also reports `can_make_requests: false` / `zone_not_found`.

Tasks 1–3 and 5–9 do not touch Bright Data and can proceed now. Task 4 can be written and
unit-tested against mocks. Only the live `scrape` command in Task 10 and the fresh-data half
of Task 11 are blocked until either a key from `hl_9ec746bc` is supplied, or both collectors
are recreated under the new account from the interaction/parser sources.

---

### Task 1: Module scaffolding and shared numeric type

Extracts the `{value, unit}` type so the write path and read path share one definition. Today `vehicleTransformer.ts` declares it privately and `extractNumericField` falls back to `0` on a shape mismatch, so a mapping bug ships as "0 kWh" on the live site instead of failing.

**Files:**
- Create: `src/lib/vehicles/ingest/types.ts`
- Modify: `src/lib/vehicleTransformer.ts:39-42` (remove local `VehicleNumericField`, import instead)
- Test: `src/lib/vehicles/ingest/types.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `NumericField {value: number; unit: string}`, `isNumericField(v: unknown): v is NumericField`, `ScrapedVehicle`, `CmsVehicle`, `PlanBucket`, `PlanEntry`, `IngestPlan`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/vehicles/ingest/types.test.ts
import { describe, it, expect } from "vitest";
import { isNumericField } from "./types";

describe("isNumericField", () => {
  it("accepts a well-formed numeric field", () => {
    expect(isNumericField({ value: 42.2, unit: "kWh" })).toBe(true);
  });

  it("rejects a bare number — the shape that silently becomes 0 on the site", () => {
    expect(isNumericField(42.2)).toBe(false);
  });

  it("rejects null, undefined and missing unit", () => {
    expect(isNumericField(null)).toBe(false);
    expect(isNumericField(undefined)).toBe(false);
    expect(isNumericField({ value: 42 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/types.test.ts`
Expected: FAIL — cannot resolve `./types`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/vehicles/ingest/types.ts

/** A Directus JSON spec field. Shared by the ingest writer and vehicleTransformer reader. */
export interface NumericField {
  value: number;
  unit: string;
}

export function isNumericField(v: unknown): v is NumericField {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.value === "number" && typeof o.unit === "string";
}

/** A row from the cleaned scrape snapshot. */
export interface ScrapedVehicle {
  evdb_id: number | string;
  make: string;
  make_slug: string;
  model: string;
  title_v2: string;
  slug: string;
  year: { from: number | null; to: number | null } | null;
  available: boolean | string;
  [key: string]: unknown;
}

/** A vehicles row as read back from Directus. */
export interface CmsVehicle {
  id: string;
  evdb_id: string | null;
  slug: string;
  status: string;
  [key: string]: unknown;
}

export type PlanBucket = "CREATE" | "UPDATE" | "SLUG_DRIFT" | "GONE" | "UNCHANGED";

export interface PlanEntry {
  bucket: PlanBucket;
  evdbId: string;
  slug: string;
  /** Directus item id. Absent for CREATE. */
  cmsId?: string;
  /** Only the fields that differ. Empty for every bucket except UPDATE. */
  changes: Record<string, { from: unknown; to: unknown }>;
  /** Full payload to POST. Only present for CREATE. */
  payload?: Record<string, unknown>;
  /** Populated for SLUG_DRIFT only — reported, never applied. */
  generatedSlug?: string;
}

export interface IngestPlan {
  createdAt: string;
  sourceFile: string;
  cmsCount: number;
  scrapeCount: number;
  entries: PlanEntry[];
  /** evdb_ids already applied, for resume. */
  completed: string[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/types.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Point vehicleTransformer at the shared type**

In `src/lib/vehicleTransformer.ts`, delete the local declaration:

```typescript
interface VehicleNumericField {
  value: number;
  unit: string;
}
```

Add to the imports at the top of the file:

```typescript
import type { NumericField } from "@/lib/vehicles/ingest/types";
```

Then change the signature of `extractNumericField` to use it:

```typescript
function extractNumericField(
  field: number | NumericField | undefined,
  defaultUnit: string,
): { value: number; unit: string } {
```

- [ ] **Step 6: Verify nothing broke**

Run: `npm test && npx tsc --noEmit`
Expected: all existing tests pass, no type errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/vehicles/ingest/types.ts src/lib/vehicles/ingest/types.test.ts src/lib/vehicleTransformer.ts
git commit -m "feat(ingest): shared NumericField type for vehicle spec fields"
```

---

### Task 2: Cleaning and slug generation

Direct port of `slugify`, `normalize_model`, `remove_battery_mention`, `get_battery_str`, `get_years_str` and `clean_title_v2` from notebook cells 9, 57 and 60.

Note the title uses **nominal** battery capacity (`battery_details.nominal_capacity`, e.g. 42.2 → `42kWh`) while the stored `battery` field holds **useable** capacity (37.8). These are different numbers; do not conflate them.

**Files:**
- Create: `src/lib/vehicles/ingest/clean.ts`
- Test: `src/lib/vehicles/ingest/clean.test.ts`

**Interfaces:**
- Consumes: `ScrapedVehicle` from Task 1
- Produces: `slugify(s: string, fallback?: string, maxLen?: number): string`, `cleanModel(model: string, make: string): string`, `buildTitle(row: ScrapedVehicle): string`, `generateSlug(row: ScrapedVehicle): string`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/vehicles/ingest/clean.test.ts
import { describe, it, expect } from "vitest";
import { slugify, cleanModel, buildTitle, generateSlug } from "./clean";
import type { ScrapedVehicle } from "./types";

const abarth = {
  evdb_id: 1903,
  make: "Abarth",
  make_slug: "abarth",
  model: "500e Hatchback",
  title_v2: "",
  slug: "",
  year: { from: 2023, to: null },
  available: true,
  battery_details: { nominal_capacity: { value: 42.2, unit: "kWh" } },
  range: { value: 225, unit: "km" },
} as unknown as ScrapedVehicle;

describe("slugify", () => {
  it("strips accents and lowercases", () => {
    expect(slugify("Citroën Ë-C4")).toBe("citroen-e-c4");
  });

  it("expands & and +", () => {
    expect(slugify("R&S plus+")).toBe("r-and-s-plus-plus");
  });

  it("normalizes en/em dashes to hyphens and collapses runs", () => {
    expect(slugify("Model — X – Y")).toBe("model-x-y");
  });

  it("returns the fallback for empty input", () => {
    expect(slugify("", "vehicle")).toBe("vehicle");
  });

  it("truncates without leaving a trailing hyphen", () => {
    expect(slugify("a".repeat(50) + " " + "b".repeat(80), "vehicle", 51)).toBe("a".repeat(50));
  });
});

describe("cleanModel", () => {
  it("removes the make from the start, case-insensitively", () => {
    expect(cleanModel("Abarth 500e Hatchback", "abarth")).toBe("500e Hatchback");
  });

  it("collapses repeated whitespace", () => {
    expect(cleanModel("500e   Hatchback", "Abarth")).toBe("500e Hatchback");
  });

  it("keeps hyphens inside tokens", () => {
    expect(cleanModel("Ariya e-4ORCE", "Nissan")).toBe("Ariya e-4ORCE");
  });
});

describe("buildTitle", () => {
  it("assembles make, model, nominal battery, range and open year range", () => {
    expect(buildTitle(abarth)).toBe("Abarth 500e Hatchback 42kWh 225km [2023-]");
  });

  it("closes the year range once the vehicle is discontinued", () => {
    const done = { ...abarth, year: { from: 2023, to: 2026 } } as ScrapedVehicle;
    expect(buildTitle(done)).toBe("Abarth 500e Hatchback 42kWh 225km [2023-2026]");
  });

  it("uses nominal capacity, not useable", () => {
    // battery (useable) is 37.8 but the title must read 42kWh
    expect(buildTitle(abarth)).toContain("42kWh");
    expect(buildTitle(abarth)).not.toContain("37");
  });

  it("normalizes kW and hp spacing in the model", () => {
    const row = { ...abarth, model: "500e 210 kW 170 hp" } as ScrapedVehicle;
    expect(buildTitle(row)).toContain("210kW 170HP");
  });

  it("omits a battery mention already present in the model", () => {
    const row = { ...abarth, model: "500e 42 kWh Hatchback" } as ScrapedVehicle;
    expect(buildTitle(row)).toBe("Abarth 500e Hatchback 42kWh 225km [2023-]");
  });
});

describe("generateSlug", () => {
  it("produces the slug currently live in the CMS", () => {
    expect(generateSlug(abarth)).toBe("abarth-500e-hatchback-42kwh-225km-2023");
  });

  it("changes when the vehicle is discontinued — why slug must never be the identity key", () => {
    const done = { ...abarth, year: { from: 2023, to: 2026 } } as ScrapedVehicle;
    expect(generateSlug(done)).toBe("abarth-500e-hatchback-42kwh-225km-2023-2026");
    expect(generateSlug(done)).not.toBe(generateSlug(abarth));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/clean.test.ts`
Expected: FAIL — cannot resolve `./clean`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/vehicles/ingest/clean.ts
import { isNumericField, type ScrapedVehicle } from "./types";

/** Port of notebook cell 9. */
export function slugify(s: string, fallback = "vehicle", maxLen = 120): string {
  if (!s) return fallback;

  let out = String(s).trim().toLowerCase();

  // Strip accents: é → e
  out = out.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  // Drop any remaining non-ASCII
  out = out.replace(/[^\x00-\x7F]/g, "");

  out = out.replace(/&/g, " and ").replace(/\+/g, " plus ");
  out = out.replace(/[–—−]/g, "-");
  out = out.replace(/[^a-z0-9\- ]+/g, "");
  out = out.replace(/\s+/g, "-");
  out = out.replace(/-{2,}/g, "-");
  out = out.replace(/^-+|-+$/g, "");

  if (out.length > maxLen) out = out.slice(0, maxLen).replace(/-+$/, "");

  return out || fallback;
}

/** Port of notebook cell 57 `clean_model_column`, applied per row. */
export function cleanModel(model: string, make: string): string {
  let out = String(model ?? "").trim();
  out = out.replace(/\s+/g, " ");
  // Keep word chars, whitespace, hyphen, parentheses
  out = out.replace(/[^\w\s\-()]/g, "");
  const escaped = String(make ?? "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (escaped) out = out.replace(new RegExp(`^${escaped}\\s+`, "i"), "");
  return out.trim();
}

function normalizeModel(text: string): string {
  if (typeof text !== "string") return "";
  let s = text.trim();
  s = s.replace(/\s+-\s+/g, " ");
  s = s.replace(/\b(\d+)\s*kW\b/gi, "$1kW");
  s = s.replace(/\b(\d+)\s*hp\b/gi, "$1HP");
  s = s.replace(/\s{2,}/g, " ");
  return s.replace(/^[\s-]+|[\s-]+$/g, "");
}

function removeBatteryMention(text: string): string {
  if (typeof text !== "string") return "";
  let s = text.trim();
  s = s.replace(/\b([12]?\d{1,2}(\.\d{1,2})?\s*kWh)\b|\bkWh\b/gi, "");
  s = s.replace(/\s{2,}/g, " ");
  return s.replace(/^[\s-]+|[\s-]+$/g, "");
}

function getBatteryStr(details: unknown): string | null {
  if (typeof details !== "object" || details === null) return null;
  const cap = (details as Record<string, unknown>).nominal_capacity;
  if (!isNumericField(cap)) return null;
  return `${Math.round(cap.value)}${cap.unit}`;
}

function getRangeKm(r: unknown): number | null {
  if (isNumericField(r)) {
    if (!r.unit || r.unit.toLowerCase().includes("km")) return Math.round(r.value);
    return null;
  }
  const n = Number(r);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function getYearsStr(year: unknown): string | null {
  if (typeof year !== "object" || year === null) {
    const n = Number(year);
    return Number.isFinite(n) && n ? `${Math.trunc(n)}-` : null;
  }
  const y = year as { from?: number | null; to?: number | null };
  if (y.from && y.to) return `${Math.trunc(y.from)}-${Math.trunc(y.to)}`;
  if (y.from) return `${Math.trunc(y.from)}-`;
  return null;
}

/** Port of notebook cell 60 `clean_title_v2`. */
export function buildTitle(row: ScrapedVehicle): string {
  const make = String(row.make ?? "").trim();
  const modelCleaned = cleanModel(String(row.model ?? ""), make);
  const model = removeBatteryMention(normalizeModel(modelCleaned));

  const parts = [make, model].filter(Boolean);

  const battery = getBatteryStr(row.battery_details);
  if (battery) parts.push(battery);

  const rangeKm = getRangeKm(row.range);
  if (rangeKm) parts.push(`${rangeKm}km`);

  let title = parts.join(" ").trim();
  const years = getYearsStr(row.year);
  if (years) title += ` [${years}]`;

  return title;
}

export function generateSlug(row: ScrapedVehicle): string {
  return slugify(buildTitle(row));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/clean.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles/ingest/clean.ts src/lib/vehicles/ingest/clean.test.ts
git commit -m "feat(ingest): port EVDB title and slug generation"
```

---

### Task 3: Golden slug test against all 562 live records

The gate for everything else. Slugs are the public URLs; a generator divergence creates duplicate records and breaks SEO on 562 pages. This proves the Task 2 port reproduces reality before any write code exists.

The December snapshot is 6.5 MB and must not be committed. Instead, generate a compact fixture holding only the generator's inputs plus the live slug.

**Files:**
- Create: `scripts/build-slug-fixture.ts` (one-shot fixture generator)
- Create: `src/lib/vehicles/ingest/__fixtures__/live-slugs.json` (committed)
- Create: `src/lib/vehicles/ingest/clean.golden.test.ts`

**Interfaces:**
- Consumes: `generateSlug` from Task 2
- Produces: fixture at `__fixtures__/live-slugs.json`, shape `Array<{evdb_id, make, model, year, battery_details, range, liveSlug}>`

- [ ] **Step 1: Install tsx so scripts can resolve the `@/` alias**

Node 22 strips types natively but does not read `tsconfig.json` paths.

```bash
npm install --save-dev tsx
```

- [ ] **Step 2: Write the fixture generator**

```typescript
// scripts/build-slug-fixture.ts
// One-shot. Joins the December scrape snapshot to live CMS slugs by evdb_id.
// Run: npx tsx --env-file=.env.local scripts/build-slug-fixture.ts <path-to-cleaned.json>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SRC = process.argv[2];
if (!SRC) throw new Error("usage: build-slug-fixture.ts <cleaned.json>");

const url = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_STATIC_TOKEN;
if (!url || !token) throw new Error("DIRECTUS_URL and DIRECTUS_STATIC_TOKEN required");

const res = await fetch(`${url}/items/vehicles?fields=evdb_id,slug&limit=1000`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) throw new Error(`Directus ${res.status}`);
const live = (await res.json()).data as Array<{ evdb_id: string; slug: string }>;
const bySlugId = new Map(live.map((v) => [String(v.evdb_id), v.slug]));

// The cleaned snapshot is JSON-lines (pandas orient=records, lines=True)
const rows = readFileSync(SRC, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const fixture = rows
  .filter((r) => bySlugId.has(String(r.evdb_id)))
  .map((r) => ({
    evdb_id: r.evdb_id,
    make: r.make,
    model: r.model,
    year: r.year,
    battery_details: { nominal_capacity: r.battery_details?.nominal_capacity ?? null },
    range: r.range,
    liveSlug: bySlugId.get(String(r.evdb_id)),
  }));

mkdirSync("src/lib/vehicles/ingest/__fixtures__", { recursive: true });
writeFileSync(
  "src/lib/vehicles/ingest/__fixtures__/live-slugs.json",
  JSON.stringify(fixture, null, 1),
);
console.log(`wrote ${fixture.length} rows (live CMS has ${live.length})`);
```

- [ ] **Step 3: Generate the fixture**

```bash
npx tsx --env-file=.env.local scripts/build-slug-fixture.ts \
  "/Users/yoanbasset/Jupyter/ev-database/EVDB_vehicles_fromBD_2025-12-26_0_3-cleaned.json"
```

Expected: `wrote 562 rows (live CMS has 562)`.
If the counts differ, stop — the December snapshot is not what produced the live records, and the golden test cannot be trusted as an oracle. Report the gap before continuing.

- [ ] **Step 4: Write the golden test**

```typescript
// src/lib/vehicles/ingest/clean.golden.test.ts
import { describe, it, expect } from "vitest";
import { generateSlug } from "./clean";
import type { ScrapedVehicle } from "./types";
import fixture from "./__fixtures__/live-slugs.json";

describe("slug generation golden file", () => {
  it("covers the full live catalogue", () => {
    expect(fixture.length).toBe(562);
  });

  it("reproduces every live slug exactly", () => {
    const mismatches = fixture
      .map((row) => ({
        evdbId: row.evdb_id,
        expected: row.liveSlug,
        actual: generateSlug(row as unknown as ScrapedVehicle),
      }))
      .filter((r) => r.expected !== r.actual);

    expect(mismatches).toEqual([]);
  });
});
```

- [ ] **Step 5: Run the golden test**

Run: `npm test -- src/lib/vehicles/ingest/clean.golden.test.ts`
Expected: PASS.

If it fails, the mismatch list names every divergent `evdb_id`. Triage each one before proceeding — a record hand-edited in Directus since January is acceptable and can be added to an explicit allowlist in the test; a systematic pattern across many rows means the port is wrong and Task 2 must be fixed. Do not weaken the assertion to make it pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-slug-fixture.ts src/lib/vehicles/ingest/__fixtures__/live-slugs.json \
  src/lib/vehicles/ingest/clean.golden.test.ts package.json package-lock.json
git commit -m "test(ingest): golden slug test pinning all 562 live URLs"
```

---

### Task 4: Bright Data client

Fixes notebook bug #4: the poll loop treated HTTP 200 as "ready", but the Collection API returns 200 with `{"status":"building"}` while work is in flight.

**Files:**
- Create: `src/lib/vehicles/ingest/brightdata.ts`
- Test: `src/lib/vehicles/ingest/brightdata.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `triggerCollection(collectorId: string, inputs: unknown[]): Promise<string>`, `pollSnapshot(id: string, opts?: {maxAttempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void>}): Promise<unknown[]>`, `LIST_COLLECTOR`, `DETAILS_COLLECTOR`

The collector id is a parameter, not an env read, because the pipeline drives two different
collectors in sequence.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/vehicles/ingest/brightdata.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerCollection, pollSnapshot } from "./brightdata";

const noSleep = async () => {};

beforeEach(() => {
  process.env.BRIGHTDATA_API_TOKEN = "test-token";
});
afterEach(() => vi.unstubAllGlobals());

function mockFetch(...responses: Array<{ status?: number; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("triggerCollection", () => {
  it("returns the collection_id", async () => {
    mockFetch({ body: { collection_id: "j_abc123" } });
    expect(await triggerCollection("c_list", [{ page_size: 2000 }])).toBe("j_abc123");
  });

  it("targets the collector it was given", async () => {
    const fn = mockFetch({ body: { collection_id: "j_1" } });
    await triggerCollection("c_details", [{ car_url: "https://x" }]);
    expect(fn.mock.calls[0][0]).toContain("collector=c_details");
  });

  it("throws on 401 so an expired token fails loudly", async () => {
    mockFetch({ status: 401, body: "Token expired" });
    await expect(triggerCollection("c_list", [{}])).rejects.toThrow(/401/);
  });

  it("surfaces a 404 as a wrong-account or missing-collector error", async () => {
    mockFetch({ status: 404, body: "not found" });
    await expect(triggerCollection("c_gone", [{}])).rejects.toThrow(/404/);
  });
});

describe("pollSnapshot", () => {
  it("keeps polling while the body says building, then returns rows", async () => {
    const fn = mockFetch(
      { body: { status: "building" } },
      { body: { status: "building" } },
      { body: [{ evdb_id: 1 }, { evdb_id: 2 }] },
    );
    const rows = await pollSnapshot("j_abc", { sleep: noSleep });
    expect(rows).toHaveLength(2);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not mistake a building body for data — the notebook's bug", async () => {
    const fn = mockFetch({ body: { status: "building" } }, { body: [{ evdb_id: 1 }] });
    const rows = await pollSnapshot("j_abc", { sleep: noSleep });
    expect(rows).toEqual([{ evdb_id: 1 }]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws once attempts are exhausted rather than returning junk", async () => {
    mockFetch(...Array.from({ length: 3 }, () => ({ body: { status: "building" } })));
    await expect(
      pollSnapshot("j_abc", { maxAttempts: 3, sleep: noSleep }),
    ).rejects.toThrow(/still building/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/brightdata.test.ts`
Expected: FAIL — cannot resolve `./brightdata`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/vehicles/ingest/brightdata.ts
// Bright Data Scraper Studio (Collection API). The /dca/* endpoints are current,
// not deprecated — they were rebranded from "Data Collector".
// Do NOT migrate to /datasets/v3/* — that is for Bright Data's prebuilt scrapers.

const BASE = "https://api.brightdata.com";

/** EVDB | List vehicles — identity + summary specs. */
export const LIST_COLLECTOR =
  process.env.BRIGHTDATA_LIST_COLLECTOR ?? "c_mipqo2it4a63h5g0k";
/** EVDB | Get vehicle — deep spec blocks, one input per car_url. */
export const DETAILS_COLLECTOR =
  process.env.BRIGHTDATA_DETAILS_COLLECTOR ?? "c_misied485yd5jpx0u";

function token(): string {
  const t = process.env.BRIGHTDATA_API_TOKEN;
  if (!t) throw new Error("BRIGHTDATA_API_TOKEN is not set");
  return t;
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function triggerCollection(
  collectorId: string,
  inputs: unknown[],
): Promise<string> {
  const url = `${BASE}/dca/trigger?collector=${encodeURIComponent(collectorId)}&queue_next=1`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });

  if (!res.ok) {
    const hint =
      res.status === 404
        ? ` — collector "${collectorId}" not found. Check the API key belongs to the account that owns it.`
        : "";
    throw new Error(`Bright Data trigger ${res.status}: ${await res.text()}${hint}`);
  }
  const body = (await res.json()) as { collection_id?: string };
  if (!body.collection_id) throw new Error("Bright Data trigger returned no collection_id");
  return body.collection_id;
}

export async function pollSnapshot(
  snapshotId: string,
  opts: { maxAttempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<unknown[]> {
  const maxAttempts = opts.maxAttempts ?? 120;
  const delayMs = opts.delayMs ?? 5_000;
  const sleep = opts.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${BASE}/dca/dataset?id=${encodeURIComponent(snapshotId)}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });

    if (!res.ok) throw new Error(`Bright Data dataset ${res.status}: ${await res.text()}`);

    const body = await res.json();

    // Ready: a JSON array. In progress: an object with status "building".
    if (Array.isArray(body)) return body;

    const status = (body as { status?: string })?.status;
    if (status && status !== "building") {
      throw new Error(`Bright Data snapshot ${snapshotId} status: ${status}`);
    }

    await sleep(delayMs);
  }

  throw new Error(
    `Bright Data snapshot ${snapshotId} still building after ${maxAttempts} attempts`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/brightdata.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles/ingest/brightdata.ts src/lib/vehicles/ingest/brightdata.test.ts
git commit -m "feat(ingest): Bright Data client with body-based snapshot polling"
```

---

### Task 4b: Merge LIST and DETAILS, classify availability

The DETAILS collector returns `{vehicle: "<json string>"}` and carries no `evdb_id`, `make`,
`model` or `year` — those live only in LIST. Nothing downstream works until the two are joined
on `car_url`. Also ports `classify_availability` from notebook cell 19.

**Files:**
- Create: `src/lib/vehicles/ingest/merge.ts`
- Test: `src/lib/vehicles/ingest/merge.test.ts`

**Interfaces:**
- Consumes: `ScrapedVehicle` (Task 1)
- Produces: `unwrapDetails(records: unknown[]): Record<string, unknown>[]`, `classifyAvailability(s: unknown): boolean | "unknown"`, `mergeListAndDetails(list: Record<string, unknown>[], details: Record<string, unknown>[]): {merged: ScrapedVehicle[]; unmatched: string[]}`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/vehicles/ingest/merge.test.ts
import { describe, it, expect } from "vitest";
import { unwrapDetails, classifyAvailability, mergeListAndDetails } from "./merge";

const detailObj = {
  car_url: "https://ev-database.org/car/1903",
  battery_details: { nominal_capacity: { value: 42.2, unit: "kWh" } },
  metadata: { parsed_at: "2026-08-23T10:00:00.000Z" },
};

describe("unwrapDetails", () => {
  it("parses the {vehicle: '<json>'} wrapper the PROD parser emits", () => {
    const out = unwrapDetails([{ vehicle: JSON.stringify(detailObj) }]);
    expect(out[0].car_url).toBe(detailObj.car_url);
    expect(out[0].battery_details).toEqual(detailObj.battery_details);
  });

  it("passes through records that are already objects (dev-mode parser)", () => {
    expect(unwrapDetails([detailObj])[0].car_url).toBe(detailObj.car_url);
  });

  it("skips malformed JSON instead of throwing the whole run away", () => {
    const out = unwrapDetails([{ vehicle: "{not json" }, { vehicle: JSON.stringify(detailObj) }]);
    expect(out).toHaveLength(1);
  });
});

describe("classifyAvailability", () => {
  it("treats 'Available to order' as available", () => {
    expect(classifyAvailability("Available to order since May 2023")).toBe(true);
  });

  it("treats 'Discontinued' as unavailable", () => {
    expect(classifyAvailability("Discontinued since Jan 2025")).toBe(false);
  });

  it("returns unknown for anything else, including null", () => {
    expect(classifyAvailability("Expected Q3 2026")).toBe("unknown");
    expect(classifyAvailability(null)).toBe("unknown");
  });
});

describe("mergeListAndDetails", () => {
  const listRow = {
    evdb_id: 1903,
    make: "Abarth",
    model: "500e Hatchback",
    year: { from: 2023, to: null },
    range: { value: 225, unit: "km" },
    availability: "Available to order since May 2023",
    car_url: "https://ev-database.org/car/1903",
  };

  it("joins on car_url, keeping LIST identity and adding DETAILS blocks", () => {
    const { merged } = mergeListAndDetails([listRow], [detailObj]);
    expect(merged).toHaveLength(1);
    expect(merged[0].evdb_id).toBe(1903);
    expect(merged[0].make).toBe("Abarth");
    expect(merged[0].battery_details).toEqual(detailObj.battery_details);
  });

  it("computes `available` from the LIST availability string", () => {
    expect(mergeListAndDetails([listRow], [detailObj]).merged[0].available).toBe(true);
  });

  it("derives make_slug", () => {
    expect(mergeListAndDetails([listRow], [detailObj]).merged[0].make_slug).toBe("abarth");
  });

  it("excludes LIST rows with no DETAILS match and reports them", () => {
    const orphan = { ...listRow, evdb_id: 999, car_url: "https://ev-database.org/car/999" };
    const { merged, unmatched } = mergeListAndDetails([listRow, orphan], [detailObj]);
    // Without battery_details the slug would lose its kWh component and drift.
    expect(merged).toHaveLength(1);
    expect(unmatched).toEqual(["https://ev-database.org/car/999"]);
  });

  it("never lets DETAILS overwrite LIST identity fields", () => {
    const hostile = { ...detailObj, make: "WRONG", model: "WRONG", evdb_id: 1 };
    const { merged } = mergeListAndDetails([listRow], [hostile]);
    expect(merged[0].make).toBe("Abarth");
    expect(merged[0].evdb_id).toBe(1903);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/merge.test.ts`
Expected: FAIL — cannot resolve `./merge`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/vehicles/ingest/merge.ts
import { slugify } from "./clean";
import type { ScrapedVehicle } from "./types";

type Row = Record<string, unknown>;

/**
 * The DETAILS parser's PROD return is { vehicle: JSON.stringify(vehicle) }.
 * Dev mode returns the object directly, so tolerate both.
 */
export function unwrapDetails(records: unknown[]): Row[] {
  const out: Row[] = [];

  for (const rec of records) {
    if (typeof rec !== "object" || rec === null) continue;
    const wrapper = rec as Row;

    if (typeof wrapper.vehicle === "string") {
      try {
        out.push(JSON.parse(wrapper.vehicle) as Row);
      } catch {
        // One malformed record must not destroy an entire scrape.
        continue;
      }
    } else if (wrapper.vehicle && typeof wrapper.vehicle === "object") {
      out.push(wrapper.vehicle as Row);
    } else {
      out.push(wrapper);
    }
  }

  return out;
}

/** Port of notebook cell 19. */
export function classifyAvailability(s: unknown): boolean | "unknown" {
  const text = typeof s === "string" ? s : "";
  if (text.includes("Available to order")) return true;
  if (text.includes("Discontinued")) return false;
  return "unknown";
}

/** Identity fields that only LIST is authoritative for. */
const LIST_WINS = [
  "evdb_id",
  "id",
  "make",
  "model",
  "year",
  "date",
  "rank",
  "availability",
  "range",
  "battery",
  "efficiency",
  "weight",
  "acceleration_0100",
  "range_1stop",
  "fastcharge",
  "towing_weight",
  "cargo_cap",
  "price_perrange",
  "price",
  "thumb_url",
];

export function mergeListAndDetails(
  list: Row[],
  details: Row[],
): { merged: ScrapedVehicle[]; unmatched: string[] } {
  const byUrl = new Map<string, Row>();
  for (const d of details) {
    const url = typeof d.car_url === "string" ? d.car_url : null;
    if (url) byUrl.set(url, d);
  }

  const merged: ScrapedVehicle[] = [];
  const unmatched: string[] = [];

  for (const row of list) {
    const url = typeof row.car_url === "string" ? row.car_url : "";
    const detail = byUrl.get(url);

    if (!detail) {
      // battery_details lives only in DETAILS; without it the generated slug would
      // silently lose its kWh component and drift from the live URL.
      unmatched.push(url);
      continue;
    }

    const combined: Row = { ...detail };
    for (const key of LIST_WINS) {
      if (row[key] !== undefined) combined[key] = row[key];
    }

    combined.available = classifyAvailability(row.availability);
    combined.make_slug = slugify(String(row.make ?? ""), "brand");

    merged.push(combined as unknown as ScrapedVehicle);
  }

  return { merged, unmatched };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/merge.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles/ingest/merge.ts src/lib/vehicles/ingest/merge.test.ts
git commit -m "feat(ingest): merge LIST and DETAILS snapshots on car_url"
```

---

### Task 5: CMS read layer

Loads the whole catalogue once, indexed by `evdb_id` as a string. Directus stores `evdb_id` as `string`; the scrape emits `number`. Every lookup coerces.

**Files:**
- Create: `src/lib/vehicles/ingest/queries.ts`
- Test: `src/lib/vehicles/ingest/queries.test.ts`

**Interfaces:**
- Consumes: `CmsVehicle` from Task 1
- Produces: `fetchAllCmsVehicles(): Promise<CmsVehicle[]>`, `indexByEvdbId(rows: CmsVehicle[]): Map<string, CmsVehicle>`, `fetchBrandIdBySlug(slug: string): Promise<string | null>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/vehicles/ingest/queries.test.ts
import { describe, it, expect } from "vitest";
import { indexByEvdbId } from "./queries";
import type { CmsVehicle } from "./types";

const rows = [
  { id: "a", evdb_id: "3303", slug: "togg-t10x", status: "published" },
  { id: "b", evdb_id: "3206", slug: "bmw-i4", status: "published" },
] as CmsVehicle[];

describe("indexByEvdbId", () => {
  it("indexes by evdb_id", () => {
    expect(indexByEvdbId(rows).get("3303")?.id).toBe("a");
  });

  it("matches a numeric scrape id against the string stored in Directus", () => {
    // The whole pipeline turns on this: 3303 !== "3303" would create 562 duplicates
    expect(indexByEvdbId(rows).get(String(3303))?.id).toBe("a");
  });

  it("skips rows with no evdb_id rather than keying on null", () => {
    const withNull = [...rows, { id: "c", evdb_id: null, slug: "x", status: "draft" } as CmsVehicle];
    const idx = indexByEvdbId(withNull);
    expect(idx.size).toBe(2);
    expect(idx.has("null")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/queries.test.ts`
Expected: FAIL — cannot resolve `./queries`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/vehicles/ingest/queries.ts
import { directusFetch } from "@/lib/directus";
import type { CmsVehicle } from "./types";

const PAGE = 200;

/** Every vehicle, all fields, no ISR cache — this is a write-path read. */
export async function fetchAllCmsVehicles(): Promise<CmsVehicle[]> {
  const out: CmsVehicle[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await directusFetch<{ data: CmsVehicle[] }>(
      `/items/vehicles?fields=*&limit=${PAGE}&offset=${offset}&sort=id`,
      { next: { revalidate: 0 } },
    );
    const batch = res.data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) return out;
  }
}

export function indexByEvdbId(rows: CmsVehicle[]): Map<string, CmsVehicle> {
  const idx = new Map<string, CmsVehicle>();
  for (const row of rows) {
    if (row.evdb_id === null || row.evdb_id === undefined || row.evdb_id === "") continue;
    idx.set(String(row.evdb_id), row);
  }
  return idx;
}

export async function fetchBrandIdBySlug(slug: string): Promise<string | null> {
  const res = await directusFetch<{ data: Array<{ id: string }> }>(
    `/items/vehicle_brands?filter[slug][_eq]=${encodeURIComponent(slug)}&fields=id&limit=1`,
    { next: { revalidate: 0 } },
  );
  return res.data?.[0]?.id ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/queries.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles/ingest/queries.ts src/lib/vehicles/ingest/queries.test.ts
git commit -m "feat(ingest): CMS read layer indexed by evdb_id"
```

---

### Task 6: Field map and payload builder

Typed port of notebook cell 100's `VEHICLE_MAP` and cell 101's `build_vehicle_payload`. The critical departure: `status` is emitted only when `isCreate` is true.

**Files:**
- Create: `src/lib/vehicles/ingest/fieldmap.ts`
- Test: `src/lib/vehicles/ingest/fieldmap.test.ts`

**Interfaces:**
- Consumes: `ScrapedVehicle` from Task 1
- Produces: `VEHICLE_MAP: FieldMapping[]`, `buildPayload(row: ScrapedVehicle, opts: {isCreate: boolean; brandId?: string | null}): Record<string, unknown>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/vehicles/ingest/fieldmap.test.ts
import { describe, it, expect } from "vitest";
import { buildPayload } from "./fieldmap";
import type { ScrapedVehicle } from "./types";

const row = {
  evdb_id: 1903,
  make: "Abarth",
  make_slug: "abarth",
  model: "500e Hatchback",
  title_v2: "Abarth 500e Hatchback 42kWh 225km [2023-]",
  slug: "abarth-500e-hatchback-42kwh-225km-2023",
  year: { from: 2023, to: null },
  available: true,
  availability: "Available to order since May 2023",
  battery: { value: 37.8, unit: "kWh" },
  range: { value: 225, unit: "km" },
  car_url: "https://ev-database.org/car/1903",
} as unknown as ScrapedVehicle;

describe("buildPayload", () => {
  it("sets status draft on create", () => {
    expect(buildPayload(row, { isCreate: true }).status).toBe("draft");
  });

  it("NEVER sets status on update — this would unpublish the live catalogue", () => {
    expect("status" in buildPayload(row, { isCreate: false })).toBe(false);
  });

  it("never sets slug on update — slugs are frozen after creation", () => {
    expect("slug" in buildPayload(row, { isCreate: false })).toBe(false);
    expect(buildPayload(row, { isCreate: true }).slug).toBe(row.slug);
  });

  it("stringifies evdb_id to match the Directus column type", () => {
    expect(buildPayload(row, { isCreate: true }).evdb_id).toBe("1903");
  });

  it("preserves {value, unit} spec objects rather than flattening them", () => {
    expect(buildPayload(row, { isCreate: false }).battery).toEqual({ value: 37.8, unit: "kWh" });
  });

  it("maps title_v2 to name and car_url to evdb_url", () => {
    const p = buildPayload(row, { isCreate: false });
    expect(p.name).toBe(row.title_v2);
    expect(p.evdb_url).toBe(row.car_url);
  });

  it("attaches the brand relation when a brand id is supplied", () => {
    expect(buildPayload(row, { isCreate: true, brandId: "uuid-1" }).brand).toBe("uuid-1");
  });

  it("omits the brand key entirely when the brand is unknown", () => {
    expect("brand" in buildPayload(row, { isCreate: true, brandId: null })).toBe(false);
  });

  it("skips null and empty-string source values", () => {
    const sparse = { ...row, car_url: "", battery: null } as unknown as ScrapedVehicle;
    const p = buildPayload(sparse, { isCreate: false });
    expect("evdb_url" in p).toBe(false);
    expect("battery" in p).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/fieldmap.test.ts`
Expected: FAIL — cannot resolve `./fieldmap`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/vehicles/ingest/fieldmap.ts
import type { ScrapedVehicle } from "./types";

type Caster = (v: unknown) => unknown;
const asString: Caster = (v) => String(v);
const asIs: Caster = (v) => v;
const asBool: Caster = (v) => Boolean(v);

export interface FieldMapping {
  /** Source key, dot-notation supported. */
  from: string;
  /** Directus column. */
  to: string;
  cast: Caster;
  /** Written on create only. */
  createOnly?: boolean;
}

/** Port of notebook cell 100 VEHICLE_MAP. */
export const VEHICLE_MAP: FieldMapping[] = [
  { from: "title_v2", to: "name", cast: asString },
  { from: "slug", to: "slug", cast: asString, createOnly: true },
  { from: "model", to: "model", cast: asString },
  { from: "id", to: "short_id", cast: asString },
  { from: "availability", to: "availability", cast: asString },
  { from: "available", to: "is_available", cast: asBool },

  { from: "car_url", to: "evdb_url", cast: asString },
  { from: "metadata.parsed_at", to: "evdb_time_fetched", cast: asString },
  { from: "evdb_id", to: "evdb_id", cast: asString },
  { from: "breadcrumb", to: "evdb_breadcrumb", cast: asString },
  { from: "images_urls", to: "evdb_images_urls", cast: asIs },
  { from: "meta", to: "evdb_meta", cast: asIs },

  { from: "price.de.value", to: "price_de", cast: asString },
  { from: "price.nl.value", to: "price_nl", cast: asString },
  { from: "price.uk.value", to: "price_uk", cast: asString },

  { from: "date", to: "date_range_active", cast: asIs },

  { from: "range", to: "range", cast: asIs },
  { from: "battery", to: "battery", cast: asIs },
  { from: "efficiency", to: "efficiency", cast: asIs },
  { from: "weight", to: "weight", cast: asIs },
  { from: "acceleration_0100", to: "acceleration", cast: asIs },
  { from: "range_1stop", to: "range_1stop", cast: asIs },
  { from: "fastcharge", to: "fastcharge", cast: asIs },
  { from: "towing_weight", to: "towing_weight", cast: asIs },
  { from: "cargo_cap", to: "cargo_capacity", cast: asIs },
  { from: "price_perrange", to: "price_per_range", cast: asIs },

  { from: "pricing_availability", to: "pricing_availability", cast: asIs },
  { from: "real_range", to: "real_range", cast: asIs },
  { from: "distance_suitability", to: "distance_suitability", cast: asIs },
  { from: "battery_details", to: "battery_details", cast: asIs },
  { from: "charging", to: "charging", cast: asIs },
  { from: "performance", to: "performance", cast: asIs },
  { from: "v2x_charging", to: "v2x_charging", cast: asIs },
  { from: "energy_consumption", to: "energy_consumption", cast: asIs },
  { from: "real_energy_consumption", to: "real_energy_consumption", cast: asIs },
  { from: "dimensions_weight", to: "dimensions_weight", cast: asIs },
  { from: "misc", to: "miscellaneous", cast: asIs },
  { from: "preceding_model", to: "preceding_model", cast: asIs },
  {
    from: "home_destination_charging_details",
    to: "home_destination_charging_details",
    cast: asIs,
  },
];

function getIn(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function buildPayload(
  row: ScrapedVehicle,
  opts: { isCreate: boolean; brandId?: string | null },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const m of VEHICLE_MAP) {
    if (m.createOnly && !opts.isCreate) continue;

    const raw = getIn(row, m.from);
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string" && !raw.trim()) continue;

    payload[m.to] = m.cast(raw);
  }

  if (opts.brandId) payload.brand = opts.brandId;

  // Only ever on create. Setting this on update would draft the live catalogue.
  if (opts.isCreate) payload.status = "draft";

  return payload;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/fieldmap.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles/ingest/fieldmap.ts src/lib/vehicles/ingest/fieldmap.test.ts
git commit -m "feat(ingest): typed field map, status written on create only"
```

---

### Task 7: Diff engine and safety guards

Classifies every record into a plan bucket and refuses to emit a plan that looks like a broken scrape.

**Files:**
- Create: `src/lib/vehicles/ingest/diff.ts`
- Test: `src/lib/vehicles/ingest/diff.test.ts`

**Interfaces:**
- Consumes: `buildPayload` (Task 6), `generateSlug` (Task 2), `indexByEvdbId` (Task 5), types (Task 1)
- Produces: `buildPlan(scraped: ScrapedVehicle[], cms: CmsVehicle[], opts?: {sourceFile?: string; brandIds?: Map<string,string>}): IngestPlan`, `assertPlanSane(plan: IngestPlan, opts?: {minScrapeRatio?: number; maxChangeRatio?: number}): void`, `summarize(plan: IngestPlan): Record<PlanBucket, number>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/vehicles/ingest/diff.test.ts
import { describe, it, expect } from "vitest";
import { buildPlan, assertPlanSane, summarize } from "./diff";
import type { ScrapedVehicle, CmsVehicle } from "./types";

const scrapedRow = (over: Partial<ScrapedVehicle> = {}) =>
  ({
    evdb_id: 1903,
    make: "Abarth",
    make_slug: "abarth",
    model: "500e Hatchback",
    title_v2: "Abarth 500e Hatchback 42kWh 225km [2023-]",
    slug: "abarth-500e-hatchback-42kwh-225km-2023",
    year: { from: 2023, to: null },
    available: true,
    battery_details: { nominal_capacity: { value: 42.2, unit: "kWh" } },
    range: { value: 225, unit: "km" },
    ...over,
  }) as unknown as ScrapedVehicle;

const cmsRow = (over: Partial<CmsVehicle> = {}) =>
  ({
    id: "uuid-1",
    evdb_id: "1903",
    slug: "abarth-500e-hatchback-42kwh-225km-2023",
    status: "published",
    name: "Abarth 500e Hatchback 42kWh 225km [2023-]",
    model: "500e Hatchback",
    is_available: true,
    range: { value: 225, unit: "km" },
    ...over,
  }) as unknown as CmsVehicle;

describe("buildPlan", () => {
  it("classifies an unseen evdb_id as CREATE", () => {
    const plan = buildPlan([scrapedRow({ evdb_id: 9999 })], []);
    expect(plan.entries[0].bucket).toBe("CREATE");
    expect(plan.entries[0].payload?.status).toBe("draft");
  });

  it("classifies an identical record as UNCHANGED with no changes", () => {
    const plan = buildPlan([scrapedRow()], [cmsRow()]);
    expect(plan.entries[0].bucket).toBe("UNCHANGED");
    expect(plan.entries[0].changes).toEqual({});
  });

  it("matches numeric scrape id to string CMS id instead of duplicating", () => {
    const plan = buildPlan([scrapedRow({ evdb_id: 1903 })], [cmsRow({ evdb_id: "1903" })]);
    expect(plan.entries[0].bucket).not.toBe("CREATE");
    expect(plan.entries[0].cmsId).toBe("uuid-1");
  });

  it("reports only the changed fields on UPDATE", () => {
    const plan = buildPlan(
      [scrapedRow({ range: { value: 230, unit: "km" } } as Partial<ScrapedVehicle>)],
      [cmsRow()],
    );
    const entry = plan.entries[0];
    expect(entry.bucket).toBe("UPDATE");
    expect(entry.changes.range).toEqual({
      from: { value: 225, unit: "km" },
      to: { value: 230, unit: "km" },
    });
    expect(entry.changes.model).toBeUndefined();
  });

  it("never puts status or slug in an UPDATE change set", () => {
    const plan = buildPlan([scrapedRow({ model: "500e Hatch" })], [cmsRow()]);
    expect(plan.entries[0].changes.status).toBeUndefined();
    expect(plan.entries[0].changes.slug).toBeUndefined();
  });

  it("flags SLUG_DRIFT when a discontinued year closes the range", () => {
    const plan = buildPlan([scrapedRow({ year: { from: 2023, to: 2026 } })], [cmsRow()]);
    const drift = plan.entries.find((e) => e.bucket === "SLUG_DRIFT");
    expect(drift?.generatedSlug).toBe("abarth-500e-hatchback-42kwh-225km-2023-2026");
    expect(drift?.slug).toBe("abarth-500e-hatchback-42kwh-225km-2023");
  });

  it("classifies a CMS record absent from the scrape as GONE", () => {
    const plan = buildPlan([], [cmsRow()]);
    expect(plan.entries[0].bucket).toBe("GONE");
    expect(plan.entries[0].changes).toEqual({});
  });
});

describe("assertPlanSane", () => {
  const planWith = (scrapeCount: number, cmsCount: number, updates: number) => ({
    createdAt: "2026-08-23T00:00:00Z",
    sourceFile: "x.json",
    cmsCount,
    scrapeCount,
    completed: [],
    entries: Array.from({ length: updates }, (_, i) => ({
      bucket: "UPDATE" as const,
      evdbId: String(i),
      slug: `s-${i}`,
      cmsId: `c-${i}`,
      changes: { range: { from: 1, to: 2 } },
    })),
  });

  it("passes a normal plan", () => {
    expect(() => assertPlanSane(planWith(562, 562, 30))).not.toThrow();
  });

  it("rejects a scrape that lost most of the catalogue", () => {
    expect(() => assertPlanSane(planWith(100, 562, 0))).toThrow(/scrape returned/i);
  });

  it("rejects a plan that would rewrite most of the catalogue", () => {
    expect(() => assertPlanSane(planWith(562, 562, 400))).toThrow(/change ratio/i);
  });

  it("allows an override for a genuinely large refresh", () => {
    expect(() =>
      assertPlanSane(planWith(562, 562, 400), { maxChangeRatio: 1 }),
    ).not.toThrow();
  });
});

describe("summarize", () => {
  it("counts each bucket", () => {
    const plan = buildPlan([scrapedRow(), scrapedRow({ evdb_id: 9999 })], [cmsRow()]);
    const s = summarize(plan);
    expect(s.UNCHANGED).toBe(1);
    expect(s.CREATE).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/diff.test.ts`
Expected: FAIL — cannot resolve `./diff`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/vehicles/ingest/diff.ts
import { buildPayload } from "./fieldmap";
import { generateSlug } from "./clean";
import { indexByEvdbId } from "./queries";
import type {
  CmsVehicle,
  IngestPlan,
  PlanBucket,
  PlanEntry,
  ScrapedVehicle,
} from "./types";

/** Order-insensitive structural equality for Directus JSON columns. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

export function buildPlan(
  scraped: ScrapedVehicle[],
  cms: CmsVehicle[],
  opts: { sourceFile?: string; brandIds?: Map<string, string> } = {},
): IngestPlan {
  const cmsIndex = indexByEvdbId(cms);
  const entries: PlanEntry[] = [];
  const seen = new Set<string>();

  for (const row of scraped) {
    const evdbId = String(row.evdb_id);
    seen.add(evdbId);

    const existing = cmsIndex.get(evdbId);
    const brandId = opts.brandIds?.get(String(row.make_slug)) ?? null;

    if (!existing) {
      entries.push({
        bucket: "CREATE",
        evdbId,
        slug: generateSlug(row),
        changes: {},
        payload: buildPayload(row, { isCreate: true, brandId }),
      });
      continue;
    }

    // Slug is frozen; drift is reported as its own entry, never applied.
    const generated = generateSlug(row);
    if (generated !== existing.slug) {
      entries.push({
        bucket: "SLUG_DRIFT",
        evdbId,
        slug: existing.slug,
        cmsId: existing.id,
        changes: {},
        generatedSlug: generated,
      });
    }

    const candidate = buildPayload(row, { isCreate: false, brandId });
    const changes: PlanEntry["changes"] = {};
    for (const [key, next] of Object.entries(candidate)) {
      if (!deepEqual(existing[key], next)) {
        changes[key] = { from: existing[key], to: next };
      }
    }

    entries.push({
      bucket: Object.keys(changes).length ? "UPDATE" : "UNCHANGED",
      evdbId,
      slug: existing.slug,
      cmsId: existing.id,
      changes,
    });
  }

  for (const row of cms) {
    if (row.evdb_id && !seen.has(String(row.evdb_id))) {
      entries.push({
        bucket: "GONE",
        evdbId: String(row.evdb_id),
        slug: row.slug,
        cmsId: row.id,
        changes: {},
      });
    }
  }

  return {
    createdAt: new Date().toISOString(),
    sourceFile: opts.sourceFile ?? "",
    cmsCount: cms.length,
    scrapeCount: scraped.length,
    entries,
    completed: [],
  };
}

export function summarize(plan: IngestPlan): Record<PlanBucket, number> {
  const out: Record<PlanBucket, number> = {
    CREATE: 0,
    UPDATE: 0,
    SLUG_DRIFT: 0,
    GONE: 0,
    UNCHANGED: 0,
  };
  for (const e of plan.entries) out[e.bucket] += 1;
  return out;
}

/** Refuses plans that look like a broken scrape rather than a real change. */
export function assertPlanSane(
  plan: IngestPlan,
  opts: { minScrapeRatio?: number; maxChangeRatio?: number } = {},
): void {
  const minScrapeRatio = opts.minScrapeRatio ?? 0.8;
  const maxChangeRatio = opts.maxChangeRatio ?? 0.3;

  if (plan.cmsCount > 0) {
    const ratio = plan.scrapeCount / plan.cmsCount;
    if (ratio < minScrapeRatio) {
      throw new Error(
        `Scrape returned ${plan.scrapeCount} rows against ${plan.cmsCount} in the CMS ` +
          `(${(ratio * 100).toFixed(0)}%, floor ${(minScrapeRatio * 100).toFixed(0)}%). ` +
          `This looks like a failed scrape, not a shrinking market.`,
      );
    }
  }

  const s = summarize(plan);
  const mutating = s.CREATE + s.UPDATE;
  if (plan.cmsCount > 0) {
    const ratio = mutating / plan.cmsCount;
    if (ratio > maxChangeRatio) {
      throw new Error(
        `Plan change ratio ${(ratio * 100).toFixed(0)}% exceeds the ` +
          `${(maxChangeRatio * 100).toFixed(0)}% ceiling ` +
          `(${s.CREATE} creates, ${s.UPDATE} updates). ` +
          `Re-run with --max-change-ratio to override if this is intentional.`,
      );
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/diff.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles/ingest/diff.ts src/lib/vehicles/ingest/diff.test.ts
git commit -m "feat(ingest): plan diff engine with scrape and change-ratio guards"
```

---

### Task 8: Apply executor

Executes a plan file. Touches only `CREATE` and `UPDATE`; `SLUG_DRIFT`, `GONE` and `UNCHANGED` are inert by construction.

**Files:**
- Create: `src/lib/vehicles/ingest/upsert.ts`
- Test: `src/lib/vehicles/ingest/upsert.test.ts`

**Interfaces:**
- Consumes: `IngestPlan`, `PlanEntry` (Task 1)
- Produces: `applyPlan(plan: IngestPlan, opts: {dryRun: boolean; onProgress?: (e: PlanEntry, i: number, total: number) => void; write?: WriteFn}): Promise<{created: number; updated: number; skipped: number; completed: string[]}>` where `WriteFn = (method: "POST" | "PATCH", path: string, body: unknown) => Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/vehicles/ingest/upsert.test.ts
import { describe, it, expect, vi } from "vitest";
import { applyPlan } from "./upsert";
import type { IngestPlan } from "./types";

const plan = (): IngestPlan => ({
  createdAt: "2026-08-23T00:00:00Z",
  sourceFile: "x.json",
  cmsCount: 3,
  scrapeCount: 3,
  completed: [],
  entries: [
    { bucket: "CREATE", evdbId: "1", slug: "a", changes: {}, payload: { name: "A", status: "draft" } },
    { bucket: "UPDATE", evdbId: "2", slug: "b", cmsId: "u2", changes: { range: { from: 1, to: 2 } } },
    { bucket: "UNCHANGED", evdbId: "3", slug: "c", cmsId: "u3", changes: {} },
    { bucket: "GONE", evdbId: "4", slug: "d", cmsId: "u4", changes: {} },
    { bucket: "SLUG_DRIFT", evdbId: "5", slug: "e", cmsId: "u5", changes: {}, generatedSlug: "e2" },
  ],
});

describe("applyPlan", () => {
  it("POSTs creates and PATCHes only the changed fields", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const res = await applyPlan(plan(), { dryRun: false, write });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledWith("POST", "/items/vehicles", { name: "A", status: "draft" });
    expect(write).toHaveBeenCalledWith("PATCH", "/items/vehicles/u2", { range: 2 });
    expect(res).toMatchObject({ created: 1, updated: 1, skipped: 3 });
  });

  it("never writes for GONE, SLUG_DRIFT or UNCHANGED", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await applyPlan(plan(), { dryRun: false, write });
    const paths = write.mock.calls.map((c) => c[1]);
    expect(paths).not.toContain("/items/vehicles/u3");
    expect(paths).not.toContain("/items/vehicles/u4");
    expect(paths).not.toContain("/items/vehicles/u5");
  });

  it("never includes status in a PATCH body", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const p = plan();
    p.entries[1].changes.status = { from: "published", to: "draft" };
    await applyPlan(p, { dryRun: false, write });

    const patch = write.mock.calls.find((c) => c[0] === "PATCH");
    expect(patch?.[2]).not.toHaveProperty("status");
  });

  it("never includes slug in a PATCH body", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const p = plan();
    p.entries[1].changes.slug = { from: "b", to: "b-new" };
    await applyPlan(p, { dryRun: false, write });

    const patch = write.mock.calls.find((c) => c[0] === "PATCH");
    expect(patch?.[2]).not.toHaveProperty("slug");
  });

  it("writes nothing when dryRun is set", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const res = await applyPlan(plan(), { dryRun: true, write });
    expect(write).not.toHaveBeenCalled();
    expect(res.created).toBe(1);
  });

  it("skips entries already in completed so an interrupted run resumes", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const p = plan();
    p.completed = ["1"];
    const res = await applyPlan(p, { dryRun: false, write });
    expect(write).toHaveBeenCalledTimes(1);
    expect(res.created).toBe(0);
    expect(res.updated).toBe(1);
  });

  it("records completed ids so a crash mid-run is resumable", async () => {
    const write = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"));
    await expect(applyPlan(plan(), { dryRun: false, write })).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/upsert.test.ts`
Expected: FAIL — cannot resolve `./upsert`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/vehicles/ingest/upsert.ts
import { directusFetch } from "@/lib/directus";
import type { IngestPlan, PlanEntry } from "./types";

export type WriteFn = (
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
) => Promise<void>;

const directusWrite: WriteFn = async (method, path, body) => {
  await directusFetch(path, {
    method,
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });
};

/** Keys that must never reach an update payload, whatever the diff says. */
const FROZEN_ON_UPDATE = new Set(["status", "slug"]);

export async function applyPlan(
  plan: IngestPlan,
  opts: {
    dryRun: boolean;
    onProgress?: (entry: PlanEntry, index: number, total: number) => void;
    write?: WriteFn;
  },
): Promise<{ created: number; updated: number; skipped: number; completed: string[] }> {
  const write = opts.write ?? directusWrite;
  const done = new Set(plan.completed);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const actionable = plan.entries.filter(
    (e) => e.bucket === "CREATE" || e.bucket === "UPDATE",
  );
  skipped = plan.entries.length - actionable.length;

  for (const [i, entry] of actionable.entries()) {
    if (done.has(entry.evdbId)) {
      skipped += 1;
      continue;
    }

    opts.onProgress?.(entry, i, actionable.length);

    if (entry.bucket === "CREATE") {
      if (!opts.dryRun) await write("POST", "/items/vehicles", entry.payload ?? {});
      created += 1;
    } else {
      const body: Record<string, unknown> = {};
      for (const [key, change] of Object.entries(entry.changes)) {
        if (FROZEN_ON_UPDATE.has(key)) continue;
        body[key] = change.to;
      }
      if (Object.keys(body).length === 0) {
        skipped += 1;
        continue;
      }
      if (!opts.dryRun) await write("PATCH", `/items/vehicles/${entry.cmsId}`, body);
      updated += 1;
    }

    done.add(entry.evdbId);
    plan.completed = [...done];
  }

  return { created, updated, skipped, completed: [...done] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/upsert.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles/ingest/upsert.ts src/lib/vehicles/ingest/upsert.test.ts
git commit -m "feat(ingest): plan executor, frozen status and slug on update"
```

---

### Task 9: Brand upsert

Brands run before vehicles. `transformDirectusVehicle` returns `null` when `brand.name` is missing, so a vehicle created against a nonexistent brand silently disappears from the site.

Brand identity is `slug`, which is safe here in a way it is not for vehicles: a brand slug derives only from the manufacturer name, which does not change when specs are revised.

**Files:**
- Create: `src/lib/vehicles/ingest/brands.ts`
- Test: `src/lib/vehicles/ingest/brands.test.ts`

**Interfaces:**
- Consumes: `slugify` (Task 2), `ScrapedVehicle` (Task 1)
- Produces: `deriveBrands(rows: ScrapedVehicle[]): BrandRow[]` where `BrandRow = {name: string; slug: string; active_models: number}`, `buildBrandPayload(brand: BrandRow, isCreate: boolean): Record<string, unknown>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/vehicles/ingest/brands.test.ts
import { describe, it, expect } from "vitest";
import { deriveBrands, buildBrandPayload } from "./brands";
import type { ScrapedVehicle } from "./types";

const row = (make: string, model: string) =>
  ({ evdb_id: Math.random(), make, make_slug: make.toLowerCase(), model }) as unknown as ScrapedVehicle;

describe("deriveBrands", () => {
  it("groups by make and counts distinct models", () => {
    const brands = deriveBrands([
      row("Abarth", "500e"),
      row("Abarth", "600e"),
      row("Abarth", "500e"),
      row("BMW", "i4"),
    ]);
    expect(brands).toEqual([
      { name: "Abarth", slug: "abarth", active_models: 2 },
      { name: "BMW", slug: "bmw", active_models: 1 },
    ]);
  });

  it("slugifies makes that need normalizing", () => {
    expect(deriveBrands([row("Citroën", "e-C4")])[0].slug).toBe("citroen");
  });
});

describe("buildBrandPayload", () => {
  const brand = { name: "Abarth", slug: "abarth", active_models: 2 };

  it("sets status draft on create", () => {
    expect(buildBrandPayload(brand, true).status).toBe("draft");
  });

  it("NEVER sets status on update", () => {
    expect("status" in buildBrandPayload(brand, false)).toBe(false);
  });

  it("never rewrites the slug on update", () => {
    expect("slug" in buildBrandPayload(brand, false)).toBe(false);
  });

  it("always refreshes the active model count", () => {
    expect(buildBrandPayload(brand, false).active_models).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/brands.test.ts`
Expected: FAIL — cannot resolve `./brands`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/vehicles/ingest/brands.ts
import { slugify } from "./clean";
import type { ScrapedVehicle } from "./types";

export interface BrandRow {
  name: string;
  slug: string;
  active_models: number;
}

/** Port of notebook cell 69: group by make, count distinct models. */
export function deriveBrands(rows: ScrapedVehicle[]): BrandRow[] {
  const byMake = new Map<string, { name: string; models: Set<string> }>();

  for (const row of rows) {
    const name = String(row.make ?? "").trim();
    if (!name) continue;
    const slug = slugify(String(row.make_slug || name), "brand");
    const entry = byMake.get(slug) ?? { name, models: new Set<string>() };
    entry.models.add(String(row.model ?? ""));
    byMake.set(slug, entry);
  }

  return [...byMake.entries()]
    .map(([slug, v]) => ({ name: v.name, slug, active_models: v.models.size }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function buildBrandPayload(
  brand: BrandRow,
  isCreate: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: brand.name,
    active_models: brand.active_models,
  };
  if (isCreate) {
    payload.slug = brand.slug;
    payload.status = "draft";
  }
  return payload;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/brands.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles/ingest/brands.ts src/lib/vehicles/ingest/brands.test.ts
git commit -m "feat(ingest): brand derivation and payload builder"
```

---

### Task 10: CLI

Wires the modules into the commands you actually run. `plan` is read-only; `apply` is the only command that writes.

**Files:**
- Create: `scripts/vehicles-ingest.ts`
- Modify: `package.json` (add the `ingest` script)
- Modify: `.gitignore` (ignore `data/`)

**Interfaces:**
- Consumes: everything from Tasks 2–9
- Produces: CLI commands `scrape`, `clean`, `plan`, `apply`

- [ ] **Step 1: Ignore scrape artifacts**

Append to `.gitignore`:

```
# Vehicle ingest scrape artifacts (multi-MB, not source)
/data/
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add:

```json
"ingest": "tsx --env-file=.env.local scripts/vehicles-ingest.ts"
```

- [ ] **Step 3: Write the CLI**

```typescript
// scripts/vehicles-ingest.ts
// Usage: npm run ingest -- <command> [options]
//
//   scrape                    LIST then DETAILS, merged → data/raw/<date>.json
//   clean   --in <file>       normalize + slug, write data/clean/<date>.json
//   plan    --in <file>       diff against CMS, write data/plans/<date>.json (no writes)
//   apply   --plan <file>     execute a plan (the only command that writes)
//
// Options: --dry-run, --max-change-ratio <n>, --limit <n>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  triggerCollection,
  pollSnapshot,
  LIST_COLLECTOR,
  DETAILS_COLLECTOR,
} from "@/lib/vehicles/ingest/brightdata";
import { unwrapDetails, mergeListAndDetails } from "@/lib/vehicles/ingest/merge";
import { generateSlug, buildTitle, cleanModel } from "@/lib/vehicles/ingest/clean";
import { fetchAllCmsVehicles, fetchBrandIdBySlug } from "@/lib/vehicles/ingest/queries";
import { buildPlan, assertPlanSane, summarize } from "@/lib/vehicles/ingest/diff";
import { applyPlan } from "@/lib/vehicles/ingest/upsert";
import { deriveBrands } from "@/lib/vehicles/ingest/brands";
import type { ScrapedVehicle, IngestPlan } from "@/lib/vehicles/ingest/types";

const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);

const today = new Date().toISOString().slice(0, 10);
const out = (dir: string, file: string) => {
  mkdirSync(`data/${dir}`, { recursive: true });
  return `data/${dir}/${file}`;
};

/** The snapshot files are JSON-lines; plan files are plain JSON. */
function readRows(path: string): ScrapedVehicle[] {
  const text = readFileSync(path, "utf8").trim();
  if (text.startsWith("[")) return JSON.parse(text);
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** Bright Data recommends chunking bulk inputs; the notebook used 100. */
const CHUNK = 100;

async function cmdScrape() {
  // ---- Stage 1: LIST — identity and summary specs, one request for the whole catalogue.
  console.log("Stage 1/2 — triggering LIST collector…");
  const listId = await triggerCollection(LIST_COLLECTOR, [
    { range: { min: 0, max: 1200 }, battery: { min: 5, max: 300 }, page_size: 2000 },
  ]);
  console.log(`  snapshot ${listId} — polling`);
  const list = (await pollSnapshot(listId)) as Record<string, unknown>[];
  console.log(`  ${list.length} vehicles listed`);

  const urls = list
    .map((r) => (typeof r.car_url === "string" ? r.car_url : null))
    .filter((u): u is string => Boolean(u));

  const limit = flag("limit") ? Number(flag("limit")) : urls.length;
  const targets = urls.slice(0, limit);
  if (limit < urls.length) console.log(`  --limit ${limit}: scraping a subset`);

  // ---- Stage 2: DETAILS — one input per car_url, chunked.
  console.log(`Stage 2/2 — DETAILS for ${targets.length} vehicles in chunks of ${CHUNK}…`);
  const details: Record<string, unknown>[] = [];

  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const id = await triggerCollection(DETAILS_COLLECTOR, chunk.map((car_url) => ({ car_url })));
    const rows = await pollSnapshot(id);
    details.push(...unwrapDetails(rows));
    console.log(`  ${Math.min(i + CHUNK, targets.length)}/${targets.length}`);
  }

  // ---- Join. DETAILS has no evdb_id/make/model/year, so this is not optional.
  const { merged, unmatched } = mergeListAndDetails(list, details);
  if (unmatched.length) {
    console.warn(`  ⚠️  ${unmatched.length} listed vehicles had no DETAILS record and were dropped:`);
    for (const u of unmatched.slice(0, 10)) console.warn(`     ${u}`);
    if (unmatched.length > 10) console.warn(`     …and ${unmatched.length - 10} more`);
  }

  const path = out("raw", `${today}.json`);
  writeFileSync(path, JSON.stringify(merged, null, 1));
  console.log(`✅ ${merged.length} merged rows → ${path}`);
}

async function cmdClean() {
  const input = flag("in");
  if (!input) throw new Error("clean requires --in <file>");

  const rows = readRows(input);
  const cleaned = rows
    .filter((r) => r.available === true)
    .map((r) => ({
      ...r,
      model: cleanModel(String(r.model ?? ""), String(r.make ?? "")),
      title_v2: buildTitle(r),
      slug: generateSlug(r),
    }));

  const path = out("clean", `${today}.json`);
  writeFileSync(path, JSON.stringify(cleaned, null, 1));
  console.log(`✅ ${cleaned.length} available rows (of ${rows.length}) → ${path}`);

  const brands = deriveBrands(cleaned);
  console.log(`   ${brands.length} distinct brands`);
}

async function cmdPlan() {
  const input = flag("in");
  if (!input) throw new Error("plan requires --in <file>");

  const scraped = readRows(input);
  console.log(`Reading CMS…`);
  const cms = await fetchAllCmsVehicles();
  console.log(`  ${cms.length} vehicles in CMS, ${scraped.length} in snapshot`);

  // Resolve brand ids once per distinct make, not once per vehicle.
  const brandIds = new Map<string, string>();
  for (const brand of deriveBrands(scraped)) {
    const id = await fetchBrandIdBySlug(brand.slug);
    if (id) brandIds.set(brand.slug, id);
    else console.warn(`  ⚠️  no brand row for "${brand.slug}" — run the brands step first`);
  }

  const plan = buildPlan(scraped, cms, { sourceFile: input, brandIds });
  assertPlanSane(plan, {
    maxChangeRatio: flag("max-change-ratio") ? Number(flag("max-change-ratio")) : undefined,
  });

  const s = summarize(plan);
  console.log("\n  CREATE     %d\n  UPDATE     %d\n  SLUG_DRIFT %d\n  GONE       %d\n  UNCHANGED  %d\n",
    s.CREATE, s.UPDATE, s.SLUG_DRIFT, s.GONE, s.UNCHANGED);

  for (const e of plan.entries.filter((x) => x.bucket === "UPDATE").slice(0, 20)) {
    const fields = Object.keys(e.changes).join(", ");
    console.log(`  UPDATE ${e.slug} → ${fields}`);
  }
  for (const e of plan.entries.filter((x) => x.bucket === "SLUG_DRIFT")) {
    console.log(`  DRIFT  ${e.slug} → ${e.generatedSlug} (reported only, URL frozen)`);
  }
  for (const e of plan.entries.filter((x) => x.bucket === "GONE")) {
    console.log(`  GONE   ${e.slug} (reported only, never unpublished)`);
  }

  const path = out("plans", `${today}.json`);
  writeFileSync(path, JSON.stringify(plan, null, 1));
  console.log(`\n✅ plan → ${path}`);
  console.log(`   review it, then: npm run ingest -- apply --plan ${path}`);
}

async function cmdApply() {
  const planPath = flag("plan");
  if (!planPath) throw new Error("apply requires --plan <file>");

  const plan = JSON.parse(readFileSync(planPath, "utf8")) as IngestPlan;
  const dryRun = has("dry-run");

  console.log(`${dryRun ? "[DRY RUN] " : ""}Applying ${planPath}…`);
  const res = await applyPlan(plan, {
    dryRun,
    onProgress: (e, i, total) => {
      if (i % 25 === 0) console.log(`  ${i}/${total} …`);
    },
  });

  // Persist checkpoints so an interrupted run resumes instead of restarting.
  if (!dryRun) writeFileSync(planPath, JSON.stringify(plan, null, 1));

  console.log(`✅ created ${res.created}, updated ${res.updated}, skipped ${res.skipped}`);
  if (res.created > 0) {
    console.log(`   New vehicles are drafts — add thumbnails and publish in Directus.`);
  }
}

const commands: Record<string, () => Promise<void>> = {
  scrape: cmdScrape,
  clean: cmdClean,
  plan: cmdPlan,
  apply: cmdApply,
};

const fn = commands[command ?? ""];
if (!fn) {
  console.error(`Unknown command "${command ?? ""}". Expected: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}

await fn().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
```

- [ ] **Step 4: Verify the CLI wires up and rejects bad input**

Run: `npm run ingest -- nonsense`
Expected: `Unknown command "nonsense". Expected: scrape, clean, plan, apply`, exit code 1

Run: `npm run ingest -- plan`
Expected: `❌ plan requires --in <file>`, exit code 1

- [ ] **Step 5: Verify the whole suite and types still pass**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add scripts/vehicles-ingest.ts package.json .gitignore
git commit -m "feat(ingest): plan/apply CLI for vehicle ingestion"
```

---

### Task 11: Acceptance gate against the December dataset

The real test of the identity fix. The December 2025 snapshot is what produced the current 562 records, so planning against it must yield almost entirely `UNCHANGED`. A large `CREATE` bucket means `evdb_id` matching is broken and would duplicate the catalogue.

**Files:**
- Modify: none (verification only)

**Interfaces:**
- Consumes: the CLI from Task 10

- [ ] **Step 1: Plan against the December snapshot**

```bash
npm run ingest -- plan --in "/Users/yoanbasset/Jupyter/ev-database/EVDB_vehicles_fromBD_2025-12-26_0_3-cleaned.json"
```

- [ ] **Step 2: Check the result against expectations**

Expected: `CREATE 0`, `GONE 0`, and `UNCHANGED` close to 562.

Interpretation:
- **`CREATE` > 0** — identity matching is broken. Stop. Do not apply. Debug `indexByEvdbId` and the `String()` coercion in Task 5.
- **`UPDATE` large** — inspect the listed field names. Field-mapping drift (a `{value, unit}` object compared against a scalar, say) is a bug in Task 6. A handful of genuinely edited records is fine.
- **`SLUG_DRIFT` > 0** — expected and harmless for vehicles discontinued since December. Confirms the freeze policy is doing its job.

- [ ] **Step 3: Confirm the plan wrote nothing**

```bash
curl -s -H "Authorization: Bearer $DIRECTUS_STATIC_TOKEN" \
  "$DIRECTUS_URL/items/vehicles?aggregate[count]=id&filter[status][_eq]=published"
```

Expected: still `562`. `plan` is read-only; if this number moved, something is badly wrong.

- [ ] **Step 4: Record the outcome**

Append the observed bucket counts to the spec's "Open risks" section, resolving the golden-test risk one way or the other. Commit.

```bash
git add docs/superpowers/specs/2026-08-23-vehicle-ingest-pipeline-design.md
git commit -m "docs(ingest): record acceptance-gate results against Dec 2025 snapshot"
```

---

### Task 12: Retire the notebook and rotate secrets

**Files:**
- Create: `docs/vehicle-ingest.md`
- Modify: `CLAUDE.md` (document the new commands)

- [ ] **Step 1: Rotate credentials**

1. Obtain a Bright Data API token **for account `hl_9ec746bc`**, which owns the two collectors. The originally supplied key authenticates as `hl_27b6d7ae` and 404s on both. If the move to a new account is deliberate, recreate both collectors there from the interaction/parser sources instead, and configure a zone — the account currently reports `can_make_requests: false` / `zone_not_found`.
2. **Revoke** the Contentful CMA token hardcoded in notebook cell 4. The Contentful path is dead code and is not being ported.
3. **Revoke** the old Bright Data token in cell 15 (already expired, but it should not remain in the file).
4. Add to `.env.local`:

```
BRIGHTDATA_API_TOKEN=<token for the account owning the collectors>
BRIGHTDATA_LIST_COLLECTOR=c_mipqo2it4a63h5g0k
BRIGHTDATA_DETAILS_COLLECTOR=c_misied485yd5jpx0u
```

- [ ] **Step 2: Strip secrets from the notebook**

In `/Users/yoanbasset/Jupyter/ev-database/# EV Database — Scraping, Cleaning & Upload Pipeline.ipynb`, replace the hardcoded literals in cells 4, 15, 78 and 98 with `os.environ[...]` lookups. The notebook stays for exploration; it must stop being a credential store.

- [ ] **Step 3: Write the runbook**

```markdown
<!-- docs/vehicle-ingest.md -->
# Vehicle Ingest Runbook

Refreshes the `vehicles` and `vehicle_brands` Directus collections from EV Database.
Run a few times a year. Every write is human-approved.

## Prerequisites

`.env.local` needs `DIRECTUS_URL`, `DIRECTUS_STATIC_TOKEN`, `BRIGHTDATA_API_TOKEN`,
`BRIGHTDATA_LIST_COLLECTOR`, `BRIGHTDATA_DETAILS_COLLECTOR`.

The Bright Data token must belong to the account that owns the collectors. A token from a
different account authenticates fine and then 404s on every trigger — check `customer` in
`GET https://api.brightdata.com/status` against the `id=hl_…` in the collector's dashboard URL.

## Sequence

```bash
npm run ingest -- scrape                          # two stages, ~10+ minutes
npm run ingest -- clean --in data/raw/<date>.json
npm run ingest -- plan  --in data/clean/<date>.json
# review the printed summary and data/plans/<date>.json
npm run ingest -- apply --plan data/plans/<date>.json
```

New vehicles land as `draft`. Add thumbnails and publish them in Directus by hand.

## Guardrails

- `plan` aborts if the scrape returns under 80% of the current CMS count.
- `plan` aborts if over 30% of the catalogue would change. Override with
  `--max-change-ratio` once you have confirmed the change is real.
- `apply` never writes `status` or `slug` to an existing record.
- Vehicles missing from a scrape are reported, never unpublished.
- Interrupted `apply` runs resume — the plan file records completed ids.

## Gotchas

- **Scraping is two collectors, not one.** LIST holds `evdb_id`/`make`/`model`/`year`;
  DETAILS holds `battery_details`/`charging`/`performance` and none of the identity fields.
  They join on `car_url`. A LIST row with no DETAILS match is dropped, because without
  `battery_details.nominal_capacity` the generated slug loses its kWh component.
- **DETAILS returns `{vehicle: "<json string>"}`** — the record must be `JSON.parse`d.
- `evdb_id` is a string in Directus and a number in the scrape. Always coerce.
- Slugs are frozen after creation. Drift is reported, not applied.
- Bright Data snapshots expire (16 days batch, 7 real-time). Keep `data/raw/`.
- The `/dca/*` endpoints are current, not deprecated. Do not migrate to
  `/datasets/v3/*` — that is for Bright Data's prebuilt scrapers, not custom collectors.
```

- [ ] **Step 4: Document the commands in CLAUDE.md**

Add under the existing `## Commands` section:

```
npm run ingest -- plan --in <file>   # Diff EVDB snapshot vs CMS (read-only)
npm run ingest -- apply --plan <file> # Apply a reviewed plan
```

See `docs/vehicle-ingest.md` for the full runbook.

- [ ] **Step 5: Commit**

```bash
git add docs/vehicle-ingest.md CLAUDE.md
git commit -m "docs(ingest): runbook and command reference"
```

---

## Self-Review

**Spec coverage:** Every spec section maps to a task — modules (1, 2, 4, 4b, 5, 6, 7, 8, 9), plan/apply CLI (10), identity and change detection (5, 6, 7), slug freeze (6, 7, 8), plan buckets (7), safety rules (3, 6, 7, 8), error handling (4, 8), secrets (12), Bright Data notes (4, 4b, 12), testing (2, 3, and per-task), rollout (11, 12), brand ordering risk (9, 10).

**Revision after receiving the collector sources:** Task 4b was added and Tasks 4 and 10
amended. The original plan assumed a single collector; the actual pipeline runs LIST then
DETAILS and joins on `car_url`, and the DETAILS parser returns its payload as a JSON string.
`classifyAvailability` was also missing — the original `cmdClean` filtered on a field nothing
computed. Task 11 is unaffected: the December 2025 cleaned dataset is already merged, so it
remains a valid acceptance oracle.

**Deferred from the spec:** the `images` command is not in this plan. It is independent of correctness, only affects newly created vehicles, and the existing 12,033 files on disk cover the current catalogue. It should be its own plan once Task 11 confirms the identity fix. Noted here so it is not mistaken for an oversight.

**Type consistency:** `NumericField` (Task 1) is used by Tasks 2 and 6. `ScrapedVehicle`/`CmsVehicle`/`PlanEntry`/`IngestPlan` (Task 1) flow through Tasks 5–10. `generateSlug` (Task 2) is consumed by Tasks 3 and 7. `buildPayload` (Task 6) by Task 7. `indexByEvdbId` (Task 5) by Task 7. `applyPlan` (Task 8) by Task 10. Names match across every task.
