# Bright Data Collectors — Source of Record

The EV Database scrape runs on two **custom** Bright Data collectors (Scraper Studio,
formerly "Data Collectors"). Their code lives in the Bright Data UI, not in any repo, so
this file is the version-controlled copy.

| Collector | Purpose | ID (verified live 2026-08-23) |
|---|---|---|
| EVDB \| List vehicles | Identity + summary specs, one request for the whole catalogue | `c_mt5fn06415t3hneeuk` |
| EVDB \| Get vehicle | Deep spec blocks, one input per `car_url` | `c_mt5fkkem28oxnkkme0` |

Both are **BROWSER** worker type. Each has an *interaction* script and a *parser* script.

> **Verify before relying on this file.** These sources were transcribed from a working
> session, not exported from Bright Data. Diff them against the live collectors before
> using them to recreate anything. If they differ, the dashboard wins — and update this
> file.

## Why this file exists

The pipeline reads collector IDs from the environment
(`BRIGHTDATA_LIST_COLLECTOR` / `BRIGHTDATA_DETAILS_COLLECTOR`, see
`src/lib/vehicles/ingest/brightdata.ts`), so recreating the collectors under a different
Bright Data account needs **no code change** — only new IDs in `.env.local`.

## Verified live 2026-08-23 — read this before debugging anything

Both collectors were triggered successfully on this date. The current IDs are in the table
above. Two things that look alarming but are **not** blockers, both established by an actual
run:

**`can_make_requests: false` / `zone_not_found` does NOT block Scraper Studio.** The account
reports zero active zones, and triggers still return HTTP 200 with a `collection_id`:

```bash
curl -s -H "Authorization: Bearer $BRIGHTDATA_API_TOKEN" https://api.brightdata.com/status
# → {"status":"active","customer":"hl_27b6d7ae","can_make_requests":false,
#    "auth_fail_reason":"zone_not_found", …}   ← collectors still work
```

That flag governs proxy zones, not collector runs. Ignore it here.

**Stale collector IDs are the thing that actually bites.** A wrong ID returns
`404 {"error":"Collector not found"}` — byte-identical to what a made-up ID returns, so it
gives no hint that the ID is merely outdated. The IDs originally carried in the notebook
(`c_mipqo2it4a63h5g0k`, `c_misied485yd5jpx0u`) are dead. If a trigger 404s, re-read the IDs
from the scrapers dashboard before assuming anything about accounts or permissions.

Note also that these are *not* valid ways to check a collector:
`GET /dca/dataset?id=<collector_id>` expects a *snapshot* id and 404s for a perfectly good
collector, and `GET /dca/get_collectors` does not exist at all. The only definitive check is
a real `POST /dca/trigger`, which starts a billable job.

## Snapshot wire format — the part that broke the first implementation

`GET /dca/dataset?id=<snapshot_id>` returns **newline-delimited JSON**, one object per line
— *not* a JSON array. A 1,405-vehicle LIST snapshot is 1,405 lines. Calling `res.json()` on
it throws on line 2. `parseSnapshotBody` in `src/lib/vehicles/ingest/brightdata.ts` handles
NDJSON, a plain array, and a single bare object (a one-row snapshot).

Observed in-progress responses, in order:

```json
{"status":"collecting","message":"Job is not finished"}
{"status":"building","message":"Dataset is not ready yet, try again in 30s"}
```

Both must be polled through. `collecting` in particular was missing from the first
implementation, which threw on the very first poll. Note both carry a `message` alongside
`status`, so a status envelope cannot be detected by key count.

## Cost note: LIST returns the whole historical catalogue

With default filters the LIST collector returned **1,405** vehicles, of which **645** were
"Available to order". Only available vehicles are ever ingested, so `scrape` filters to
those *before* running DETAILS — otherwise roughly 760 billable page scrapes are wasted on
discontinued models every refresh.

## Output contract the pipeline depends on

If you change either parser, these are the guarantees
`src/lib/vehicles/ingest/merge.ts` relies on. Breaking one breaks ingestion silently.

- **LIST** emits, per vehicle: `id` (base36 of `evdb_id`), `evdb_id` (number),
  `date {from,to}`, `year {from,to}`, `rank`, `thumb_url`, `car_url`, `title`, `make`,
  `model`, `availability`, and the `{value, unit}` metrics `range`, `efficiency`,
  `weight`, `acceleration_0100`, `range_1stop`, `battery`, `fastcharge`, `towing_weight`,
  `cargo_cap`, `price_perrange`, plus `price {de,nl,uk}`.
- **DETAILS** emits, per vehicle: `car_url`, `title`, `breadcrumb`, `images_urls`,
  `pricing_availability`, `real_range`, `distance_suitability`, `battery_details`,
  `charging`, `performance`, `v2x_charging`, `energy_consumption`,
  `real_energy_consumption`, `dimensions_weight`, `misc`, `preceding_model`,
  `home_destination_charging_details`, `meta`, `metadata {parsed_at, …}`.
- **DETAILS carries no `evdb_id`, `make`, `model` or `year`.** The two records are joined
  on `car_url`. This is why `scrape` runs both collectors.
- **DETAILS returns its payload as a JSON string**: the parser's production return is
  `{ vehicle: JSON.stringify(vehicle) }`. `unwrapDetails` parses it. If you switch the
  parser to the commented-out `return vehicle` dev form, `unwrapDetails` tolerates that
  too.
- `battery_details.nominal_capacity` is **required** — it supplies the `kWh` component of
  the generated slug. A LIST row whose DETAILS record is missing gets dropped rather than
  produce a malformed URL.
- Note that LIST `battery` is *useable* capacity while the slug uses *nominal* capacity
  from DETAILS. They are different numbers; do not conflate them.

---

## 1. EVDB | List vehicles

### Interaction

```javascript
// EV-Database LIST collector - single page using p=0-2000
// Worker type: BROWSER

const BASE = "https://ev-database.org/";

// Defaults (based on EV-Database current UI)
const defaults = {
  price:       { min: 10000, max: 100000 }, // rs-pr
  range:       { min: 0,     max: 1000 },   // rs-er
  long_dist:   { min: 0,     max: 1000 },   // rs-ld
  acceleration:{ min: 2,     max: 23 },     // rs-ac
  dcfc:        { min: 0,     max: 400 },    // rs-dcfc
  battery:     { min: 10,    max: 200 },    // rs-ub
  tow:         { min: 0,     max: 3000 },   // rs-tw
  efficiency:  { min: 100,   max: 350 },    // rs-ef
  seats:       { min: -1,    max: 5 },      // rs-sa
  weight:      { min: 1000,  max: 3500 },   // rs-w
  cargo:       { min: 0,     max: 5000 },   // rs-c
  year:        { min: 2010,  max: 2030 },   // rs-y
  sort: 1,                                   // s=1 (sort by rank)
  page_size: 2000                            // ask for up to 2000 cars in one shot
};

// Read config from input (supports both object and array forms)
let cfg = {};

if (input && typeof input === "object") {
  if (Array.isArray(input)) {
    // DCA / API mode: input is an array of records
    cfg = input[0] || {};
  } else {
    // IDE template/preview mode: input is a single object
    cfg = input;
  }
}

// Optional: drop internal Bright Data metadata
if ("__source" in cfg) {
  delete cfg.__source;
}

// Helper for {min,max} w/ auto-fix if reversed, and number parsing
function getRange(obj, def) {
  let minVal = (obj && obj.min != null) ? parseInt(obj.min, 10) : def.min;
  let maxVal = (obj && obj.max != null) ? parseInt(obj.max, 10) : def.max;

  if (isNaN(minVal)) minVal = def.min;
  if (isNaN(maxVal)) maxVal = def.max;

  // Auto-fix inverted ranges
  if (maxVal < minVal) {
    const tmp = minVal;
    minVal = maxVal;
    maxVal = tmp;
  }

  return { min: minVal, max: maxVal };
}

// Merge filters from cfg (all optional)

const price       = getRange(cfg.price,       defaults.price);
const rangeVal    = getRange(cfg.range,       defaults.range);
const long_dist   = getRange(cfg.long_dist,   defaults.long_dist);
const acceleration= getRange(cfg.acceleration,defaults.acceleration);
const dcfc        = getRange(cfg.dcfc,        defaults.dcfc);
const battery     = getRange(cfg.battery,     defaults.battery);
const tow         = getRange(cfg.tow,         defaults.tow);
const efficiency  = getRange(cfg.efficiency,  defaults.efficiency);
const seats       = getRange(cfg.seats,       defaults.seats);
const weight      = getRange(cfg.weight,      defaults.weight);
const cargo       = getRange(cfg.cargo,       defaults.cargo);
const year        = getRange(cfg.year,        defaults.year);

const sort       = cfg.sort      ?? defaults.sort;
const page_size  = cfg.page_size ?? defaults.page_size;

// --- Build full URL (filters + p=0-page_size) ---

const hash =
  "#group=vehicle-group"
  + `&rs-pr=${price.min}_${price.max}`
  + `&rs-er=${rangeVal.min}_${rangeVal.max}`
  + `&rs-ld=${long_dist.min}_${long_dist.max}`
  + `&rs-ac=${acceleration.min}_${acceleration.max}`
  + `&rs-dcfc=${dcfc.min}_${dcfc.max}`
  + `&rs-ub=${battery.min}_${battery.max}`
  + `&rs-tw=${tow.min}_${tow.max}`
  + `&rs-ef=${efficiency.min}_${efficiency.max}`
  + `&rs-sa=${seats.min}_${seats.max}`
  + `&rs-w=${weight.min}_${weight.max}`
  + `&rs-c=${cargo.min}_${cargo.max}`
  + `&rs-y=${year.min}_${year.max}`
  + `&s=${sort}`
  + `&p=0-${page_size}`;

const url = BASE + hash;

// --- Single navigation & parse ---

navigate(url);

try {
  wait(".list-item");
} catch (e) {
  // No vehicles found, nothing to collect
  collect([]);
  done();
}

const cars = parse();  // parser returns array of vehicles

if (cars && cars.length > 0) {
  collect(cars);
} else {
  collect([]);
}
```

