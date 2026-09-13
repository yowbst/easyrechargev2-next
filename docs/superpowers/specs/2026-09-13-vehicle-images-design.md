# Vehicle Thumbnails — Design

Date: 2026-09-13
Status: proposed
Implements: the `images` command left unimplemented by
`docs/superpowers/specs/2026-08-23-vehicle-ingest-pipeline-design.md`

## Goal

Give every vehicle a thumbnail at a resolution the site can actually use, and
download those images through Bright Data's proxy network rather than from a
personal IP.

Two problems, one command:

1. **268 draft vehicles have no thumbnail at all**, which blocks publishing them.
2. **The 562 published thumbnails are 448×252** — too small for how the site
   renders them, which is visible as softness.

## Measurements that drove the design

All taken 2026-09-13 against the live site and CMS.

**The quality problem is real.** `VehicleCard` renders with
`sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"`. A 430 px
phone at DPR 3 asks for ~1290 px; the stored source is 448 px. Directus can
transform on the fly but cannot invent detail — `/assets/<id>?width=1200`
returns a larger file (84 KB) with no more information in it.

**EV Database publishes four variants** of the same photo:

| URL suffix | Resolution |
|---|---|
| `-thumb.jpg` | 224×126 |
| `-thumb@2x.jpg` | 448×252 ← what we store today |
| `.jpg` | 768×432 |
| `@2x.jpg` | **1536×864** ← what we will store |

**The source URLs are already in the CMS.** `evdb_images_urls` is populated for
827 of 830 vehicles, and its first entry is the `@2x` variant — the DETAILS
parser deliberately strips `-thumb` to reach full size. No scrape is needed;
the command reads Directus.

Three vehicles have no image URL at all: `smart-5-premium-my25-…`,
`cupra-tavascan-250kw-vz-my27-…`, `ford-explorer-standard-range-rwd-my27-…`.

## Decisions (locked)

1. **Scope: all 830 vehicles**, published and draft alike.
2. **One stored resolution: 1536×864.** Roughly 250 KB each, ~200 MB total.
   Directus and `next/image` downscale per request; visitors never fetch the
   raw source.
3. **Downloads go through a Bright Data datacenter zone.** Never from the
   operator's IP.
4. **Replacement is additive**: upload a new file, repoint `thumbnail`, leave
   the old file in place. Rollback is a repoint. The old files are cleaned up
   later, deliberately, once the result is trusted.
5. **No plan/apply split.** A 830-line list of "download this URL" is not
   usefully reviewable — unlike a spec diff, an image cannot be judged from
   JSON. `--dry-run` and `--limit`, following the `brands` precedent.
6. **`--status draft|published` selects which half of the catalogue to
   process.** The rollout below depends on it: drafts are invisible to
   visitors, so they are where a bad result costs nothing. Without this flag
   `--limit 5` would take an arbitrary five and the staged rollout would be
   impossible.

## Verified prerequisites

Both were blockers when this design started; both are now satisfied.

| | Status |
|---|---|
| Bright Data datacenter zone | ✅ `datacenter_proxy1`, tested end to end |
| `create` on `directus_files` | ✅ granted (also `update`, `delete`) |

The whole chain was exercised once before writing this spec: download via
proxy (253 079 bytes), upload to Directus (`width: 1536` recorded
automatically, correct folder), then delete. No vehicle was touched.

Proxy details, confirmed by test:

```
host  brd.superproxy.io:44445      ← NOT 33335; public docs are misleading
user  brd-customer-hl_27b6d7ae-zone-datacenter_proxy1
```

A direct request exits from CH; through the zone it exits from EC. That
difference is the point of the feature.

## Architecture

### `proxy.ts` — network egress

```
assertProxyConfigured(env)              throws when zone or password is absent
buildProxyUrl(customer, zone, password) the brd-customer-…-zone-… form
createDispatcher()                      undici ProxyAgent
```

Isolating this makes the fail-closed rule a pure, testable function instead of
a condition buried inside an 830-iteration loop.

**Fail-closed is an invariant, not an option.** With no zone configured the
command refuses to start. It never falls back to a direct download — silently
leaking the operator's IP is precisely the outcome the feature exists to
prevent.

### `images.ts` — selection, naming, orchestration

```
pickImageUrl(urls)                  first @2x, else first, else null
needsThumbnailUpgrade(vehicle)      missing, or below 1536 and not ours
thumbnailFilename(slug)             "<slug>@2x.jpg"
upgradeThumbnails(vehicles, opts)   orchestration
```

`upgradeThumbnails` takes its side effects by injection — `download`,
`uploadFile`, `attachThumbnail` — exactly as `applyPlan` takes `write`. That
is what let the plan executor be tested without touching Directus, and it
applies unchanged here.

### `queries.ts` — one addition

