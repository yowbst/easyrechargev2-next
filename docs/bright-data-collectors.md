# Bright Data Collectors — Source of Record

The EV Database scrape runs on two **custom** Bright Data collectors (Scraper Studio,
formerly "Data Collectors"). Their code lives in the Bright Data UI, not in any repo, so
this file is the version-controlled copy.

| Collector | Purpose | ID (verified live 2026-09-13) |
|---|---|---|
| EVDB \| List vehicles | Identity + summary specs, one request for the whole catalogue | `c_mt5fn06415t3hneeuk` |
| EVDB \| Get vehicle | Deep spec blocks, one input per `car_url` | `c_mt5fkkem28oxnkkme0` |

Both are **BROWSER** worker type. Each has an *interaction* script and a *parser* script.

The blocks below were cleaned up on 2026-09-13 and are the versions promoted to
production. They replace an earlier generation whose IDs (`c_mipqo2it4a63h5g0k`,
`c_misied485yd5jpx0u`) are dead.

## Why this file exists

The pipeline reads collector IDs from the environment
(`BRIGHTDATA_LIST_COLLECTOR` / `BRIGHTDATA_DETAILS_COLLECTOR`, see
`src/lib/vehicles/ingest/brightdata.ts`), so recreating the collectors under a different
Bright Data account needs **no code change** — only new IDs in `.env.local`.

## Verified live — read this before debugging anything

**If a trigger 404s, suspect a stale collector ID first.**
`{"error":"Collector not found"}` is returned for an outdated ID and for a completely
made-up one alike, so the error gives no hint which it is. The IDs move when scrapers are
recreated. Re-read them from the Bright Data scrapers dashboard.

**Ignore `can_make_requests: false` / `zone_not_found`.** The account reports zero active
scraping zones and collector triggers still succeed:

```bash
curl -s -H "Authorization: Bearer $BRIGHTDATA_API_TOKEN" https://api.brightdata.com/status
# → {"status":"active","customer":"hl_27b6d7ae","can_make_requests":false,
#    "auth_fail_reason":"zone_not_found", …}   ← collectors still work
```

That flag governs proxy zones, not Scraper Studio.

Note also that these are *not* valid ways to check a collector:
`GET /dca/dataset?id=<collector_id>` expects a *snapshot* id and 404s for a perfectly good
collector, and `GET /dca/get_collectors` does not exist at all. The only definitive check is
a real `POST /dca/trigger`, which starts a billable job.

## The site ignores every filter in the URL

Measured 2026-09-13 against the live LIST collector:

| Input | Rows returned |
|---|---|
| Filters wide open | 1437 |
| Filters at their UI defaults | 1438 |
| `battery: 50–55 kWh` | 1438 — batteries actually 14.5–141 kWh |
| `page_size: 10` | 1438 |

EV Database returns the whole catalogue whatever the hash says. The previous interaction
built a 12-parameter filter hash; it has been removed, because code that looks like it
filters and does not is worse than no code at all. **Filter downstream**, in the pipeline,
where it is testable.

## Snapshot wire format — the part that broke the first implementation

`GET /dca/dataset?id=<snapshot_id>` returns **newline-delimited JSON**, one object per line
— *not* a JSON array. A 1,438-vehicle LIST snapshot is 1,438 lines. Calling `res.json()` on
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

The LIST collector returned **1,438** vehicles, of which **656** were "Available to order".
Only available vehicles are ever ingested, so `scrape` filters to those *before* running
DETAILS — otherwise roughly 780 billable page scrapes are wasted on discontinued models
every refresh.

## Output contract the pipeline depends on

If you change either parser, these are the guarantees
`src/lib/vehicles/ingest/merge.ts` relies on. Breaking one breaks ingestion silently.

- **LIST** emits 22 fields per vehicle: `id` (base36 of `evdb_id`), `evdb_id` (number),
  `date {from,to}`, `year {from,to}`, `rank`, `thumb_url`, `car_url`, `title`, `make`,
  `model`, `availability`, the `{value, unit}` metrics `range`, `efficiency`, `weight`,
  `acceleration_0100`, `range_1stop`, `battery`, `fastcharge`, `towing_weight`,
  `cargo_cap`, `price_perrange`, plus `price {de,nl,uk}`.
- **DETAILS** emits 19 root fields: `car_url`, `title`, `breadcrumb`, `images_urls`,
  `pricing_availability`, `real_range`, `distance_suitability`, `battery_details`,
  `charging`, `performance`, `v2x_charging`, `energy_consumption`,
  `real_energy_consumption`, `dimensions_weight`, `misc`, `preceding_model`,
  `home_destination_charging_details`, `meta`, `metadata {parsed_at, …}`.
- **DETAILS carries no `evdb_id`, `make`, `model` or `year`.** The two records are joined
  on `car_url`. This is why `scrape` runs both collectors.
- **DETAILS returns its payload as a JSON string**: the parser's production return is
  `{ vehicle: JSON.stringify(vehicle) }`. `unwrapDetails` parses it. The commented-out
  `return vehicle` dev form is tolerated too.
- `battery_details.nominal_capacity` is **required** — it supplies the `kWh` component of
  the generated slug, i.e. of every public vehicle URL. A LIST row whose DETAILS record is
  missing gets dropped rather than produce a malformed URL.
- LIST `battery` is *useable* capacity while the slug uses *nominal* capacity from DETAILS.
  Different numbers; do not conflate them.

## What the 2026-09-13 cleanup changed, and how it was checked

Both parsers keep their output contract byte-identical. The changes are:

- **Unified number parsing.** Both collectors now use the same `parseNumberSmart`. The
  DETAILS parser previously used `parseFloat(x.replace(/,/g,""))` and `parseInt(...)`,
  which turn `73,4 kWh` into 734 and `€41.990` into 41. Differential test over the 22
  formats EV Database actually emits: **zero divergence**. The five divergences found were
  all on European formats, all in the safer direction.
- **Deduplicated table reading.** The DETAILS parser defined the same label→value lookup
  seven times; it is now one `makeRowReader` factory with 11 call sites.
- **Removed the per-page debug log.** The DETAILS parser used to `console.log` the entire
  vehicle, pretty-printed, on every page. At ~650 pages per refresh that is a lot of log
  for no benefit. One line now.
- **Escaped the make in a regex.** `cleanTitle` interpolated the make into a `RegExp`
  unescaped. For a real manufacturer like **e.GO**, the unescaped `.` matched any
  character and could strip text from a title.
- **Deleted the inert filter machinery** from the LIST interaction (see the table above).

Verification performed, beyond a syntax check:

- The new DETAILS parser was run locally against the real HTML of
  `ev-database.org/car/3403` with cheerio and diffed against the production output of the
  old parser for the same page: **19/19 root fields, identical keys, zero differences**
  attributable to the refactor. The only two deltas (`title`, `preceding_model.title`)
  were a `\n` vs space introduced by the browser DOM, not by the code — the extraction
  expression is identical in both versions. `images_urls` was excluded because the gallery
  is JS-rendered and does not exist in a plain fetch.