### Parser

```javascript
// Parser for EV-Database list page with Date objects for date.from/date.to

// Short, stable vehicle id based on evdb_id (base36)
function makeVehicleId(evdb_id_raw) {
  const n = parseInt(evdb_id_raw, 10);
  if (!isNaN(n)) {
    return n.toString(36);
  }
  return evdb_id_raw || null;
}

// Convert Unix seconds → JS Date or null
function tsToDate(raw) {
  if (!raw) return null;

  const ts = parseInt(raw, 10);
  if (isNaN(ts)) return null;

  // EV-DB sentinel: 946684800 = "no end date"
  if (ts === 946684800) return null;

  return new Date(ts * 1000); // seconds → ms
}

/**
 * Robust locale-aware number parser.
 *
 * Handles:
 *  - 1.979   -> 1979   (thousands separator)
 *  - 73,4    -> 73.4   (decimal comma)
 *  - 1.234,5 -> 1234.5 (mixed: dot thousands + comma decimal)
 *  - 1,234.5 -> 1234.5 (mixed: comma thousands + dot decimal)
 */
function parseNumberSmart(str) {
  if (!str) return NaN;

  str = str.trim();

  const hasDot = str.includes(".");
  const hasComma = str.includes(",");

  // If both separators exist, detect which is decimal based on last occurrence
  // Example EU: "1.234,5" (comma last => comma decimal)
  // Example US: "1,234.5" (dot last => dot decimal)
  if (hasDot && hasComma) {
    const lastDot = str.lastIndexOf(".");
    const lastComma = str.lastIndexOf(",");

    if (lastComma > lastDot) {
      // EU style: dot = thousands, comma = decimal
      return parseFloat(str.replace(/\./g, "").replace(",", "."));
    } else {
      // US style: comma = thousands, dot = decimal
      return parseFloat(str.replace(/,/g, ""));
    }
  }

  // Only comma exists → could be decimal comma OR thousands separator
  if (hasComma && !hasDot) {
    // If comma is followed by exactly 3 digits, likely thousands separator
    // Example: "41,990" → 41990
    if (/,\d{3}$/.test(str)) {
      return parseFloat(str.replace(/,/g, ""));
    }
    // Otherwise treat comma as decimal
    return parseFloat(str.replace(",", "."));
  }

  // Only dot exists → could be decimal dot OR thousands separator
  if (hasDot && !hasComma) {
    // If dot is followed by exactly 3 digits, likely thousands separator
    // Example: "1.979" → 1979
    if (/\.\d{3}$/.test(str)) {
      return parseFloat(str.replace(/\./g, ""));
    }
    return parseFloat(str);
  }

  // Plain integer
  return parseFloat(str);
}

// Parse metrics like "245 km" or "184 Wh/km"
function parseMetric(raw) {
  if (!raw) return null;

  const match = raw.trim().match(/^([\d.,]+)\s*(.*)$/);
  if (!match) return null;

  const value = parseNumberSmart(match[1]);
  const unit  = match[2].trim() || null;

  if (isNaN(value)) return null;

  return { value, unit };
}

// Parse prices like "€31,690" or "€41.990" or "€41.990,00"
function parsePrice(raw) {
  if (!raw) return null;

  const match = raw.trim().match(/^([^0-9]+)\s*([\d.,]+)/);
  if (!match) return null;

  const currency = match[1].trim();
  const valueRaw = match[2].trim();

  const valueNum = parseNumberSmart(valueRaw);
  if (isNaN(valueNum)) return null;

  // Prices should be integer euros/pounds
  const value = Math.round(valueNum);

  return { currency, value };
}

// Price-per-range parser, e.g. "€102 /km" → { value: 102, unit: "€/km" }
function parsePricePerRange(raw) {
  if (!raw) return null;

  const text = raw.trim();
  // Examples: "€102 /km", "€ 102 / km"
  const match = text.match(/^([^0-9]*)([\d.,]+)\s*\/\s*([A-Za-z]+)$/);
  if (!match) return null;

  const currency = match[1].trim();               // "€"
  const value = parseNumberSmart(match[2]);       // robust parsing
  const perUnit = match[3].trim();                // "km"

  if (isNaN(value)) return null;

  return {
    value,
    unit: currency ? `${currency}/${perUnit}` : `/${perUnit}`
  };
}

// Clean title to remove make & duplicated segments
function cleanTitle(make, rawTitle) {
  if (!rawTitle) return rawTitle;

  let title = rawTitle.trim();

  // 1. Remove make prefix (case-insensitive)
  if (make) {
    const makeRegex = new RegExp("^" + make + "\\s+", "i");
    title = title.replace(makeRegex, "");
  }

  // 2. Deduplicate consecutive words
  const parts = title.split(/\s+/);
  const dedup = [];
  for (const word of parts) {
    if (dedup[dedup.length - 1] !== word) {
      dedup.push(word);
    }
  }
  title = dedup.join(" ");

  // 3. If whole string is exactly repeated twice, collapse
  const half = Math.floor(title.length / 2);
  const firstHalf = title.substring(0, half).trim();
  const secondHalf = title.substring(half).trim();
  if (firstHalf && firstHalf === secondHalf) {
    title = firstHalf;
  }

  return title.trim();
}

const BASE = "https://ev-database.org";

return $(".list-item").toArray().map(el => {
  const $car = $(el);
  const $hidden = $car.find("div.hidden").first();

  // --- Hidden metadata ---

  const evdb_id_raw = $hidden.find(".id.hidden").text().trim();
  const evdb_id = evdb_id_raw ? parseInt(evdb_id_raw, 10) : null;

  const date_from_raw = $hidden.find(".date_from.hidden").text().trim();
  const date_to_raw   = $hidden.find(".date_to.hidden").text().trim();

  const date_from = tsToDate(date_from_raw); // Date or null
  const date_to   = tsToDate(date_to_raw);   // Date or null

  const year_from_raw = $hidden.find(".year_from.hidden").text().trim();
  const year_to_raw   = $hidden.find(".year_to.hidden").text().trim();

  const year_from_num = year_from_raw ? parseInt(year_from_raw, 10) : null;
  const year_to_num_raw = year_to_raw ? parseInt(year_to_raw, 10) : null;

  const year_from = isNaN(year_from_num) ? null : year_from_num;
  const year_to =
    (year_to_num_raw === 2000 || isNaN(year_to_num_raw))
      ? null
      : year_to_num_raw;

  const rank_raw = $hidden.find(".rank.hidden").text().trim();
  const rank = rank_raw ? parseInt(rank_raw, 10) : null;

  // Custom stable ID
  const id = makeVehicleId(evdb_id_raw);

  // --- Thumbnail ---

  const srcset = $car.find("img").attr("srcset") || "";
  const parts = srcset.split(",").map(x => x.trim()).filter(Boolean);
  const best = parts.length ? parts[parts.length - 1].split(" ")[0] : "";
  const thumb_url = best ? new URL(best, BASE).href : "";

  // --- Title / make / model ---

  const $titleWrap = $car.find(".title-wrap");
  const href = $titleWrap.find("a").attr("href") || "";
  const car_url = href ? new URL(href, BASE).href : "";

  const title_raw = $titleWrap.find("a.title").text().trim();
  const make = $titleWrap.find("span").first().text().trim();
  const title = cleanTitle(make, title_raw);
  const model = $titleWrap.find(".model").text().trim();
  const availability = $titleWrap.find(".availability").text().trim();

  // --- Specs ---

  const range             = parseMetric($car.find(".erange_real").text().trim());
  const efficiency        = parseMetric($car.find(".efficiency").text().trim());
  const weight            = parseMetric($car.find(".weight_p").text().trim());
  const acceleration_0100 = parseMetric($car.find(".acceleration_p").text().trim());
  const range_1stop       = parseMetric($car.find(".long_distance_total").text().trim());
  const battery           = parseMetric($car.find(".battery_p").text().trim());
  const fastcharge        = parseMetric($car.find(".fastcharge_speed_print").text().trim());
  const towing_weight     = parseMetric($car.find(".towweight_p").text().trim());
  const cargo_cap         = parseMetric($car.find(".cargo").text().trim());
  const price_perrange    = parsePricePerRange($car.find(".priceperrange_p").text().trim());

  // --- Prices ---

  const price_de = parsePrice($car.find(".country_de").text().trim());
  const price_nl = parsePrice($car.find(".country_nl").text().trim());
  const price_uk = parsePrice($car.find(".country_uk").text().trim());

  return {
    id,
    evdb_id,
    date: {
      from: date_from, // JS Date or null
      to:   date_to
    },
    year: {
      from: year_from, // number or null
      to:   year_to
    },
    rank,
    thumb_url,
    car_url,
    title,
    make,
    model,
    availability,
    range,           // { value, unit } e.g. {360, "km"}
    efficiency,      // e.g. {171, "Wh/km"}
    weight,          // FIXED parsing: {1979, "kg"} instead of {1.979, "kg"}
    acceleration_0100,    // {7.9, "sec"}
    range_1stop,     // {405, "km"}
    battery,         // FIXED parsing: {73.4, "kWh"} and not {734, "kWh"}
    fastcharge,      // {115, "kW"}
    towing_weight,   // FIXED parsing: {1500, "kg"} not {1.5, "kg"}
    cargo_cap,       // {363, "L"}
    price_perrange,  // { value: 102, unit: "€/km" }
    price: {
      de: price_de, // { currency, value } or null
      nl: price_nl,
      uk: price_uk
    }
  };
});
```