`fetchVehiclesForThumbnails(status?)` returns `id, slug, name,
evdb_images_urls, thumbnail.width, thumbnail.filename_download` for every
vehicle, optionally narrowed to one status. Both thumbnail fields are needed:
the skip test reads each of them.

### Data flow

```
CMS (evdb_images_urls, thumbnail.width)
  → pick the @2x url
  → download through the Bright Data zone
  → POST /files (multipart, folder 8d8adba5-b056-49f9-9882-e12c8c6efb55)
  → PATCH vehicle.thumbnail = new uuid
```

## Idempotence without state

Directus records `width` on every uploaded file, so **the CMS itself says
whether a vehicle has been processed**. No checkpoint file, no resume flag:
re-running after an interruption picks up naturally, and re-running against a
finished catalogue does nothing. That is deliberately stronger than a
checkpoint, which can diverge from reality — a failure mode this project hit
once already, when a dry run recorded entries as applied that were never
written.

**A vehicle is skipped when its thumbnail width is ≥ 1536 OR its
`filename_download` already equals `<slug>@2x.jpg`.**

The filename half of that test is not redundant. Width alone would loop
forever on any vehicle whose source happens to be smaller than 1536: upload it,
observe width < 1536, re-download and re-upload on the next run, accumulating a
duplicate file every time. Six sampled sources were all 1536×864, so EV
Database looks consistent today — but idempotence must not rest on an upstream
publishing habit. The filename is our own marker and cannot drift.

## Conventions kept, and one broken

Kept, matching the existing 562 files: the vehicles folder
(`8d8adba5-…`), GCS storage, and the title form `<name> (thumbnail)`.

Broken deliberately: the filename becomes `<slug>@2x.jpg` rather than
`<slug>_thumb@2x.jpg`. At 1536×864 the word "thumb" is simply wrong, and the
name is the only place a future reader would look to know what a file holds.

## Error handling

A failed download or upload is counted and reported; it does not abort the
run. Across 830 network round-trips, stopping at the first error would make
the command unusable.

The three vehicles with no source URL are reported as skipped, not as
failures — nothing is broken, the data is simply absent upstream.

## Testing

Pure functions are tested directly: URL choice with and without an `@2x`
present, selection that skips a 1536 record and keeps a 448 one, filename
form, and `assertProxyConfigured` throwing when the zone is missing.

Orchestration is tested through the three injected seams, pinning six
behaviours:

- a vehicle already at 1536 triggers **no** download
- a vehicle whose stored filename already matches `<slug>@2x.jpg` triggers no
  download either, even when its width is below 1536
- a vehicle with no URL is counted as skipped, never as a silent success
- one failed download does not stop the ones after it
- `--dry-run` produces **zero** calls to any of the three seams
- the previous `thumbnail` file is never deleted

No test touches the network or Directus.

## Rollout

The order places risk where it costs nothing.

1. `--dry-run` over the whole catalogue — confirms selection (827 to process,
   3 skipped) with no bytes transferred.
2. `--status draft --limit 5`. Invisible to visitors; a bad result harms
   nothing. Inspect the files in Directus.
3. `--status draft` for the remaining 263.
4. `--status published --limit 5`, then look at the site on a phone — the
   case that prompted this work.
5. `--status published` for the remaining 557.

Nothing compels moving from one step to the next, and because the old file is
kept, rolling back is a repoint.

## Known limitations

- **562 orphaned files** (~23 MB) once published vehicles are processed. Kept
  on purpose: they are the rollback. Cleaning them up is a separate, later
  decision.
- **Three vehicles will still have no image** until one is added by hand.
- **+200 MB on GCS.** Negligible in cost, stated for honesty.
- **`delete` is granted on `directus_files` but unused.** The pipeline never
  deletes. The privilege can be withdrawn without affecting this command.

## Out of scope

- The other ~7 images per vehicle in `evdb_images_urls`. A gallery is a
  feature, not a fix; this command sets one thumbnail.
- Cleaning up the orphaned files.
- Any change to how the site renders images. `VehicleCard`'s `sizes` attribute
  is already correct — it was the source that was too small.

## The proxy call, resolved

`fetch(url, { dispatcher })` works, but **only when `fetch` and `ProxyAgent`
come from the same undici**. Passing an installed-undici dispatcher to Node's
global `fetch` fails with `UND_ERR_INVALID_ARG: invalid onRequestStart method`:
the global uses Node's *bundled* undici, whose internal handler interface
differs from the installed package's.

So the import is:

```ts
import { fetch, ProxyAgent } from "undici";
```

not the global `fetch`. Verified from Node: geo reports MA through the zone
against CH direct, and the image arrives at 253 079 bytes, 1536x864.

`undici` is added as a devDependency — the CLI runs locally and never ships to
Vercel.