- The new LIST parser output was compared field-by-field against a 1,438-row reference
  snapshot: **zero discrepancies across all 21 comparable fields, for every vehicle**.

One thing deliberately *not* unified: `extractDimensionsWeight` keeps its own metric
function. Its unit regex captures only the leading token (`[A-Za-z/]+`), so
`"1,823 kg (EU)"` yields `kg`, not `kg (EU)`. Folding it into `row.metric()` would have
changed the contract.

---

## 1. EVDB | List vehicles

### Interaction

```javascript
// EVDB | List vehicles — INTERACTION
// Worker type: BROWSER
//
// Loads the EV Database catalogue once and hands the DOM to the parser.
//
// WHY THERE ARE NO FILTERS HERE ANY MORE
// The previous version built a 12-parameter filter hash (rs-pr, rs-er, rs-ub, …).
// Measured against the live site on 2026-09-13, every one of them is ignored:
//   filters wide open ..... 1437 rows
//   filters at defaults ... 1438 rows
//   battery 50-55 kWh ..... 1438 rows, batteries actually 14.5-141 kWh
//   page_size 10 .......... 1438 rows
// The site returns the whole catalogue whatever we ask for. Keeping that code
// was worse than useless: it looked like filtering was happening. Filter
// downstream instead, where it can be verified.

const BASE = "https://ev-database.org/";

// The one input that does anything. Caps how many vehicles are collected, and
// is applied to the PARSED rows because the URL demonstrably cannot limit them.
// Useful for a cheap smoke test; omit it to collect everything.
const cfg = (Array.isArray(input) ? input[0] : input) || {};
const requested = Number(cfg.limit);
const limit = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : null;

// Hash kept minimal. These three are how the page has always been requested and
// cost nothing to keep; they are NOT known to be load-bearing, unlike the
// rs-* filters above which are known NOT to be.
navigate(BASE + "#group=vehicle-group&s=1&p=0-2000");

try {
  wait(".list-item");
} catch (e) {
  console.log("No .list-item found on the page — collecting nothing.");
  collect([]);
  return;
}

const cars = parse() || [];
const out = limit ? cars.slice(0, limit) : cars;

console.log(
  limit
    ? "Parsed " + cars.length + " vehicles, collecting " + out.length + " (limit)"
    : "Parsed " + cars.length + " vehicles"
);

collect(out);
```

### Parser

```javascript
// EVDB | List vehicles — PARSER
//
// Returns one object per vehicle. The returned shape is a CONTRACT consumed by
// src/lib/vehicles/ingest/merge.ts and fieldmap.ts — do not rename, reorder or
// drop fields without changing those first. DETAILS carries no evdb_id / make /
// model / year, so this collector is the only source of vehicle identity.

const BASE = "https://ev-database.org";

// EV-DB writes this timestamp to mean "no end date".
const NO_END_DATE_TS = 946684800;

// Spec cells: output field -> CSS class on the list item.
const SPEC_SELECTORS = {
  range: ".erange_real",
  efficiency: ".efficiency",
  weight: ".weight_p",
  acceleration_0100: ".acceleration_p",
  range_1stop: ".long_distance_total",
  battery: ".battery_p",
  fastcharge: ".fastcharge_speed_print",
  towing_weight: ".towweight_p",
  cargo_cap: ".cargo",
};

// Price cells: output field -> CSS class.
const PRICE_SELECTORS = { de: ".country_de", nl: ".country_nl", uk: ".country_uk" };

// ---------- generic helpers ----------

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toInt(raw) {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

/** Short, stable id derived from evdb_id, base36. Stored as `short_id`. */
function makeVehicleId(raw) {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? raw || null : n.toString(36);
}

/** Unix seconds -> Date, or null (also for the no-end-date sentinel). */
function tsToDate(raw) {
  const ts = parseInt(raw, 10);
  if (Number.isNaN(ts) || ts === NO_END_DATE_TS) return null;
  return new Date(ts * 1000);
}

/**
 * Locale-aware number parser. EV-DB mixes European and UK formatting, and
 * getting this wrong silently corrupts specs — "1.979" kg must not become
 * 1.979, and "73,4" kWh must not become 734.
 *
 *   "1.979"   -> 1979     dot as thousands separator
 *   "73,4"    -> 73.4     comma as decimal
 *   "1.234,5" -> 1234.5   EU mixed
 *   "1,234.5" -> 1234.5   UK/US mixed
 */
function parseNumberSmart(str) {
  if (!str) return NaN;
  const s = String(str).trim();

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  // Both present: whichever comes last is the decimal separator.
  if (hasDot && hasComma) {
    return s.lastIndexOf(",") > s.lastIndexOf(".")
      ? parseFloat(s.replace(/\./g, "").replace(",", "."))
      : parseFloat(s.replace(/,/g, ""));
  }

  // Exactly three trailing digits after a lone separator reads as thousands.
  if (hasComma) return parseFloat(/,\d{3}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", "."));
  if (hasDot) return parseFloat(/\.\d{3}$/.test(s) ? s.replace(/\./g, "") : s);

  return parseFloat(s);
}

/** "245 km" -> { value: 245, unit: "km" }. Null when absent or unparseable. */
function parseMetric(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return null;
  const value = parseNumberSmart(m[1]);
  if (Number.isNaN(value)) return null;
  return { value, unit: m[2].trim() || null };
}

/** "€31,690" -> { currency: "€", value: 31690 }. Prices are whole units. */
function parsePrice(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^([^0-9]+)\s*([\d.,]+)/);
  if (!m) return null;
  const value = parseNumberSmart(m[2]);
  if (Number.isNaN(value)) return null;
  return { currency: m[1].trim(), value: Math.round(value) };
}

/** "€102 /km" -> { value: 102, unit: "€/km" }. */
function parsePricePerRange(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^([^0-9]*)([\d.,]+)\s*\/\s*([A-Za-z]+)$/);
  if (!m) return null;
  const value = parseNumberSmart(m[2]);
  if (Number.isNaN(value)) return null;
  const currency = m[1].trim();
  return { value, unit: (currency ? currency : "") + "/" + m[3].trim() };
}

/** Absolute URL from a possibly relative href, or "" when there is none. */
function absUrl(href) {
  if (!href) return "";
  try {
    return new URL(href, BASE).href;
  } catch (e) {
    return "";
  }
}

/** Highest-resolution candidate in a srcset (the last entry). */
function bestFromSrcset(srcset) {
  const parts = String(srcset || "")
    .split(",")
    .map(function (x) { return x.trim(); })
    .filter(Boolean);
  if (!parts.length) return "";
  return parts[parts.length - 1].split(" ")[0];
}

/** Strips the make prefix and collapses the duplicated segments EV-DB emits. */
function cleanTitle(make, rawTitle) {
  if (!rawTitle) return rawTitle;
  let title = String(rawTitle).trim();

  // The make is interpolated into a regex, so it must be escaped — several
  // real makes contain regex metacharacters.
  if (make) {
    title = title.replace(new RegExp("^" + escapeRegExp(make) + "\\s+", "i"), "");
  }

  // Drop consecutive repeated words.
  const dedup = [];
  title.split(/\s+/).forEach(function (word) {
    if (dedup[dedup.length - 1] !== word) dedup.push(word);
  });
  title = dedup.join(" ");

  // Collapse a string that is exactly itself twice.
  const half = Math.floor(title.length / 2);
  const firstHalf = title.substring(0, half).trim();
  if (firstHalf && firstHalf === title.substring(half).trim()) title = firstHalf;

  return title.trim();
}

// ---------- row extraction ----------

return $(".list-item").toArray().map(function (el) {
  const $car = $(el);
  const $hidden = $car.find("div.hidden").first();
  const hiddenText = function (cls) { return $hidden.find(cls).text().trim(); };

  const evdb_id_raw = hiddenText(".id.hidden");

  // EV-DB uses year_to === 2000 as a "still on sale" sentinel, distinct from
  // the date_to sentinel above.
  const year_to_raw = toInt(hiddenText(".year_to.hidden"));

  const $titleWrap = $car.find(".title-wrap");
  const make = $titleWrap.find("span").first().text().trim();

  const specs = {};
  Object.keys(SPEC_SELECTORS).forEach(function (key) {
    specs[key] = parseMetric($car.find(SPEC_SELECTORS[key]).text());
  });

  const price = {};
  Object.keys(PRICE_SELECTORS).forEach(function (key) {
    price[key] = parsePrice($car.find(PRICE_SELECTORS[key]).text());
  });

  return {
    id: makeVehicleId(evdb_id_raw),
    evdb_id: toInt(evdb_id_raw),
    date: {
      from: tsToDate(hiddenText(".date_from.hidden")),
      to: tsToDate(hiddenText(".date_to.hidden")),
    },
    year: {
      from: toInt(hiddenText(".year_from.hidden")),
      to: year_to_raw === 2000 ? null : year_to_raw,
    },
    rank: toInt(hiddenText(".rank.hidden")),
    thumb_url: absUrl(bestFromSrcset($car.find("img").attr("srcset"))),
    car_url: absUrl($titleWrap.find("a").attr("href")),
    title: cleanTitle(make, $titleWrap.find("a.title").text().trim()),
    make: make,
    model: $titleWrap.find(".model").text().trim(),
    availability: $titleWrap.find(".availability").text().trim(),

    range: specs.range,                         // { 360, "km" }
    efficiency: specs.efficiency,               // { 171, "Wh/km" }
    weight: specs.weight,                       // { 1979, "kg" } not 1.979
    acceleration_0100: specs.acceleration_0100, // { 7.9, "sec" }
    range_1stop: specs.range_1stop,             // { 405, "km" }
    battery: specs.battery,                     // { 73.4, "kWh" } not 734
    fastcharge: specs.fastcharge,               // { 115, "kW" }
    towing_weight: specs.towing_weight,         // { 1500, "kg" } not 1.5
    cargo_cap: specs.cargo_cap,                 // { 363, "L" }
    price_perrange: parsePricePerRange($car.find(".priceperrange_p").text()),

    price: price,                               // { de, nl, uk } each { currency, value } or null
  };
});
```