---

## 2. EVDB | Get vehicle

Input per record: `{ car_url: "https://ev-database.org/car/…" }`. The pipeline chunks
these 100 at a time (`CHUNK` in `scripts/vehicles-ingest.ts`).

### Interaction

```javascript
// EVDB | Get vehicle - Interaction
// Worker type: BROWSER

const BASE = "https://ev-database.org";

// Normalise input into cfg: support both [ {...} ] and { ... }
let cfg = {};
if (Array.isArray(input) && input.length > 0) {
  cfg = input[0];
} else if (input && typeof input === "object") {
  cfg = input;
}

console.log("Raw input:", JSON.stringify(input));
console.log("Config:", JSON.stringify(cfg));

// Accept car_url, url or path
let url = cfg.car_url || cfg.url || cfg.path;

// Normalise relative URLs
if (url && !/^https?:\/\//i.test(url)) {
  url = BASE.replace(/\/$/, "") + "/" + String(url).replace(/^\//, "");
}

if (!url) {
  console.log("No URL provided in input. Expected { car_url: '...' } or { url: '...' }.");
  collect([]);
  return;
}

console.log("Navigating to:", url);
navigate(url);

try {
  // 1) REQUIRED: wait for page structure (fast + reliable)
  wait_any(
    ["#range", "#battery", "#efficiency", "#pricing", "h1"],
    { timeout: 45000 }
  );

  // 2) OPTIONAL: best-effort wait for >= 3 images (never blocks)
  try {
    wait(
      function () {
        return document.querySelectorAll(".fotorama img").length >= 3;
      },
      { timeout: 15000 }
    );
    console.log("✅ At least 3 images loaded");
  } catch (e2) {
    console.log("ℹ️ Less than 3 images loaded within 15s; continuing anyway");
  }

} catch (e) {
  console.log("Timeout waiting for vehicle page structure:", e && e.message);
  collect([]);
  return;
}

// Parser returns a single vehicle object
const vehicle = parse();
collect(vehicle ? [vehicle] : []);
```

### Parser

The parser is long; it is reproduced in full because a partial copy is worse than none.
Note the production return at the very bottom — `{ vehicle: JSON.stringify(vehicle) }` —
which is what `unwrapDetails` in `src/lib/vehicles/ingest/merge.ts` exists to undo.

```javascript
// EVDB | Get vehicle - Parser
// Runs inside Bright Data browser context with jQuery-like `$`.

const BASE = "https://ev-database.org";

//
// ---------- Generic helpers ----------
//

function absUrl(path) {
  if (!path) return null;
  try {
    return new URL(path, BASE).href;
  } catch (e) {
    return path;
  }
}

// Parse metrics like "245 km" or "184 Wh/km"
function parseMetric(raw) {
  if (!raw) return null;

  const match = raw.trim().match(/^([\d.,]+)\s*(.*)$/);
  if (!match) return null;

  const value = parseFloat(match[1].replace(/,/g, ""));
  if (isNaN(value)) return null;

  const unit = match[2].trim() || null;
  return { value, unit };
}

// Parse prices like "€31,690"
function parsePrice(raw) {
  if (!raw) return null;

  const match = raw.trim().match(/^([^0-9]+)\s*([\d.,]+)/);
  if (!match) return null;

  const currency = match[1].trim();
  const value = parseInt(match[2].replace(/,/g, ""), 10);
  if (isNaN(value)) return null;

  return { currency, value };
}

// Price-per-range parser, e.g. "€102 /km" → { value: 102, unit: "€/km" }
function parsePricePerRange(raw) {
  if (!raw) return null;

  const text = raw.trim();
  const match = text.match(/^([^0-9]*)([\d.,]+)\s*\/\s*([A-Za-z]+)$/);
  if (!match) return null;

  const currency = match[1].trim();
  const value = parseFloat(match[2].replace(/,/g, ""));
  if (isNaN(value)) return null;

  const perUnit = match[3].trim();
  return {
    value,
    unit: currency ? `${currency}/${perUnit}` : `/${perUnit}`
  };
}

// Convert things like "1h 30m", "9h45m", "1:30", "90 min" → minutes (Number)
function timeToMinutes(raw) {
  if (!raw) return null;
  const text = raw.trim();

  let m;
  let total = 0;

  // "1h 30m", "1 h", "2 hours 15 min"
  m = text.match(/(\d+)\s*h(?:ours?)?/i);
  if (m) total += parseInt(m[1], 10) * 60;

  m = text.match(/(\d+)\s*m(?:in(?:utes)?)?/i);
  if (m) total += parseInt(m[1], 10);

  if (total > 0) return total;

  // "1:30"
  m = text.match(/(\d+):(\d+)/);
  if (m) {
    const h = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    if (!isNaN(h) && !isNaN(mins)) return h * 60 + mins;
  }

  // Bare number → assume minutes
  m = text.match(/(\d+(?:\.\d+)?)/);
  if (m) {
    const v = parseFloat(m[1]);
    if (!isNaN(v)) return Math.round(v);
  }

  return null;
}

// label: "Charge Time (0->440 km)"
// valueRaw: "9h45m" or "24 min"
function parseChargeTimeWithRange(labelRaw, valueRaw) {
  if (!labelRaw || !valueRaw) return null;

  const label = labelRaw.trim();
  const value = timeToMinutes(valueRaw);
  if (value == null) return null;

  const m = label.match(/(\d+)\s*->\s*(\d+)\s*([A-Za-z]+)/);
  if (!m) {
    return {
      value,
      unit: "min",
      range: null
    };
  }

  const fromVal = parseInt(m[1], 10);
  const toVal = parseInt(m[2], 10);
  const unit = m[3] || "km";

  return {
    value,
    unit: "min",
    range: {
      from: { value: fromVal, unit },
      to: { value: toVal, unit }
    }
  };
}

function parseNumberAndUnit(raw, fallbackUnit = null) {
  if (!raw) return { unit: fallbackUnit, value: null };

  const txt = String(raw).trim();

  // Match "11 kW", "7.4kW", "50 km/h", "32 A", etc.
  const m = txt.match(/([\d.,]+)\s*([a-zA-Z/°%]+)?/);
  if (!m) return { unit: fallbackUnit, value: null };

  const num = parseFloat(m[1].replace(",", "."));
  const unit = m[2] || fallbackUnit;

  return {
    unit: unit || fallbackUnit,
    value: Number.isFinite(num) ? num : null
  };
}

// Example: "230 V / 16 A / 1 phase" or "400V / 3x16A"
function parseMaxPowerDescriptor(raw) {
  if (!raw) {
    return {
      voltage: { unit: "V", value: null },
      current: { unit: "A", value: null },
      phases: null
    };
  }

  const txt = String(raw);

  // Voltage
  let voltage = { unit: "V", value: null };
  const vMatch = txt.match(/(\d+(?:[.,]\d+)?)\s*V/i);
  if (vMatch) {
    const v = parseFloat(vMatch[1].replace(",", "."));
    if (Number.isFinite(v)) voltage = { unit: "V", value: v };
  }

  // Current
  let current = { unit: "A", value: null };
  const aMatch = txt.match(/(\d+(?:[.,]\d+)?)\s*A/i);
  if (aMatch) {
    const a = parseFloat(aMatch[1].replace(",", "."));
    if (Number.isFinite(a)) current = { unit: "A", value: a };
  }

  // Phases: try explicit "1 phase"/"3 phases" first
  let phases = null;
  const pMatch = txt.match(/(\d+)\s*(phase|phases|φ)/i);
  if (pMatch) {
    const p = parseInt(pMatch[1], 10);
    if (Number.isInteger(p)) phases = p;
  }

  // Fallback: infer from "3x16A" / "1x10A"
  if (phases == null) {
    const xMatch = txt.match(/(\d+)\s*x\s*\d+\s*A/i);
    if (xMatch) {
      const p = parseInt(xMatch[1], 10);
      if (Number.isInteger(p)) phases = p;
    }
  }

  return { voltage, current, phases };
}

// Handle durations like "10 h 30 min", "10:30 h", "12 hours", "8 h"
function parseTimeToMinutes(raw) {
  if (!raw) return { unit: "min", value: null };

  const txt = String(raw).toLowerCase().trim();

  // Pattern like "10:30", "7:05h"
  const colonMatch = txt.match(/(\d+)\s*[:h]\s*(\d{1,2})?/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10) || 0;
    const m = parseInt(colonMatch[2] || "0", 10) || 0;
    return { unit: "min", value: h * 60 + m };
  }

  // "10 h 30 min" / "10h 30m"
  const hMatch = txt.match(/(\d+(?:[.,]\d+)?)\s*h/);
  const mMatch = txt.match(/(\d+(?:[.,]\d+)?)\s*m/);

  let totalMinutes = 0;
  let hasSomething = false;

  if (hMatch) {
    const h = parseFloat(hMatch[1].replace(",", "."));
    if (Number.isFinite(h)) {
      totalMinutes += h * 60;
      hasSomething = true;
    }
  }

  if (mMatch) {
    const m = parseFloat(mMatch[1].replace(",", "."));
    if (Number.isFinite(m)) {
      totalMinutes += m;
      hasSomething = true;
    }
  }

  if (hasSomething) return { unit: "min", value: totalMinutes };

  // Fallback: just try to parse a plain number and assume hours
  const plain = parseFloat(txt.replace(",", "."));
  if (Number.isFinite(plain)) {
    return { unit: "min", value: plain * 60 };
  }

  return { unit: "min", value: null };
}

// Convert simple "Yes"/"No"/"Not available"/"No Data"/"-" to booleans/null.
// For anything else, return the original trimmed string.
function normalizeTextValue(raw) {
  if (raw == null) return null;
  const txt = String(raw).trim();
  if (!txt) return null;

  const lower = txt.toLowerCase();

  if (lower === "yes") return true;
  if (lower === "no") return false;
  if (lower === "not available") return false;
  if (lower === "no data") return null;
  if (txt === "-") return null;

  return txt;
}

// Recursively collect all "unit" fields from { unit, value }-style objects
function collectUnits(obj, set) {
  if (!obj || typeof obj !== "object") return;

  // If it looks like a metric object, collect its unit
  if (
    Object.prototype.hasOwnProperty.call(obj, "unit") &&
    Object.prototype.hasOwnProperty.call(obj, "value")
  ) {
    const u = obj.unit;
    if (u && typeof u === "string") {
      set.add(u.trim());
    }
  }

  // Recurse into children
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const val = obj[key];
    if (val && typeof val === "object") {
      collectUnits(val, set);
    }
  }
}

// ----- Meta / Open Graph info -----
function extractMetaInfo() {
  // Basic meta description
  const description =
    $('meta[name="description"]').attr("content") || null;

  // Open Graph
  const og_title =
    $('meta[property="og:title"]').attr("content") || null;
  const og_description =
    $('meta[property="og:description"]').attr("content") || null;
  const og_image_raw =
    $('meta[property="og:image"]').attr("content") || null;
  const og_url_raw =
    $('meta[property="og:url"]').attr("content") || null;
  const og_type =
    $('meta[property="og:type"]').attr("content") || null;
  const og_site_name =
    $('meta[property="og:site_name"]').attr("content") || null;

  // Twitter
  const twitter_card =
    $('meta[name="twitter:card"]').attr("content") || null;
  const twitter_title =
    $('meta[name="twitter:title"]').attr("content") || null;
  const twitter_description =
    $('meta[name="twitter:description"]').attr("content") || null;
  const twitter_image_raw =
    $('meta[name="twitter:image"], meta[name="twitter:image:src"]').attr("content") || null;

  // Normalise URLs via absUrl helper
  const og_image   = og_image_raw ? absUrl(og_image_raw) : null;
  const og_url     = og_url_raw ? absUrl(og_url_raw) : null;
  const twitter_image = twitter_image_raw ? absUrl(twitter_image_raw) : null;

  const meta = {
    description,
    og_title,
    og_description,
    og_image,
    og_url,
    og_type,
    og_site_name,
    twitter_card,
    twitter_title,
    twitter_description,
    twitter_image
  };

  // If all fields are null/undefined, return null instead of an empty object
  const hasAny = Object.values(meta).some((v) => v != null && v !== "");
  return hasAny ? meta : null;
}

//
// ---------- Section extractors ----------
//

// ----- Real Range -----
function extractRealRange() {
  const $range = $("#range");
  if (!$range.length) return null;

  const hText = $range.find("h2").text().trim(); // e.g. "315 - 630 km"
  let headline = null;

  const hMatch = hText.match(/([\d.,]+)\s*[-–]\s*([\d.,]+)\s*([A-Za-z/]+)?/);
  if (hMatch) {
    const fromNum = hMatch[1];
    const toNum = hMatch[2];
    const unit = hMatch[3] || "km";

    headline = {
      from: parseMetric(`${fromNum} ${unit}`),
      to: parseMetric(`${toNum} ${unit}`)
    };
  }

  function metricFromRow(labelRegex) {
    const $labelCell = $range
      .find("td")
      .filter(function () {
        return labelRegex.test($(this).text());
      })
      .first();

    if (!$labelCell.length) return null;

    const $valCell = $labelCell.next("td");
    if (!$valCell.length) return null;

    return parseMetric($valCell.text());
  }

  const cold = {
    city: metricFromRow(/City.*Cold.*Weather/i),
    highway: metricFromRow(/Highway.*Cold.*Weather/i),
    combined: metricFromRow(/Combined.*Cold.*Weather/i)
  };

  const mild = {
    city: metricFromRow(/City.*Mild.*Weather/i),
    highway: metricFromRow(/Highway.*Mild.*Weather/i),
    combined: metricFromRow(/Combined.*Mild.*Weather/i)
  };

  return {
    headline,
    cold_weather: cold,
    mild_weather: mild,
    note: "Indication of real-world range in several situations. Cold weather: 'worst-case' based on -10°C and use of heating. Mild weather: 'best-case' based on 23°C and no use of A/C. For 'Highway' figures a constant speed of 110 km/h is assumed. The actual range will depend on speed, style of driving, weather and route conditions."
  };
}

// ----- Distance Suitability -----
function extractDistanceSuitability() {
  const $ld = $("#longdistance");
  if (!$ld.length) return null;

  function numberFromRow(labelRegex, matchIndex) {
    const $labels = $ld
      .find("td")
      .filter(function () {
        return labelRegex.test($(this).text());
      });
    if (!$labels.length) return null;

    const $label = matchIndex != null ? $labels.eq(matchIndex) : $labels.first();
    const $val = $label.next("td");
    if (!$val.length) return null;

    const txt = $val.text();
    const m = txt.match(/[\d.,]+/);
    if (!m) return null;
    const num = parseFloat(m[0].replace(/,/g, ""));
    return isNaN(num) ? null : num;
  }

  function minutesFromRow(labelRegex, matchIndex) {
    const $labels = $ld
      .find("td")
      .filter(function () {
        return labelRegex.test($(this).text());
      });
    if (!$labels.length) return null;

    const $label = matchIndex != null ? $labels.eq(matchIndex) : $labels.first();
    const $val = $label.next("td");
    if (!$val.length) return null;

    const mins = timeToMinutes($val.text());
    return typeof mins === "number" ? mins : null;
  }

  function distanceMetric(labelRegex, matchIndex) {
    const v = numberFromRow(labelRegex, matchIndex);
    if (v == null) return null;
    return { value: v, unit: "km" };
  }

  function durationMetric(labelRegex, matchIndex) {
    const v = minutesFromRow(labelRegex, matchIndex);
    if (v == null) return null;
    return { value: v, unit: "min" };
  }

  const distance = {
    first_leg: distanceMetric(/First.*Leg.*Distance/i),
    charging_stop: distanceMetric(/Charging.*Stop/i, 0),
    second_leg: distanceMetric(/Second.*Leg.*Distance/i),
    total: distanceMetric(/Total.*Distance/i)
  };

  const duration = {
    first_leg: durationMetric(/First.*Leg.*Duration/i),
    charging_stop: durationMetric(/Charging.*Stop/i, 1),
    second_leg: durationMetric(/Second.*Leg.*Duration/i),
    total: durationMetric(/Total.*Duration/i)
  };

  const ratingText =
    $ld.find(".rating-display").text().trim().replace(/\s+/g, "") || null;

  return {
    distance,
    duration,
    rating: ratingText,
    note: "The 'long distance suitability' is a 5-star rating that indicates how suitable a vehicle is for long trips. The rating is based on the 1-Stop Range: the total distance a vehicle can cover with one charging stop of 15 minutes."
  };
}

// ----- Battery -----
function extractBattery() {
  const $batt = $("#battery");
  if (!$batt.length) return null;

  function rowText(labelRegex) {
    const $labelTd = $batt
      .find("td")
      .filter(function () {
        return labelRegex.test($(this).text());
      })
      .first();

    if (!$labelTd.length) return null;

    const $valTd = $labelTd.next("td");
    return $valTd.length ? $valTd.text().trim() : null;
  }

  const nominal_capacity = parseMetric(rowText(/Nominal.*Capacity/i));
  const useable_capacity = parseMetric(rowText(/Useable.*Capacity/i));

  const architecture = parseMetric(rowText(/Architecture/i));
  const warranty_period = parseMetric(rowText(/Warranty.*Period/i));
  const warranty_mileage = parseMetric(rowText(/Warranty.*Mileage/i));
  const nominal_voltage = parseMetric(rowText(/Nominal.*Voltage/i));

  let nb_of_cells = null;
  const nbTxt = rowText(/Number.*of.*Cells/i);
  if (nbTxt) {
    const m = nbTxt.match(/\d+/);
    if (m) nb_of_cells = parseInt(m[0], 10);
  }

  return {
    nominal_capacity,
    useable_capacity,
    type: normalizeTextValue(rowText(/Battery.*Type/i)),
    cathode_material: normalizeTextValue(rowText(/Cathode.*Material/i)),
    nb_of_cells,
    pack_configuration: normalizeTextValue(rowText(/Pack.*Configuration/i)),
    architecture,
    nominal_voltage,
    warranty_period,
    form_factor: normalizeTextValue(rowText(/Form.*Factor/i)),
    warranty_mileage,
    name_ref: normalizeTextValue(rowText(/Name.*Reference/i))
  };
}

// ----- Charging -----
function extractCharging() {
  const $ch = $("#charging");
  if (!$ch.length) return null;

  function rowPair(labelRegex, index) {
    const $labels = $ch
      .find("td")
      .filter(function () {
        return labelRegex.test($(this).text());
      });
    if (!$labels.length) return null;

    const $labelTd =
      typeof index === "number" ? $labels.eq(index) : $labels.first();
    if (!$labelTd.length) return null;

    const $valTd = $labelTd.next("td");
    return {
      label: $labelTd.text().trim(),
      value: $valTd.length ? $valTd.text().trim() : null
    };
  }

  function rowValue(labelRegex, index) {
    const pair = rowPair(labelRegex, index);
    return pair ? pair.value : null;
  }

  const homeCt = rowPair(/Charge\s*Time/i, 0);
  const fastCt = rowPair(/Charge\s*Time/i, 1);

  const home_charge_port_raw = rowValue(/Charge\s*Port/i, 0);
  const home_port_location_raw = rowValue(/Port\s*Location/i, 0);

  const fast_charge_port_raw = rowValue(/Charge\s*Port/i, 1);
  const fast_port_location_raw = rowValue(/Port\s*Location/i, 1);

  const autocharge_supported_raw = rowValue(/Autocharge\s*Supported/i);
  const plug_charge_supported_raw = rowValue(/Plug.*Charge.*Supported/i);
  const plug_supported_protocol_raw = rowValue(/Supported.*Protocol/i);
  const precond_possible_raw = rowValue(/Precon.*Possible/i);
  const auto_using_navigation_raw = rowValue(/Auto.*using.*Navig/i);

  return {
    home_destination: {
      charge_port: normalizeTextValue(home_charge_port_raw),
      charge_time: homeCt
        ? parseChargeTimeWithRange(homeCt.label, homeCt.value)
        : null,
      port_location: normalizeTextValue(home_port_location_raw),
      charge_speed: parseMetric(rowValue(/Charge\s*Speed/i, 0)),
      charge_power: parseMetric(rowValue(/Charge\s*Power/i, 0))
    },

    fast_charging: {
      charge_port: normalizeTextValue(fast_charge_port_raw),
      charge_time: fastCt
        ? parseChargeTimeWithRange(fastCt.label, fastCt.value)
        : null,
      port_location: normalizeTextValue(fast_port_location_raw),
      charge_speed: parseMetric(rowValue(/Charge\s*Speed/i, 1)),
      charge_power_max: parseMetric(rowValue(/Charge\s*Power/i, 1)),
      charge_power_10_80: parseMetric(rowValue(/Charge\s*Power/i, 2)),
      autocharge_supported: normalizeTextValue(autocharge_supported_raw)
    },

    plug_charge: {
      plug_charge_supported: normalizeTextValue(plug_charge_supported_raw),
      supported_protocol: normalizeTextValue(plug_supported_protocol_raw)
    },

    battery_preconditioning: {
      precond_possible: normalizeTextValue(precond_possible_raw),
      auto_using_navigation: normalizeTextValue(auto_using_navigation_raw)
    }
  };
}

// ----- Performance -----
function extractPerformance() {
  const $perf = $("#performance");
  if (!$perf.length) return null;

  function rowText(labelRegex) {
    const $labelTd = $perf
      .find("td")
      .filter(function () {
        return labelRegex.test($(this).text());
      })
      .first();

    if (!$labelTd.length) return null;

    const $valTd = $labelTd.next("td");
    return $valTd.length ? $valTd.text().trim() : null;
  }

  const acceleration_0_100 = parseMetric(rowText(/Acceleration.*100/i));
  const top_speed = parseMetric(rowText(/Top.*Speed/i));

  const powerRaw = rowText(/Total.*Power/i);
  let power_kw = null;
  let power_ps = null;

  if (powerRaw) {
    const kwMatch = powerRaw.match(/([\d.,]+)\s*kW/i);
    if (kwMatch) {
      const v = parseFloat(kwMatch[1].replace(/,/g, ""));
      if (!isNaN(v)) {
        power_kw = { value: v, unit: "kW" };
      }
    }

    const psMatch = powerRaw.match(/([\d.,]+)\s*PS/i);
    if (psMatch) {
      const v = parseFloat(psMatch[1].replace(/,/g, ""));
      if (!isNaN(v)) {
        power_ps = { value: v, unit: "PS" };
      }
    }
  }

  const torque = parseMetric(rowText(/Total.*Torque/i));
  const drive_type = rowText(/Drive/i) || null;

  return {
    acceleration_0_100,
    top_speed,
    power: {
      kw: power_kw,
      ps: power_ps
    },
    torque,
    drive_type
  };
}

// ---- V2X / Bidirectional Charging ----
function extractV2X() {
  const $v2x = $('#v2x');
  if (!$v2x.length) return null;

  // Simple "label → next <td>" helper
  function rowText(labelRegex) {
    const $labelTd = $v2x.find('td').filter(function () {
      return labelRegex.test($(this).text());
    }).first();

    if (!$labelTd.length) return null;

    const $valTd = $labelTd.next('td');
    return $valTd.length ? $valTd.text().trim() : null;
  }

  // For patterns like:
  //   row 1: "V2L Supported" | "Yes"
  //   row 2: "Max Output Power" | "3.7 kW"
  // → we want the "3.7 kW" from the row *below* the label row, second <td>
  function powerBelow(labelRegex) {
    const $labelTd = $v2x.find('td').filter(function () {
      return labelRegex.test($(this).text());
    }).first();

    if (!$labelTd.length) return null;

    const $nextRow = $labelTd.closest('tr').next('tr');
    if (!$nextRow.length) return null;

    const $valTd = $nextRow.find('td').eq(1);
    if (!$valTd.length) return null;

    const txt = $valTd.text().trim();
    return txt || null;
  }

  // ---- Vehicle to Load (V2L) ----
  const v2lSupportedRaw = rowText(/V2L.*Supported/i);
  const v2lPowerRaw     = powerBelow(/V2L.*Supported/i);

  const vehicle_to_load = {
    supported: normalizeTextValue(v2lSupportedRaw),
    max_output_power: parseMetric(v2lPowerRaw),
    exterior_outlets: normalizeTextValue(rowText(/Exterior.*Outlet/i)),
    interior_outlets: normalizeTextValue(rowText(/Interior.*Outlet/i))
  };

  // ---- Vehicle to Home (V2H) ----
  const v2hAcSupportedRaw = rowText(/V2H.*via.*AC.*Supported/i);
  const v2hAcPowerRaw     = powerBelow(/V2H.*via.*AC.*Supported/i);

  const v2hDcSupportedRaw = rowText(/V2H.*via.*DC.*Supported/i);
  const v2hDcPowerRaw     = powerBelow(/V2H.*via.*DC.*Supported/i);

  const vehicle_to_home = {
    ac_supported: normalizeTextValue(v2hAcSupportedRaw),
    ac_max_output_power: parseMetric(v2hAcPowerRaw),
    dc_supported: normalizeTextValue(v2hDcSupportedRaw),
    dc_max_output_power: parseMetric(v2hDcPowerRaw)
  };

  // ---- Vehicle to Grid (V2G) ----
  const v2gAcSupportedRaw = rowText(/V2G.*via.*AC.*Supported/i);
  const v2gAcPowerRaw     = powerBelow(/V2G.*via.*AC.*Supported/i);

  const v2gDcSupportedRaw = rowText(/V2G.*via.*DC.*Supported/i);
  const v2gDcPowerRaw     = powerBelow(/V2G.*via.*DC.*Supported/i);

  const vehicle_to_grid = {
    ac_supported: normalizeTextValue(v2gAcSupportedRaw),
    ac_max_output_power: parseMetric(v2gAcPowerRaw),
    dc_supported: normalizeTextValue(v2gDcSupportedRaw),
    dc_max_output_power: parseMetric(v2gDcPowerRaw)
  };

  return {
    vehicle_to_load,
    vehicle_to_home,
    vehicle_to_grid
  };
}

// ---- Energy Consumption ----
function extractEnergyConsumption() {
  const $eff = $('#efficiency');
  if (!$eff.length) return null;

  // Generic: for a list of label <td>s (same label in multiple groups),
  // get the metric from the row at given index.
  function metricFromList($labels, index) {
    if (!$labels.length || index >= $labels.length) return null;

    const $labelTd = $labels.eq(index);
    const $valTd = $labelTd.next('td');
    if (!$valTd.length) return null;

    return parseMetric($valTd.text());
  }

  // Collect label cells by type
  const $rangeTds      = $eff.find('td').filter(function () {
    return /Range/i.test($(this).text());
  });
  const $vehConsTds    = $eff.find('td').filter(function () {
    return /Vehicle.*Consumption/i.test($(this).text());
  });
  const $ratedConsTds  = $eff.find('td').filter(function () {
    return /Rated.*Consumption/i.test($(this).text());
  });
  const $co2Tds        = $eff.find('td').filter(function () {
    return /CO2.*Emissions/i.test($(this).text());
  });
  const $vehFuelEqTds  = $eff.find('td').filter(function () {
    return /Vehicle.*Fuel.*Equivalent/i.test($(this).text());
  });

  // --- EVDB real range block (first group, index 0) ---
  const evdb_real_range = {
    // "610 km"
    range:                   metricFromList($rangeTds, 0),
    // "178 Wh/km"
    vehicle_consumption:     metricFromList($vehConsTds, 0),
    // "0 g/km"
    co2_emissions:           metricFromList($co2Tds, 0),
    // "2.0 l/100km"
    vehicle_fuel_equivalent: metricFromList($vehFuelEqTds, 0)
  };

  // --- Optional WLTP TEL (second group, index 1) ---
  let wltp_ratings_tel = null;
  if ($rangeTds.length > 1) {
    wltp_ratings_tel = {
      range:                 metricFromList($rangeTds, 1),
      vehicle_consumption:   metricFromList($vehConsTds, 1),
      rated_consumption:     metricFromList($ratedConsTds, 0),
      co2_emissions:         metricFromList($co2Tds, 1)
    };
  }

  // --- Optional WLTP TEH (third group, index 2) ---
  let wltp_ratings_teh = null;
  if ($rangeTds.length > 2) {
    wltp_ratings_teh = {
      range:                 metricFromList($rangeTds, 2),
      vehicle_consumption:   metricFromList($vehConsTds, 2),
      co2_emissions:         metricFromList($co2Tds, 2)
    };
  }

  return {
    evdb_real_range,
    note: "TEL = Test Energy Low | TEH = Test Energy High. Rated = official figures as published by manufacturer. Rated consumption and fuel equivalency figures include charging losses. Vehicle = calculated battery energy consumption used by the vehicle for propulsion and on-board systems.",
    ...(wltp_ratings_tel ? { wltp_ratings_tel } : {}),
    ...(wltp_ratings_teh ? { wltp_ratings_teh } : {})
  };
}

// ---- Real Energy Consumption ----
function extractRealEnergyConsumption() {
  const $sec = $('#real-consumption');
  if (!$sec.length) return null;

  // Generic: metric from table row matching a label
  function metricFromRow(labelRegex) {
    const $labelTd = $sec.find('td').filter(function () {
      return labelRegex.test($(this).text());
    }).first();

    if (!$labelTd.length) return null;

    const $valTd = $labelTd.next('td');
    if (!$valTd.length) return null;

    return parseMetric($valTd.text());
  }

  const cold_weather = {
    // becomes { value: 186, unit: 'Wh/km' } etc.
    city:     metricFromRow(/City.*Cold.*Weather/i),
    highway:  metricFromRow(/Highway.*Cold.*Weather/i),
    combined: metricFromRow(/Combined.*Cold.*Weather/i)
  };

  const mild_weather = {
    city:     metricFromRow(/City.*Mild.*Weather/i),
    highway:  metricFromRow(/Highway.*Mild.*Weather/i),
    combined: metricFromRow(/Combined.*Mild.*Weather/i)
  };

  // Headline like "125 - 247 Wh/km" → from_whkm / to_whkm as metric objects
  const hText = $sec.find('h2').text().trim();
  let from = null;
  let to   = null;

  const hMatch = hText.match(/([\d.,]+)\s*[-–]\s*([\d.,]+)\s*([A-Za-z/]+)?/);
  if (hMatch) {
    const fromNum = hMatch[1];
    const toNum   = hMatch[2];
    const unit    = hMatch[3] || 'Wh/km';

    from = parseMetric(`${fromNum} ${unit}`);
    to   = parseMetric(`${toNum} ${unit}`);
  }

  return {
    cold_weather,
    mild_weather,
    from,
    to,
    note: "Indication of real-world energy use in several situations. Cold weather: 'worst-case' based on -10°C and use of heating. Mild weather: 'best-case' based on 23°C and no use of A/C. For 'Highway' figures a constant speed of 110 km/h is assumed. The energy use will depend on speed, style of driving, climate and route conditions."
  };
}

// ----- Dimensions & Weight -----
function extractDimensionsWeight() {
  const $dim = $("#dimensions");
  if (!$dim.length) return null;

  // Extract {value, unit} from a row
  function metricFromRow(labelRegex) {
    const $labelTd = $dim
      .find("td")
      .filter(function () {
        return labelRegex.test($(this).text());
      })
      .first();

    if (!$labelTd.length) return null;

    const $valTd = $labelTd.next("td");
    if (!$valTd.length) return null;

    const raw = $valTd.text().trim();
    if (!raw) return null;

    // Extract number and unit
    const m = raw.match(/^([\d.,]+)\s*([A-Za-z/]+)?/);
    if (!m) return null;

    const value = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(value)) return null;

    const unit = m[2] ? m[2].trim() : null;

    return { value, unit };
  }

  return {
    length:                    metricFromRow(/Length/i),
    width:                     metricFromRow(/Width(?!.*mirrors)/i),
    width_with_mirrors:        metricFromRow(/Width.*mirrors/i),
    height:                    metricFromRow(/Height/i),
    wheelbase:                 metricFromRow(/Wheelbase/i),
    weight_unladen_eu:         metricFromRow(/Weight.*Unladen/i),
    gross_vehicle_weight_gvwr: metricFromRow(/Gross.*Vehicle.*Weight/i),
    max_payload:               metricFromRow(/Max.*Payload/i),
    cargo_volume:              metricFromRow(/Cargo.*Volume(?!.*Max|.*Frunk)/i),
    cargo_volume_max:          metricFromRow(/Cargo.*Volume.*Max/i),
    cargo_volume_frunk:        metricFromRow(/Cargo.*Volume.*Frunk/i),
    roof_load:                 metricFromRow(/Roof.*Load/i),
    towing_weight_unbraked:    metricFromRow(/Towing.*Unbraked/i),
    towing_weight_braked:      metricFromRow(/Towing.*Braked/i),
    vertical_load_max:         metricFromRow(/Vertical.*Load/i),
    tow_hitch_possible: (function () {
      const $label = $dim
        .find("td")
        .filter(function () {
          return /Tow.*Hitch.*Possible/i.test($(this).text());
        })
        .first();
      if (!$label.length) return null;
      const txt = ($label.next("td").text() || "").trim();
      return normalizeTextValue(txt);
    })()
  };
}

// ----- Miscellaneous -----
function extractMisc() {
  // Use body as root — Bright Data environment allows this
  const $root = $('body');

  function rowText(labelRegex) {
    const $labelTd = $root
      .find("td")
      .filter(function () {
        return labelRegex.test($(this).text());
      })
      .first();

    if (!$labelTd.length) return null;

    const $valTd = $labelTd.next("td");
    return $valTd.length ? $valTd.text().trim() : null;
  }

  return {
    seats: (function () {
      const txt = rowText(/Seats/i);
      if (!txt) return null;
      const m = txt.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    })(),

    isofix: (function () {
      const txt = rowText(/Isofix/i);
      return txt ? txt.split(",")[0].trim() : null;
    })(),

    isofix_seats: (function () {
      const txt = rowText(/Isofix/i);
      if (!txt) return null;
      const m = txt.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    })(),

    // ✅ turning circle now parsed as metric {value, unit}
    turning_circle: (function () {
      const txt = rowText(/Turning.*Circle/i);
      return parseMetric(txt);   // e.g. "12.1 m" → { value: 12.1, unit: "m" }
    })(),

    platform: normalizeTextValue(rowText(/Platform/i)),
    ev_dedicated_platform: normalizeTextValue(rowText(/EV.*Dedicated.*Platform/i)),
    car_body: normalizeTextValue(rowText(/Car.*Body/i)),
    segment: rowText(/Segment/i) || null,
    segment_1l: (function () {
      const s = rowText(/Segment/i);
      return s ? s.split("-")[0].trim() : null;
    })(),
    roof_rails: normalizeTextValue(rowText(/Roof.*Rails/i)),
    heat_pump: normalizeTextValue(rowText(/Heat.*pump.*HP/i)),
    hp_std_equipment: normalizeTextValue(rowText(/HP.*Standard.*Equipment/i))
  };
}

// ----- Preceding model -----
function extractPrecedingModel() {
  // Try the old root first, then fall back to the whole document
  let $root = $("#detailed-data");
  if (!$root.length) {
    $root = $("body");
  }

  // Find the <h3> whose text is "Preceding model"
  let $heading = $root
    .find("h3")
    .filter(function () {
      return /Preceding model/i.test($(this).text());
    })
    .first();

  // If not found under #detailed-data, search globally as a fallback
  if (!$heading.length) {
    $heading = $("h3")
      .filter(function () {
        return /Preceding model/i.test($(this).text());
      })
      .first();
  }

  if (!$heading.length) return null;

  // The info box wrapper in the new markup
  const $box =
    $heading.closest(".info-box").length
      ? $heading.closest(".info-box")
      : $heading.parent();

  if (!$box.length) return null;

  // Description text:
  // in the new layout, the first <p> is the description
  // and the second <p.align-center> wraps the link & image
  const $descP = $box.find("p").not(".align-center").first();
  const description = ($descP.text() || "").trim() || null;

  // Link to the preceding model
  const $link = $box.find("a[href*='/car/']").first();

  let url = null;
  let evdb_id = null;
  let title = null;

  if ($link.length) {
    const href = $link.attr("href") || "";

    // Full absolute URL – relies on existing helper
    url = absUrl(href);

    // Extract numeric EVDB id from /car/1535/...
    const m = href.match(/\/car\/(\d+)/);
    if (m) {
      evdb_id = m[1];
    }

    // Build title from link text, minus the "Preceding model" prefix
    const $clone = $link.clone();
    $clone.find("img").remove(); // strip image to avoid alt text/noise
    const linkText = $clone.text().trim();
    title = linkText.replace(/^\s*Preceding model\s*/i, "").trim() || null;
  }

  // Thumbnail
  let thumb_url = null;
  const $img = $box.find("img").first();
  if ($img.length) {
    // Prefer srcset if available, otherwise src
    let src = $img.attr("srcset") || $img.attr("src") || "";

    if (src) {
      // If srcset, take the first candidate before any " 2x", etc.
      if (src.indexOf(",") !== -1 || src.indexOf(" ") !== -1) {
        const first = src.split(",")[0].trim();
        src = first.split(" ")[0];
      }

      thumb_url = absUrl(src);
    }
  }

  return {
    description, // raw text about range/accel/efficiency differences etc.
    url,
    evdb_id,
    title,
    thumb_url
  };
}

function extractHomeDestinationChargingDetails() {
  // Section wrapper
  const $section = $("#charge-table");
  if (!$section.length) return null;

  const heading =
    $section.find("h2").first().text().trim() || null; // "Home and Destination Charging (0 -> 100%)"

  const $infoBox = $section.find(".info-box").first();
  if (!$infoBox.length) {
    return {
      heading,
      intro_text: null,
      europe_heading: null,
      europe_text: null,
      type2_title: null,
      type2_image_url: null,
      footnote: null,
      type2_plug: []
    };
  }

  // --- Intro paragraphs & "Europe" text ---

  const $directParagraphs = $infoBox.children("p");
  const intro_text =
    ($directParagraphs.eq(0).text() || "").trim() || null;

  let europe_heading = null;
  let europe_text = null;

  const $europeH3 = $infoBox
    .find("h3")
    .filter(function () {
      return /Europe/i.test($(this).text());
    })
    .first();

  if ($europeH3.length) {
    europe_heading = $europeH3.text().trim() || null;
    const $pAfterEurope = $europeH3.nextAll("p").first();
    europe_text = ($pAfterEurope.text() || "").trim() || null;
  }

  // --- Type 2 header + image ---

  let type2_title = null;
  let type2_image_url = null;

  const $type2Block = $infoBox.find("table.charging-table-standard").first();
  if ($type2Block.length) {
    const $wrapperDiv = $type2Block.closest("div");
    const $titleTable = $wrapperDiv.find("table").first(); // the table with th+img

    const $th = $titleTable.find("th").first();
    if ($th.length) {
      type2_title = $th.text().trim() || null;
    }

    const $img = $titleTable.find("img").first();
    if ($img.length) {
      const imgSrc = $img.attr("src") || "";
      type2_image_url = imgSrc ? absUrl(imgSrc) : null;
    }
  }

  // --- Type 2 (Mennekes) charging table itself ---

  const type2_plug = [];
  const $standardTable = $infoBox.find("table.charging-table-standard").first();

  if ($standardTable.length) {
    // Header row
    const headers = [];
    const $headerRow = $standardTable.find("tr").first();
    $headerRow.find("th, td").each(function () {
      headers.push(($(this).text() || "").trim());
    });

    // Map header → column index
    const findCol = (patterns) => {
      const idx = headers.findIndex((hRaw) => {
        const h = hRaw.toLowerCase();
        return patterns.some((p) => p.test(h));
      });
      return idx >= 0 ? idx : null;
    };

    const idxChargingPoint = findCol([/charging\s*point/i]);
    const idxMaxPower = findCol([/max/i, /voltage/i, /power/i]);
    const idxPower = findCol([/^power$/i]);
    const idxTime = findCol([/^time$/i, /0\s*-\s*100/i, /duration/i]);
    const idxRate = findCol([/^rate$/i, /km\/h/i, /range/i]);

    // Data rows
    $standardTable.find("tr").slice(1).each(function () {
      const cells = [];
      $(this)
        .find("th, td")
        .each(function () {
          cells.push(($(this).text() || "").trim());
        });

      if (!cells.some((v) => v && v.length)) return;

      const chargingPointRaw =
        idxChargingPoint != null ? cells[idxChargingPoint] : "";
      const maxPowerRaw = idxMaxPower != null ? cells[idxMaxPower] : "";
      const powerRaw = idxPower != null ? cells[idxPower] : "";
      const timeRaw = idxTime != null ? cells[idxTime] : "";
      const rateRaw = idxRate != null ? cells[idxRate] : "";

      // Slug for charging point type (e.g. "Wall Plug (2.3 kW)" → "wall-plug")
      const type = chargingPointRaw
        ? chargingPointRaw
            .toLowerCase()
            .replace(/\s*\(.+\)\s*$/, "") // drop text in parentheses
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
        : null;

      const power = parseNumberAndUnit(powerRaw, "kW");
      const max_power = parseMaxPowerDescriptor(maxPowerRaw);
      const time = parseTimeToMinutes(timeRaw); // { unit: "min", value: ... }
      const rate = parseNumberAndUnit(rateRaw, "km/h");

      type2_plug.push({
        charging_point: {
          type,       // e.g. "wall-plug", "1-phase-16a", "3-phase-16a"
          power       // { unit: "kW", value: 2.3 }
        },
        max_power,    // { voltage: { unit, value }, current: { unit, value }, phases }
        power,        // duplicated at top level as per your requested structure
        time,         // { unit: "min", value: XXX }
        rate          // { unit: "km/h", value: XXX }
      });
    });
  }

  // Footnote under the table († = Limited by on-board charger...)
  const footnote =
    ($infoBox.find("p.f-12").first().text() || "").trim() || null;

  return {
    heading,
    intro_text,
    europe_heading,
    europe_text,
    type2_title,
    type2_image_url,
    footnote,
    type2_plug
  };
}

//
// ---------- Main parser ----------
//

return (() => {
  // Get car_url from input first — the correct source
  const inputUrl =
    (typeof input !== "undefined" &&
    Array.isArray(input) &&
    input[0] &&
    (input[0].car_url || input[0].url || null)) || null;

  // Safe fallbacks for environments without window/location
  const fallbackUrl =
    $("link[rel='canonical']").attr("href") ||
    $("meta[property='og:url']").attr("content") ||
    (typeof location !== "undefined" && location.href ? location.href : null);

  // Final URL used by the parser
  const car_url = inputUrl || fallbackUrl || null;

  const title = $("h1").first().text().trim() || null;

  // Breadcrumb
  let breadcrumb = null;
  const $crumbNav = $(
    "nav[aria-label='breadcrumb'], .breadcrumb-nav, ol.breadcrumb"
  );
  if ($crumbNav.length) {
    breadcrumb =
      $crumbNav
        .find("li.breadcrumb-item.active, li.active")
        .last()
        .text()
        .trim() || null;
  }
  if (!breadcrumb) {
    breadcrumb =
      $("li.breadcrumb-item.active").last().text().trim() || null;
  }

  // Images
  let images_urls = [];
  const $fotorama = $(".fotorama");

  if ($fotorama.length) {
    images_urls = $fotorama
      .find("img")
      .map((_, img) => {
        const $img = $(img);
        const srcset = $img.attr("srcset") || "";
        let urlStr = null;

        if (srcset) {
          const first = srcset.split(",")[0].trim();
          urlStr = first.split(" ")[0];
        }

        if (!urlStr) {
          urlStr = $img.attr("src") || "";
        }

        if (!urlStr) return null;

        urlStr = urlStr.replace(/-thumb(?=\.)/, "");
        return absUrl(urlStr);
      })
      .get()
      .filter(Boolean);

    images_urls = [...new Set(images_urls)];
  }

  // Pricing
  const $pricing = $("#pricing");
  let pricing_availability = null;

  if ($pricing.length) {
    function getPricingCell(regex, index) {
      const $link = $pricing
        .find("a[href]")
        .filter((_, el) => regex.test($(el).attr("href") || ""))
        .eq(index);

      if (!$link.length) return null;
      return $link.closest("td").next("td").text().trim() || null;
    }

    const pRaw = {
      uk: getPricingCell(/\/uk\/car\//i, 0),
      nl: getPricingCell(/\/nl\/auto\//i, 0),
      de: getPricingCell(/\/de\/pkw\//i, 0)
    };

    const aRaw = {
      uk: getPricingCell(/\/uk\/car\//i, 1),
      nl: getPricingCell(/\/nl\/auto\//i, 1),
      de: getPricingCell(/\/de\/pkw\//i, 1)
    };

    pricing_availability = {
      pricing: {
        uk: parsePrice(pRaw.uk),
        nl: parsePrice(pRaw.nl),
        de: parsePrice(pRaw.de)
      },
      availability: aRaw
    };
  }
  const meta = extractMetaInfo();
  const real_range = extractRealRange();
  const distance_suitability = extractDistanceSuitability();
  const battery_details = extractBattery();
  const charging = extractCharging();
  const performance = extractPerformance();
  const v2x_charging = extractV2X();
  const energy_consumption = extractEnergyConsumption();
  const real_energy_consumption = extractRealEnergyConsumption();
  const dimensions_weight = extractDimensionsWeight();
  const misc = extractMisc();
  const preceding_model = extractPrecedingModel();
  const home_destination_charging_details = extractHomeDestinationChargingDetails();

  // --- Build the core vehicle object (without metadata yet) ---
  const vehicle = {
    car_url,
    title,
    breadcrumb,
    images_urls,
    pricing_availability,
    real_range,
    distance_suitability,
    battery_details,
    charging,
    performance,
    v2x_charging,
    energy_consumption,
    real_energy_consumption,
    dimensions_weight,
    misc,
    preceding_model,
    home_destination_charging_details,
    ...(meta ? { meta } : {})
  };

  // --- Build metadata ---

  // Try to read scraper version from Bright Data input, fallback to null
  const scraper_version =
    (typeof input !== "undefined" &&
      Array.isArray(input) &&
      input[0] &&
      (input[0].scraper_version || input[0].version || null)) ||
    null;

  // ISO timestamp of when this page was parsed
  const parsed_at = new Date().toISOString();

  // Collect detected units
  const unitsSet = new Set();
  collectUnits(vehicle, unitsSet);
  const detected_units = Array.from(unitsSet).sort();

  vehicle.metadata = {
    parsed_at,        // e.g. "2025-12-07T14:32:10.123Z"
    scraper_version,  // e.g. "1.3.0" or null if not supplied
    detected_units    // e.g. ["A", "Wh/km", "g/km", "kW", "km", "km/h", "m", "min", "PS", "V"]
  };

  console.log("Parsed vehicle:", JSON.stringify(vehicle, null, 2));

 // For dev
 //return vehicle

 // For PROD
  return {
    vehicle: JSON.stringify(vehicle)
    };

})();
```