---

## 2. EVDB | Get vehicle

Input per record: `{{ car_url: "https://ev-database.org/car/…" }}`. The pipeline chunks
these 100 at a time (`CHUNK` in `scripts/vehicles-ingest.ts`).

### Interaction

```javascript
// EVDB | Get vehicle — INTERACTION
// Worker type: BROWSER
//
// Navigates to one vehicle page and hands the DOM to the parser.
// Input: { car_url } (also accepts `url` or a bare `path`).

const BASE = "https://ev-database.org";

const cfg = (Array.isArray(input) ? input[0] : input) || {};

let url = cfg.car_url || cfg.url || cfg.path;

if (!url) {
  console.log("No URL in input — expected { car_url: '…' }. Collecting nothing.");
  collect([]);
  return;
}

// Accept a relative path as well as an absolute URL.
if (!/^https?:\/\//i.test(url)) {
  url = BASE + "/" + String(url).replace(/^\//, "");
}

console.log("Navigating to " + url);
navigate(url);

try {
  // Required: the page skeleton. Any one of these means the page is usable.
  wait_any(["#range", "#battery", "#efficiency", "#pricing", "h1"], { timeout: 45000 });
} catch (e) {
  console.log("Timed out waiting for the vehicle page structure: " + (e && e.message));
  collect([]);
  return;
}

// Best effort only: give the gallery a moment so images_urls is well populated.
// Never blocks — a vehicle with few images is still worth collecting.
try {
  wait(function () {
    return document.querySelectorAll(".fotorama img").length >= 3;
  }, { timeout: 15000 });
} catch (e) {
  console.log("Fewer than 3 gallery images after 15s — continuing anyway.");
}

const vehicle = parse();

if (!vehicle) {
  console.log("Parser returned nothing for " + url);
  collect([]);
  return;
}

collect([vehicle]);
```

### Parser

```javascript
// EVDB | Get vehicle — PARSER
// Runs in the Bright Data browser context with a jQuery-like `$`.
//
// Returns ONE vehicle object, wrapped as { vehicle: "<json>" } for production.
// The shape is a CONTRACT consumed by src/lib/vehicles/ingest/merge.ts —
// `battery_details.nominal_capacity` in particular supplies the kWh component
// of every generated slug, i.e. every public vehicle URL. Do not rename or
// drop fields without changing the pipeline first.
//
// This collector carries NO evdb_id / make / model / year. Those come from the
// LIST collector and are joined on car_url downstream.

const BASE = "https://ev-database.org";

// ---------- number parsing ----------
//
// Shared with the LIST collector on purpose. EV-DB currently renders
// UK-style numbers ("£37,990", "6.2 sec") which a naive
// parseFloat(x.replace(/,/g,"")) also handles — but that naive form turns
// "73,4 kWh" into 734 and "€41.990" into 41. Verified 2026-09-13: identical
// results on all 22 formats the site actually emits, and correct on the
// European forms where the naive version silently corrupts by 10x or 1000x.

function parseNumberSmart(str) {
  if (!str) return NaN;
  const s = String(str).trim();

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  // Both present: whichever comes last is the decimal separator.
  if (hasDot && hasComma) {
    return s.lastIndexOf(",") > s.lastIndexOf(".")
      ? parseFloat(s.replace(/\./g, "").replace(",", "."))
      : parseFloat(s.replace(/,/g, ""));
  }

  // Exactly three trailing digits after a lone separator reads as thousands.
  if (hasComma) return parseFloat(/,\d{3}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", "."));
  if (hasDot) return parseFloat(/\.\d{3}$/.test(s) ? s.replace(/\./g, "") : s);

  return parseFloat(s);
}

/** "245 km" -> { value: 245, unit: "km" } */
function parseMetric(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return null;
  const value = parseNumberSmart(m[1]);
  if (Number.isNaN(value)) return null;
  return { value, unit: m[2].trim() || null };
}

/** "£37,990" -> { currency: "£", value: 37990 } */
function parsePrice(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^([^0-9]+)\s*([\d.,]+)/);
  if (!m) return null;
  const value = parseNumberSmart(m[2]);
  if (Number.isNaN(value)) return null;
  return { currency: m[1].trim(), value: Math.round(value) };
}

/** "€102 /km" -> { value: 102, unit: "€/km" } */
function parsePricePerRange(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^([^0-9]*)([\d.,]+)\s*\/\s*([A-Za-z]+)$/);
  if (!m) return null;
  const value = parseNumberSmart(m[2]);
  if (Number.isNaN(value)) return null;
  const currency = m[1].trim();
  return { value, unit: (currency ? currency : "") + "/" + m[3].trim() };
}

/** "1h 30m", "1:30", "90 min" -> minutes as a bare Number. */
function timeToMinutes(raw) {
  if (!raw) return null;
  const text = String(raw).trim();

  let total = 0;
  const h = text.match(/(\d+)\s*h(?:ours?)?/i);
  if (h) total += parseInt(h[1], 10) * 60;
  const mm = text.match(/(\d+)\s*m(?:in(?:utes)?)?/i);
  if (mm) total += parseInt(mm[1], 10);
  if (total > 0) return total;

  const colon = text.match(/(\d+):(\d+)/);
  if (colon) {
    const hh = parseInt(colon[1], 10);
    const mi = parseInt(colon[2], 10);
    if (!Number.isNaN(hh) && !Number.isNaN(mi)) return hh * 60 + mi;
  }

  const bare = text.match(/(\d+(?:\.\d+)?)/);
  if (bare) {
    const v = parseFloat(bare[1]);
    if (!Number.isNaN(v)) return Math.round(v);
  }
  return null;
}

/** Same idea, but returns { unit: "min", value } and assumes hours as a last resort. */
function parseTimeToMinutes(raw) {
  if (!raw) return { unit: "min", value: null };
  const txt = String(raw).toLowerCase().trim();

  const colon = txt.match(/(\d+)\s*[:h]\s*(\d{1,2})?/);
  if (colon) {
    const h = parseInt(colon[1], 10) || 0;
    const m = parseInt(colon[2] || "0", 10) || 0;
    return { unit: "min", value: h * 60 + m };
  }

  const hMatch = txt.match(/(\d+(?:[.,]\d+)?)\s*h/);
  const mMatch = txt.match(/(\d+(?:[.,]\d+)?)\s*m/);
  let total = 0;
  let found = false;

  if (hMatch) {
    const h = parseFloat(hMatch[1].replace(",", "."));
    if (Number.isFinite(h)) { total += h * 60; found = true; }
  }
  if (mMatch) {
    const m = parseFloat(mMatch[1].replace(",", "."));
    if (Number.isFinite(m)) { total += m; found = true; }
  }
  if (found) return { unit: "min", value: total };

  const plain = parseFloat(txt.replace(",", "."));
  return { unit: "min", value: Number.isFinite(plain) ? plain * 60 : null };
}

/** Label "Charge Time (0->440 km)" + value "9h45m" -> minutes plus the range. */
function parseChargeTimeWithRange(labelRaw, valueRaw) {
  if (!labelRaw || !valueRaw) return null;
  const value = timeToMinutes(valueRaw);
  if (value == null) return null;

  const m = String(labelRaw).trim().match(/(\d+)\s*->\s*(\d+)\s*([A-Za-z]+)/);
  if (!m) return { value, unit: "min", range: null };

  const unit = m[3] || "km";
  return {
    value,
    unit: "min",
    range: {
      from: { value: parseInt(m[1], 10), unit },
      to: { value: parseInt(m[2], 10), unit },
    },
  };
}

/** "11 kW" -> { unit: "kW", value: 11 }. Always returns an object. */
function parseNumberAndUnit(raw, fallbackUnit) {
  const fallback = fallbackUnit || null;
  if (!raw) return { unit: fallback, value: null };

  const m = String(raw).trim().match(/([\d.,]+)\s*([a-zA-Z/°%]+)?/);
  if (!m) return { unit: fallback, value: null };

  const num = parseFloat(m[1].replace(",", "."));
  return {
    unit: m[2] || fallback,
    value: Number.isFinite(num) ? num : null,
  };
}

/** "230 V / 16 A / 1 phase" or "400V / 3x16A" -> voltage, current, phases. */
function parseMaxPowerDescriptor(raw) {
  const out = {
    voltage: { unit: "V", value: null },
    current: { unit: "A", value: null },
    phases: null,
  };
  if (!raw) return out;

  const txt = String(raw);

  const v = txt.match(/(\d+(?:[.,]\d+)?)\s*V/i);
  if (v) {
    const n = parseFloat(v[1].replace(",", "."));
    if (Number.isFinite(n)) out.voltage = { unit: "V", value: n };
  }

  const a = txt.match(/(\d+(?:[.,]\d+)?)\s*A/i);
  if (a) {
    const n = parseFloat(a[1].replace(",", "."));
    if (Number.isFinite(n)) out.current = { unit: "A", value: n };
  }

  // "1 phase" / "3 phases" first, then infer from "3x16A".
  const p = txt.match(/(\d+)\s*(phase|phases|φ)/i) || txt.match(/(\d+)\s*x\s*\d+\s*A/i);
  if (p) {
    const n = parseInt(p[1], 10);
    if (Number.isInteger(n)) out.phases = n;
  }

  return out;
}

/** "Yes"/"No"/"No Data"/"-" -> boolean / null. Anything else passes through. */
function normalizeTextValue(raw) {
  if (raw == null) return null;
  const txt = String(raw).trim();
  if (!txt) return null;

  const lower = txt.toLowerCase();
  if (lower === "yes") return true;
  if (lower === "no" || lower === "not available") return false;
  if (lower === "no data" || txt === "-") return null;

  return txt;
}

function absUrl(path) {
  if (!path) return null;
  try {
    return new URL(path, BASE).href;
  } catch (e) {
    return path;
  }
}

/** Collects every `unit` string from nested { unit, value } objects. */
function collectUnits(obj, set) {
  if (!obj || typeof obj !== "object") return;
  if (
    Object.prototype.hasOwnProperty.call(obj, "unit") &&
    Object.prototype.hasOwnProperty.call(obj, "value") &&
    typeof obj.unit === "string" &&
    obj.unit
  ) {
    set.add(obj.unit.trim());
  }
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    if (obj[key] && typeof obj[key] === "object") collectUnits(obj[key], set);
  }
}

// ---------- table reading ----------
//
// Every section on the page is a two-column table: a label cell and the value
// cell next to it. This factory replaced seven near-identical copies of the
// same lookup. Some labels repeat across sub-sections (there are two
// "Charge Time" rows, home then fast), hence the optional index.

function makeRowReader($scope) {
  function labels(re) {
    return $scope.find("td").filter(function () {
      return re.test($(this).text());
    });
  }

  function cell(re, index) {
    const $l = labels(re);
    if (!$l.length) return null;
    const $label = typeof index === "number" ? $l.eq(index) : $l.first();
    if (!$label.length) return null;
    const $value = $label.next("td");
    return { $label: $label, $value: $value.length ? $value : null };
  }

  return {
    labels: labels,

    /** Trimmed text of the value cell, or null. */
    text: function (re, index) {
      const c = cell(re, index);
      if (!c || !c.$value) return null;
      return c.$value.text().trim();
    },

    /** { label, value } — needed where the label carries data, e.g. "(0->440 km)". */
    pair: function (re, index) {
      const c = cell(re, index);
      if (!c) return null;
      return {
        label: c.$label.text().trim(),
        value: c.$value ? c.$value.text().trim() : null,
      };
    },

    /** Value cell parsed as { value, unit }. */
    metric: function (re, index) {
      const c = cell(re, index);
      if (!c || !c.$value) return null;
      return parseMetric(c.$value.text());
    },
  };
}

// ---------- section extractors ----------

function extractMetaInfo() {
  const attr = function (sel) { return $(sel).attr("content") || null; };

  const ogImage = attr('meta[property="og:image"]');
  const ogUrl = attr('meta[property="og:url"]');
  const twImage =
    $('meta[name="twitter:image"], meta[name="twitter:image:src"]').attr("content") || null;

  const meta = {
    description: attr('meta[name="description"]'),
    og_title: attr('meta[property="og:title"]'),
    og_description: attr('meta[property="og:description"]'),
    og_image: ogImage ? absUrl(ogImage) : null,
    og_url: ogUrl ? absUrl(ogUrl) : null,
    og_type: attr('meta[property="og:type"]'),
    og_site_name: attr('meta[property="og:site_name"]'),
    twitter_card: attr('meta[name="twitter:card"]'),
    twitter_title: attr('meta[name="twitter:title"]'),
    twitter_description: attr('meta[name="twitter:description"]'),
    twitter_image: twImage ? absUrl(twImage) : null,
  };

  const hasAny = Object.keys(meta).some(function (k) {
    return meta[k] != null && meta[k] !== "";
  });
  return hasAny ? meta : null;
}

function extractRealRange() {
  const $range = $("#range");
  if (!$range.length) return null;
  const row = makeRowReader($range);

  let headline = null;
  const h = $range.find("h2").text().trim().match(/([\d.,]+)\s*[-–]\s*([\d.,]+)\s*([A-Za-z/]+)?/);
  if (h) {
    const unit = h[3] || "km";
    headline = { from: parseMetric(h[1] + " " + unit), to: parseMetric(h[2] + " " + unit) };
  }

  return {
    headline: headline,
    cold_weather: {
      city: row.metric(/City.*Cold.*Weather/i),
      highway: row.metric(/Highway.*Cold.*Weather/i),
      combined: row.metric(/Combined.*Cold.*Weather/i),
    },
    mild_weather: {
      city: row.metric(/City.*Mild.*Weather/i),
      highway: row.metric(/Highway.*Mild.*Weather/i),
      combined: row.metric(/Combined.*Mild.*Weather/i),
    },
    note: "Indication of real-world range in several situations. Cold weather: 'worst-case' based on -10°C and use of heating. Mild weather: 'best-case' based on 23°C and no use of A/C. For 'Highway' figures a constant speed of 110 km/h is assumed. The actual range will depend on speed, style of driving, weather and route conditions.",
  };
}

function extractDistanceSuitability() {
  const $ld = $("#longdistance");
  if (!$ld.length) return null;
  const row = makeRowReader($ld);

  // "Charging Stop" appears twice: once as a distance, once as a duration.
  function distance(re, index) {
    const txt = row.text(re, index);
    if (txt == null) return null;
    const m = txt.match(/[\d.,]+/);
    if (!m) return null;
    const n = parseNumberSmart(m[0]);
    return Number.isNaN(n) ? null : { value: n, unit: "km" };
  }

  function duration(re, index) {
    const txt = row.text(re, index);
    if (txt == null) return null;
    const mins = timeToMinutes(txt);
    return typeof mins === "number" ? { value: mins, unit: "min" } : null;
  }

  return {
    distance: {
      first_leg: distance(/First.*Leg.*Distance/i),
      charging_stop: distance(/Charging.*Stop/i, 0),
      second_leg: distance(/Second.*Leg.*Distance/i),
      total: distance(/Total.*Distance/i),
    },
    duration: {
      first_leg: duration(/First.*Leg.*Duration/i),
      charging_stop: duration(/Charging.*Stop/i, 1),
      second_leg: duration(/Second.*Leg.*Duration/i),
      total: duration(/Total.*Duration/i),
    },
    rating: $ld.find(".rating-display").text().trim().replace(/\s+/g, "") || null,
    note: "The 'long distance suitability' is a 5-star rating that indicates how suitable a vehicle is for long trips. The rating is based on the 1-Stop Range: the total distance a vehicle can cover with one charging stop of 15 minutes.",
  };
}

function extractBattery() {
  const $batt = $("#battery");
  if (!$batt.length) return null;
  const row = makeRowReader($batt);

  let nb_of_cells = null;
  const nbTxt = row.text(/Number.*of.*Cells/i);
  if (nbTxt) {
    const m = nbTxt.match(/\d+/);
    if (m) nb_of_cells = parseInt(m[0], 10);
  }

  return {
    nominal_capacity: row.metric(/Nominal.*Capacity/i),
    useable_capacity: row.metric(/Useable.*Capacity/i),
    type: normalizeTextValue(row.text(/Battery.*Type/i)),
    cathode_material: normalizeTextValue(row.text(/Cathode.*Material/i)),
    nb_of_cells: nb_of_cells,
    pack_configuration: normalizeTextValue(row.text(/Pack.*Configuration/i)),
    architecture: row.metric(/Architecture/i),
    nominal_voltage: row.metric(/Nominal.*Voltage/i),
    warranty_period: row.metric(/Warranty.*Period/i),
    form_factor: normalizeTextValue(row.text(/Form.*Factor/i)),
    warranty_mileage: row.metric(/Warranty.*Mileage/i),
    name_ref: normalizeTextValue(row.text(/Name.*Reference/i)),
  };
}

function extractCharging() {
  const $ch = $("#charging");
  if (!$ch.length) return null;
  const row = makeRowReader($ch);

  // Index 0 is home/destination, index 1 is fast charging.
  const homeCt = row.pair(/Charge\s*Time/i, 0);
  const fastCt = row.pair(/Charge\s*Time/i, 1);

  return {
    home_destination: {
      charge_port: normalizeTextValue(row.text(/Charge\s*Port/i, 0)),
      charge_time: homeCt ? parseChargeTimeWithRange(homeCt.label, homeCt.value) : null,
      port_location: normalizeTextValue(row.text(/Port\s*Location/i, 0)),
      charge_speed: row.metric(/Charge\s*Speed/i, 0),
      charge_power: row.metric(/Charge\s*Power/i, 0),
    },
    fast_charging: {
      charge_port: normalizeTextValue(row.text(/Charge\s*Port/i, 1)),
      charge_time: fastCt ? parseChargeTimeWithRange(fastCt.label, fastCt.value) : null,
      port_location: normalizeTextValue(row.text(/Port\s*Location/i, 1)),
      charge_speed: row.metric(/Charge\s*Speed/i, 1),
      charge_power_max: row.metric(/Charge\s*Power/i, 1),
      charge_power_10_80: row.metric(/Charge\s*Power/i, 2),
      autocharge_supported: normalizeTextValue(row.text(/Autocharge\s*Supported/i)),
    },
    plug_charge: {
      plug_charge_supported: normalizeTextValue(row.text(/Plug.*Charge.*Supported/i)),
      supported_protocol: normalizeTextValue(row.text(/Supported.*Protocol/i)),
    },
    battery_preconditioning: {
      precond_possible: normalizeTextValue(row.text(/Precon.*Possible/i)),
      auto_using_navigation: normalizeTextValue(row.text(/Auto.*using.*Navig/i)),
    },
  };
}

function extractPerformance() {
  const $perf = $("#performance");
  if (!$perf.length) return null;
  const row = makeRowReader($perf);

  // "Total Power" holds both units in one cell: "225 kW (306 PS)".
  const powerRaw = row.text(/Total.*Power/i);
  let power_kw = null;
  let power_ps = null;

  if (powerRaw) {
    const kw = powerRaw.match(/([\d.,]+)\s*kW/i);
    if (kw) {
      const v = parseNumberSmart(kw[1]);
      if (!Number.isNaN(v)) power_kw = { value: v, unit: "kW" };
    }
    const ps = powerRaw.match(/([\d.,]+)\s*PS/i);
    if (ps) {
      const v = parseNumberSmart(ps[1]);
      if (!Number.isNaN(v)) power_ps = { value: v, unit: "PS" };
    }
  }

  return {
    acceleration_0_100: row.metric(/Acceleration.*100/i),
    top_speed: row.metric(/Top.*Speed/i),
    power: { kw: power_kw, ps: power_ps },
    torque: row.metric(/Total.*Torque/i),
    drive_type: row.text(/Drive/i) || null,
  };
}

function extractV2X() {
  const $v2x = $("#v2x");
  if (!$v2x.length) return null;
  const row = makeRowReader($v2x);

  // The max output power sits on the row BELOW its "… Supported" label,
  // in the second cell — not in the cell next to the label.
  function powerBelow(re) {
    const $l = row.labels(re).first();
    if (!$l.length) return null;
    const $next = $l.closest("tr").next("tr");
    if (!$next.length) return null;
    const $cell = $next.find("td").eq(1);
    if (!$cell.length) return null;
    return $cell.text().trim() || null;
  }

  return {
    vehicle_to_load: {
      supported: normalizeTextValue(row.text(/V2L.*Supported/i)),
      max_output_power: parseMetric(powerBelow(/V2L.*Supported/i)),
      exterior_outlets: normalizeTextValue(row.text(/Exterior.*Outlet/i)),
      interior_outlets: normalizeTextValue(row.text(/Interior.*Outlet/i)),
    },
    vehicle_to_home: {
      ac_supported: normalizeTextValue(row.text(/V2H.*via.*AC.*Supported/i)),
      ac_max_output_power: parseMetric(powerBelow(/V2H.*via.*AC.*Supported/i)),
      dc_supported: normalizeTextValue(row.text(/V2H.*via.*DC.*Supported/i)),
      dc_max_output_power: parseMetric(powerBelow(/V2H.*via.*DC.*Supported/i)),
    },
    vehicle_to_grid: {
      ac_supported: normalizeTextValue(row.text(/V2G.*via.*AC.*Supported/i)),
      ac_max_output_power: parseMetric(powerBelow(/V2G.*via.*AC.*Supported/i)),
      dc_supported: normalizeTextValue(row.text(/V2G.*via.*DC.*Supported/i)),
      dc_max_output_power: parseMetric(powerBelow(/V2G.*via.*DC.*Supported/i)),
    },
  };
}

function extractEnergyConsumption() {
  const $eff = $("#efficiency");
  if (!$eff.length) return null;
  const row = makeRowReader($eff);

  // The same labels repeat once per rating block: EVDB real range, then the
  // optional WLTP TEL and TEH blocks. Position selects the block.
  const ranges = row.labels(/Range/i);
  const cons = row.labels(/Vehicle.*Consumption/i);
  const rated = row.labels(/Rated.*Consumption/i);
  const co2 = row.labels(/CO2.*Emissions/i);
  const fuelEq = row.labels(/Vehicle.*Fuel.*Equivalent/i);

  function at($labels, index) {
    if (!$labels.length || index >= $labels.length) return null;
    const $value = $labels.eq(index).next("td");
    return $value.length ? parseMetric($value.text()) : null;
  }

  const out = {
    evdb_real_range: {
      range: at(ranges, 0),
      vehicle_consumption: at(cons, 0),
      co2_emissions: at(co2, 0),
      vehicle_fuel_equivalent: at(fuelEq, 0),
    },
    note: "TEL = Test Energy Low | TEH = Test Energy High. Rated = official figures as published by manufacturer. Rated consumption and fuel equivalency figures include charging losses. Vehicle = calculated battery energy consumption used by the vehicle for propulsion and on-board systems.",
  };

  if (ranges.length > 1) {
    out.wltp_ratings_tel = {
      range: at(ranges, 1),
      vehicle_consumption: at(cons, 1),
      rated_consumption: at(rated, 0),
      co2_emissions: at(co2, 1),
    };
  }

  if (ranges.length > 2) {
    out.wltp_ratings_teh = {
      range: at(ranges, 2),
      vehicle_consumption: at(cons, 2),
      co2_emissions: at(co2, 2),
    };
  }

  return out;
}

function extractRealEnergyConsumption() {
  const $sec = $("#real-consumption");
  if (!$sec.length) return null;
  const row = makeRowReader($sec);

  let from = null;
  let to = null;
  const h = $sec.find("h2").text().trim().match(/([\d.,]+)\s*[-–]\s*([\d.,]+)\s*([A-Za-z/]+)?/);
  if (h) {
    const unit = h[3] || "Wh/km";
    from = parseMetric(h[1] + " " + unit);
    to = parseMetric(h[2] + " " + unit);
  }

  return {
    cold_weather: {
      city: row.metric(/City.*Cold.*Weather/i),
      highway: row.metric(/Highway.*Cold.*Weather/i),
      combined: row.metric(/Combined.*Cold.*Weather/i),
    },
    mild_weather: {
      city: row.metric(/City.*Mild.*Weather/i),
      highway: row.metric(/Highway.*Mild.*Weather/i),
      combined: row.metric(/Combined.*Mild.*Weather/i),
    },
    from: from,
    to: to,
    note: "Indication of real-world energy use in several situations. Cold weather: 'worst-case' based on -10°C and use of heating. Mild weather: 'best-case' based on 23°C and no use of A/C. For 'Highway' figures a constant speed of 110 km/h is assumed. The energy use will depend on speed, style of driving, climate and route conditions.",
  };
}

function extractDimensionsWeight() {
  const $dim = $("#dimensions");
  if (!$dim.length) return null;
  const row = makeRowReader($dim);

  // Deliberately NOT row.metric(): this section takes only the leading unit
  // token ([A-Za-z/]+) rather than the rest of the cell, so a value like
  // "1,823 kg (EU)" yields unit "kg", not "kg (EU)".
  function dim(re) {
    const raw = row.text(re);
    if (!raw) return null;
    const m = raw.match(/^([\d.,]+)\s*([A-Za-z/]+)?/);
    if (!m) return null;
    const value = parseNumberSmart(m[1]);
    if (Number.isNaN(value)) return null;
    return { value: value, unit: m[2] ? m[2].trim() : null };
  }

  return {
    length: dim(/Length/i),
    width: dim(/Width(?!.*mirrors)/i),
    width_with_mirrors: dim(/Width.*mirrors/i),
    height: dim(/Height/i),
    wheelbase: dim(/Wheelbase/i),
    weight_unladen_eu: dim(/Weight.*Unladen/i),
    gross_vehicle_weight_gvwr: dim(/Gross.*Vehicle.*Weight/i),
    max_payload: dim(/Max.*Payload/i),
    cargo_volume: dim(/Cargo.*Volume(?!.*Max|.*Frunk)/i),
    cargo_volume_max: dim(/Cargo.*Volume.*Max/i),
    cargo_volume_frunk: dim(/Cargo.*Volume.*Frunk/i),
    roof_load: dim(/Roof.*Load/i),
    towing_weight_unbraked: dim(/Towing.*Unbraked/i),
    towing_weight_braked: dim(/Towing.*Braked/i),
    vertical_load_max: dim(/Vertical.*Load/i),
    tow_hitch_possible: normalizeTextValue(row.text(/Tow.*Hitch.*Possible/i)),
  };
}

function extractMisc() {
  // These rows are scattered outside any single section, so the scope is the
  // whole body. Kept as-is: narrowing it risks losing fields.
  const row = makeRowReader($("body"));

  const isofixTxt = row.text(/Isofix/i);
  const segment = row.text(/Segment/i) || null;
  const seatsTxt = row.text(/Seats/i);
  const seatsMatch = seatsTxt ? seatsTxt.match(/(\d+)/) : null;
  const isofixMatch = isofixTxt ? isofixTxt.match(/(\d+)/) : null;

  return {
    seats: seatsMatch ? parseInt(seatsMatch[1], 10) : null,
    isofix: isofixTxt ? isofixTxt.split(",")[0].trim() : null,
    isofix_seats: isofixMatch ? parseInt(isofixMatch[1], 10) : null,
    turning_circle: parseMetric(row.text(/Turning.*Circle/i)),
    platform: normalizeTextValue(row.text(/Platform/i)),
    ev_dedicated_platform: normalizeTextValue(row.text(/EV.*Dedicated.*Platform/i)),
    car_body: normalizeTextValue(row.text(/Car.*Body/i)),
    segment: segment,
    segment_1l: segment ? segment.split("-")[0].trim() : null,
    roof_rails: normalizeTextValue(row.text(/Roof.*Rails/i)),
    heat_pump: normalizeTextValue(row.text(/Heat.*pump.*HP/i)),
    hp_std_equipment: normalizeTextValue(row.text(/HP.*Standard.*Equipment/i)),
  };
}

function extractPrecedingModel() {
  const $root = $("#detailed-data").length ? $("#detailed-data") : $("body");

  let $heading = $root.find("h3").filter(function () {
    return /Preceding model/i.test($(this).text());
  }).first();

  if (!$heading.length) {
    $heading = $("h3").filter(function () {
      return /Preceding model/i.test($(this).text());
    }).first();
  }
  if (!$heading.length) return null;

  const $box = $heading.closest(".info-box").length ? $heading.closest(".info-box") : $heading.parent();
  if (!$box.length) return null;

  const $link = $box.find("a[href*='/car/']").first();
  let url = null;
  let evdb_id = null;
  let title = null;

  if ($link.length) {
    const href = $link.attr("href") || "";
    url = absUrl(href);

    const m = href.match(/\/car\/(\d+)/);
    if (m) evdb_id = m[1];

    // Drop the image so its alt text does not leak into the title.
    const $clone = $link.clone();
    $clone.find("img").remove();
    title = $clone.text().trim().replace(/^\s*Preceding model\s*/i, "").trim() || null;
  }

  let thumb_url = null;
  const $img = $box.find("img").first();
  if ($img.length) {
    let src = $img.attr("srcset") || $img.attr("src") || "";
    if (src) {
      if (src.indexOf(",") !== -1 || src.indexOf(" ") !== -1) {
        src = src.split(",")[0].trim().split(" ")[0];
      }
      thumb_url = absUrl(src);
    }
  }

  return {
    description: ($box.find("p").not(".align-center").first().text() || "").trim() || null,
    url: url,
    evdb_id: evdb_id,
    title: title,
    thumb_url: thumb_url,
  };
}

function extractHomeDestinationChargingDetails() {
  const $section = $("#charge-table");
  if (!$section.length) return null;

  const heading = $section.find("h2").first().text().trim() || null;
  const $infoBox = $section.find(".info-box").first();

  if (!$infoBox.length) {
    return {
      heading: heading,
      intro_text: null,
      europe_heading: null,
      europe_text: null,
      type2_title: null,
      type2_image_url: null,
      footnote: null,
      type2_plug: [],
    };
  }

  let europe_heading = null;
  let europe_text = null;
  const $europeH3 = $infoBox.find("h3").filter(function () {
    return /Europe/i.test($(this).text());
  }).first();

  if ($europeH3.length) {
    europe_heading = $europeH3.text().trim() || null;
    europe_text = ($europeH3.nextAll("p").first().text() || "").trim() || null;
  }

  const $standardTable = $infoBox.find("table.charging-table-standard").first();

  let type2_title = null;
  let type2_image_url = null;
  if ($standardTable.length) {
    const $titleTable = $standardTable.closest("div").find("table").first();
    type2_title = $titleTable.find("th").first().text().trim() || null;
    const imgSrc = $titleTable.find("img").first().attr("src") || "";
    type2_image_url = imgSrc ? absUrl(imgSrc) : null;
  }

  const type2_plug = [];
  if ($standardTable.length) {
    const headers = [];
    $standardTable.find("tr").first().find("th, td").each(function () {
      headers.push(($(this).text() || "").trim());
    });

    // First header matching any of the patterns wins, so order matters:
    // "Max. Power" must be found before the plain "Power" column.
    function findCol(patterns) {
      const idx = headers.findIndex(function (h) {
        return patterns.some(function (p) { return p.test(h.toLowerCase()); });
      });
      return idx >= 0 ? idx : null;
    }

    const idxPoint = findCol([/charging\s*point/i]);
    const idxMaxPower = findCol([/max/i, /voltage/i, /power/i]);
    const idxPower = findCol([/^power$/i]);
    const idxTime = findCol([/^time$/i, /0\s*-\s*100/i, /duration/i]);
    const idxRate = findCol([/^rate$/i, /km\/h/i, /range/i]);

    $standardTable.find("tr").slice(1).each(function () {
      const cells = [];
      $(this).find("th, td").each(function () {
        cells.push(($(this).text() || "").trim());
      });
      if (!cells.some(function (v) { return v && v.length; })) return;

      const at = function (idx) { return idx != null ? cells[idx] : ""; };
      const pointRaw = at(idxPoint);

      // "Wall Plug (2.3 kW)" -> "wall-plug"
      const type = pointRaw
        ? pointRaw
            .toLowerCase()
            .replace(/\s*\(.+\)\s*$/, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
        : null;

      const power = parseNumberAndUnit(at(idxPower), "kW");

      type2_plug.push({
        charging_point: { type: type, power: power },
        max_power: parseMaxPowerDescriptor(at(idxMaxPower)),
        power: power,
        time: parseTimeToMinutes(at(idxTime)),
        rate: parseNumberAndUnit(at(idxRate), "km/h"),
      });
    });
  }

  return {
    heading: heading,
    intro_text: ($infoBox.children("p").eq(0).text() || "").trim() || null,
    europe_heading: europe_heading,
    europe_text: europe_text,
    type2_title: type2_title,
    type2_image_url: type2_image_url,
    footnote: ($infoBox.find("p.f-12").first().text() || "").trim() || null,
    type2_plug: type2_plug,
  };
}

// ---------- main ----------

return (function () {
  // car_url must come from the input: it is the key the LIST and DETAILS
  // snapshots are joined on downstream. The page-derived values are fallbacks.
  const cfg = (typeof input !== "undefined" && Array.isArray(input) && input[0]) || {};
  const car_url =
    cfg.car_url ||
    cfg.url ||
    $("link[rel='canonical']").attr("href") ||
    $("meta[property='og:url']").attr("content") ||
    (typeof location !== "undefined" && location.href ? location.href : null) ||
    null;

  let breadcrumb =
    $("nav[aria-label='breadcrumb'], .breadcrumb-nav, ol.breadcrumb")
      .find("li.breadcrumb-item.active, li.active")
      .last()
      .text()
      .trim() || null;

  if (!breadcrumb) {
    breadcrumb = $("li.breadcrumb-item.active").last().text().trim() || null;
  }

  // Gallery. "-thumb" is stripped to get the full-size asset.
  let images_urls = [];
  const $fotorama = $(".fotorama");
  if ($fotorama.length) {
    images_urls = $fotorama
      .find("img")
      .map(function (_, img) {
        const $img = $(img);
        const srcset = $img.attr("srcset") || "";
        let url = srcset ? srcset.split(",")[0].trim().split(" ")[0] : "";
        if (!url) url = $img.attr("src") || "";
        if (!url) return null;
        return absUrl(url.replace(/-thumb(?=\.)/, ""));
      })
      .get()
      .filter(Boolean);

    images_urls = images_urls.filter(function (u, i) {
      return images_urls.indexOf(u) === i;
    });
  }

  // Pricing: each country link appears twice — price first, availability second.
  const $pricing = $("#pricing");
  let pricing_availability = null;

  if ($pricing.length) {
    function pricingCell(re, index) {
      const $link = $pricing
        .find("a[href]")
        .filter(function (_, el) { return re.test($(el).attr("href") || ""); })
        .eq(index);
      if (!$link.length) return null;
      return $link.closest("td").next("td").text().trim() || null;
    }

    const UK = /\/uk\/car\//i;
    const NL = /\/nl\/auto\//i;
    const DE = /\/de\/pkw\//i;

    pricing_availability = {
      pricing: {
        uk: parsePrice(pricingCell(UK, 0)),
        nl: parsePrice(pricingCell(NL, 0)),
        de: parsePrice(pricingCell(DE, 0)),
      },
      availability: {
        uk: pricingCell(UK, 1),
        nl: pricingCell(NL, 1),
        de: pricingCell(DE, 1),
      },
    };
  }

  const meta = extractMetaInfo();

  const vehicle = {
    car_url: car_url,
    title: $("h1").first().text().trim() || null,
    breadcrumb: breadcrumb,
    images_urls: images_urls,
    pricing_availability: pricing_availability,
    real_range: extractRealRange(),
    distance_suitability: extractDistanceSuitability(),
    battery_details: extractBattery(),
    charging: extractCharging(),
    performance: extractPerformance(),
    v2x_charging: extractV2X(),
    energy_consumption: extractEnergyConsumption(),
    real_energy_consumption: extractRealEnergyConsumption(),
    dimensions_weight: extractDimensionsWeight(),
    misc: extractMisc(),
    preceding_model: extractPrecedingModel(),
    home_destination_charging_details: extractHomeDestinationChargingDetails(),
  };

  if (meta) vehicle.meta = meta;

  const unitsSet = new Set();
  collectUnits(vehicle, unitsSet);

  vehicle.metadata = {
    parsed_at: new Date().toISOString(),
    scraper_version: cfg.scraper_version || cfg.version || null,
    detected_units: Array.from(unitsSet).sort(),
  };

  // NOTE: the whole vehicle used to be console.logged here, pretty-printed.
  // At ~650 pages per refresh that is a lot of log for no benefit. One line.
  console.log("Parsed " + (vehicle.title || car_url) + " — " + vehicle.images_urls.length + " images");

  // For local development, return the object directly instead:
  // return vehicle;

  // PRODUCTION: the pipeline's unwrapDetails() expects this string wrapper.
  return { vehicle: JSON.stringify(vehicle) };
})();
```
