# Vehicle Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all 830 vehicles a 1536×864 thumbnail, downloaded through Bright Data's proxy so the operator's IP is never exposed.

**Architecture:** A CMS-driven `images` command. Source URLs are already stored in `evdb_images_urls`, so nothing is scraped. Idempotence comes from the CMS itself — Directus records each file's width, and the filename is our own marker — so there is no checkpoint file.

**Tech Stack:** TypeScript 5, Node 22, vitest 4, undici (devDependency), Directus files API, Bright Data datacenter proxy.

**Spec:** `docs/superpowers/specs/2026-09-13-vehicle-images-design.md`

## Global Constraints

- **Fail closed on the proxy.** With no zone configured the command refuses to start. There is NEVER a fallback to a direct download — leaking the operator's IP is the exact outcome this feature exists to prevent.
- **Import `fetch` AND `ProxyAgent` from `undici`**, never Node's global `fetch`. A dispatcher from the installed undici passed to the global fetch throws `UND_ERR_INVALID_ARG: invalid onRequestStart method`.
- **Proxy host is `brd.superproxy.io:44445`**, not 33335. The public docs are misleading; the zone's own email is authoritative.
- **Never delete anything.** The previous thumbnail file stays; rollback is a repoint.
- Stored resolution: **1536×864**, filename `<slug>@2x.jpg`, folder `8d8adba5-b056-49f9-9882-e12c8c6efb55`, title `<name> (thumbnail)`.
- Tests are co-located `*.test.ts`, run with `npm test` (vitest 4). No test may touch the network or Directus.
- Path alias `@/*` → `./src/*`. Secrets from env only.

---

### Task 1: Proxy egress

Isolates the fail-closed rule into a pure function instead of a condition buried in an 830-iteration loop.

**Files:**
- Create: `src/lib/vehicles/ingest/proxy.ts`
- Test: `src/lib/vehicles/ingest/proxy.test.ts`
- Modify: `package.json` (add `undici` devDependency)

**Interfaces:**
- Consumes: nothing
- Produces: `ProxyConfig {host, customerId, zone, password}`, `readProxyConfig(env: NodeJS.ProcessEnv): ProxyConfig`, `buildProxyUri(cfg: ProxyConfig): string`, `createDispatcher(cfg: ProxyConfig): Dispatcher`

- [ ] **Step 1: Install undici**

```bash
npm install --save-dev undici
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/vehicles/ingest/proxy.test.ts
import { describe, it, expect } from "vitest";
import { readProxyConfig, buildProxyUri } from "./proxy";

const full = {
  BRIGHTDATA_PROXY_HOST: "brd.superproxy.io:44445",
  BRIGHTDATA_CUSTOMER_ID: "hl_27b6d7ae",
  BRIGHTDATA_PROXY_ZONE: "datacenter_proxy1",
  BRIGHTDATA_PROXY_PASSWORD: "s3cret",
} as NodeJS.ProcessEnv;

describe("readProxyConfig", () => {
  it("reads a complete configuration", () => {
    expect(readProxyConfig(full)).toEqual({
      host: "brd.superproxy.io:44445",
      customerId: "hl_27b6d7ae",
      zone: "datacenter_proxy1",
      password: "s3cret",
    });
  });

  it("defaults the host, which is 44445 and NOT the 33335 in the public docs", () => {
    const { BRIGHTDATA_PROXY_HOST: _, ...rest } = full;
    expect(readProxyConfig(rest as NodeJS.ProcessEnv).host).toBe("brd.superproxy.io:44445");
  });

  // Fail-closed: each missing secret must throw, never degrade to a direct fetch.
  it.each(["BRIGHTDATA_PROXY_ZONE", "BRIGHTDATA_PROXY_PASSWORD", "BRIGHTDATA_CUSTOMER_ID"])(
    "throws when %s is missing rather than falling back to a direct download",
    (key) => {
      const env = { ...full };
      delete env[key];
      expect(() => readProxyConfig(env)).toThrow(new RegExp(key));
    },
  );

  it("names the privacy reason in the error, so the fix is obvious", () => {
    const env = { ...full };
    delete env.BRIGHTDATA_PROXY_ZONE;
    expect(() => readProxyConfig(env)).toThrow(/never downloads directly/i);
  });

  it("rejects an empty string as firmly as an absent value", () => {
    expect(() => readProxyConfig({ ...full, BRIGHTDATA_PROXY_PASSWORD: "" })).toThrow();
  });
});

describe("buildProxyUri", () => {
  it("builds the brd-customer-…-zone-… form", () => {
    expect(buildProxyUri(readProxyConfig(full))).toBe(
      "http://brd-customer-hl_27b6d7ae-zone-datacenter_proxy1:s3cret@brd.superproxy.io:44445",
    );
  });

  it("percent-encodes a password containing URI metacharacters", () => {
    const cfg = readProxyConfig({ ...full, BRIGHTDATA_PROXY_PASSWORD: "p@ss:w/rd" });
    expect(buildProxyUri(cfg)).toContain("p%40ss%3Aw%2Frd");
    expect(buildProxyUri(cfg)).toMatch(/@brd\.superproxy\.io:44445$/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/proxy.test.ts`
Expected: FAIL — cannot resolve `./proxy`

- [ ] **Step 4: Write the implementation**

```typescript
// src/lib/vehicles/ingest/proxy.ts
import { ProxyAgent, type Dispatcher } from "undici";

/**
 * Bright Data's own zone email gives 44445. The public documentation says
 * 33335, which does not work for this account. Do not "correct" this back.
 */
const DEFAULT_HOST = "brd.superproxy.io:44445";

export interface ProxyConfig {
  host: string;
  customerId: string;
  zone: string;
  password: string;
}

/**
 * Reads the proxy configuration, or throws.
 *
 * Throwing is the point. Every vehicle image is fetched from EV Database, and
 * doing that from the operator's own address is exactly what this feature
 * exists to avoid. A missing zone must stop the run, never quietly downgrade
 * it to a direct download.
 */
export function readProxyConfig(env: NodeJS.ProcessEnv): ProxyConfig {
  const required = {
    BRIGHTDATA_CUSTOMER_ID: env.BRIGHTDATA_CUSTOMER_ID,
    BRIGHTDATA_PROXY_ZONE: env.BRIGHTDATA_PROXY_ZONE,
    BRIGHTDATA_PROXY_PASSWORD: env.BRIGHTDATA_PROXY_PASSWORD,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(
      `Bright Data proxy is not configured: ${missing.join(", ")} missing. ` +
        `This command never downloads directly — every image is fetched through ` +
        `the proxy zone so the operator's IP is not exposed. Set the variables ` +
        `in .env.local and retry.`,
    );
  }

  return {
    host: env.BRIGHTDATA_PROXY_HOST || DEFAULT_HOST,
    customerId: required.BRIGHTDATA_CUSTOMER_ID as string,
    zone: required.BRIGHTDATA_PROXY_ZONE as string,
    password: required.BRIGHTDATA_PROXY_PASSWORD as string,
  };
}

export function buildProxyUri(cfg: ProxyConfig): string {
  const user = `brd-customer-${cfg.customerId}-zone-${cfg.zone}`;
  return `http://${encodeURIComponent(user)}:${encodeURIComponent(cfg.password)}@${cfg.host}`;
}

/**
 * `rejectUnauthorized: false` mirrors the `-k` that Bright Data's own sample
 * curl uses: the super-proxy terminates TLS with its own certificate.
 */
export function createDispatcher(cfg: ProxyConfig): Dispatcher {
  return new ProxyAgent({
    uri: buildProxyUri(cfg),
    requestTls: { rejectUnauthorized: false },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/proxy.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Verify the whole suite and types**

Run: `npm test && npx tsc --noEmit`
Expected: all green

- [ ] **Step 7: Commit**

```bash
git add src/lib/vehicles/ingest/proxy.ts src/lib/vehicles/ingest/proxy.test.ts package.json package-lock.json
git commit -m "feat(images): Bright Data proxy egress, fail-closed"
```

---

### Task 2: Selection and naming

The pure decisions: which URL to take, whether a vehicle still needs work, what the file is called.

**Files:**
- Create: `src/lib/vehicles/ingest/images.ts`
- Test: `src/lib/vehicles/ingest/images.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ThumbnailCandidate {id, slug, name, evdb_images_urls, thumbnail}`, `TARGET_WIDTH`, `pickImageUrl(urls)`, `thumbnailFilename(slug)`, `thumbnailTitle(name)`, `needsThumbnailUpgrade(v)`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/vehicles/ingest/images.test.ts
import { describe, it, expect } from "vitest";
import {
  pickImageUrl,
  thumbnailFilename,
  thumbnailTitle,
  needsThumbnailUpgrade,
  TARGET_WIDTH,
  type ThumbnailCandidate,
} from "./images";

const v = (over: Partial<ThumbnailCandidate> = {}): ThumbnailCandidate => ({
  id: "uuid-1",
  slug: "bmw-i4-xdrive40-84kwh-490km-2025",
  name: "BMW i4 xDrive40 84kWh 490km [2025-]",
  evdb_images_urls: ["https://x/a-01@2x.jpg"],
  thumbnail: null,
  ...over,
});

describe("pickImageUrl", () => {
  it("prefers the @2x variant, which is the 1536-wide one", () => {
    expect(pickImageUrl(["https://x/a-01.jpg", "https://x/a-01@2x.jpg"])).toBe(
      "https://x/a-01@2x.jpg",
    );
  });

  it("falls back to the first url when no @2x is offered", () => {
    expect(pickImageUrl(["https://x/a-01.jpg"])).toBe("https://x/a-01.jpg");
  });

  it("returns null for an empty or absent list", () => {
    expect(pickImageUrl([])).toBeNull();
    expect(pickImageUrl(null)).toBeNull();
  });

  it("ignores non-string entries rather than returning one", () => {
    expect(pickImageUrl([null, 42, "https://x/a@2x.jpg"] as unknown[])).toBe("https://x/a@2x.jpg");
  });
});

describe("thumbnailFilename / thumbnailTitle", () => {
  it("drops the misleading _thumb the 448px files carried", () => {
    expect(thumbnailFilename("bmw-i4-84kwh")).toBe("bmw-i4-84kwh@2x.jpg");
  });

  it("keeps the existing title convention", () => {
    expect(thumbnailTitle("BMW i4 xDrive40")).toBe("BMW i4 xDrive40 (thumbnail)");
  });
});

describe("needsThumbnailUpgrade", () => {
  it("selects a vehicle with no thumbnail at all", () => {
    expect(needsThumbnailUpgrade(v({ thumbnail: null }))).toBe(true);
  });

  it("selects the 448px legacy thumbnails", () => {
    expect(
      needsThumbnailUpgrade(
        v({ thumbnail: { width: 448, filename_download: "bmw-i4-xdrive40-84kwh-490km-2025_thumb@2x.jpg" } }),
      ),
    ).toBe(true);
  });

  it("skips a vehicle already at the target width", () => {
    expect(
      needsThumbnailUpgrade(
        v({ thumbnail: { width: TARGET_WIDTH, filename_download: "whatever.jpg" } }),
      ),
    ).toBe(false);
  });

  // Without this, a source smaller than 1536 would be re-downloaded and
  // re-uploaded on every run, accumulating a duplicate file each time.
  it("skips a file we already produced, even when it is under the target width", () => {
    expect(
      needsThumbnailUpgrade(
        v({ thumbnail: { width: 900, filename_download: "bmw-i4-xdrive40-84kwh-490km-2025@2x.jpg" } }),
      ),
    ).toBe(false);
  });

  it("does not mistake the legacy _thumb name for ours", () => {
    expect(
      needsThumbnailUpgrade(
        v({ thumbnail: { width: 448, filename_download: "bmw-i4-xdrive40-84kwh-490km-2025_thumb@2x.jpg" } }),
      ),
    ).toBe(true);
  });

  it("tolerates a thumbnail row with no width recorded", () => {
    expect(needsThumbnailUpgrade(v({ thumbnail: { width: null, filename_download: "x.jpg" } }))).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/images.test.ts`
Expected: FAIL — cannot resolve `./images`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/vehicles/ingest/images.ts

/** EV Database's largest variant, and what the site actually needs. */
export const TARGET_WIDTH = 1536;

export interface ThumbnailFile {
  width: number | null;
  filename_download: string | null;
}

export interface ThumbnailCandidate {
  id: string;
  slug: string;
  name: string | null;
  evdb_images_urls: unknown;
  thumbnail: ThumbnailFile | null;
}

/**
 * The @2x variant is 1536x864; the bare one is 768x432. The DETAILS parser
 * already strips `-thumb`, so the stored urls point at full-size assets.
 */
export function pickImageUrl(urls: unknown): string | null {
  if (!Array.isArray(urls)) return null;
  const strings = urls.filter((u): u is string => typeof u === "string" && u.length > 0);
  if (!strings.length) return null;
  return strings.find((u) => u.includes("@2x")) ?? strings[0];
}

/**
 * Deliberately drops the `_thumb` the legacy 448px files carried: at
 * 1536x864 it is simply wrong, and the filename is the only place a future
 * reader looks to know what a file holds.
 */
export function thumbnailFilename(slug: string): string {
  return `${slug}@2x.jpg`;
}

export function thumbnailTitle(name: string | null): string {
  return `${name ?? ""} (thumbnail)`.trim();
}

/**
 * A vehicle is done when its thumbnail is wide enough, OR when the stored
 * filename is one we produced.
 *
 * The filename half is not redundant. Width alone would loop forever on any
 * vehicle whose source is smaller than the target: upload it, observe
 * width < TARGET_WIDTH, re-download and re-upload next run, accumulating a
 * duplicate every time. The filename is our own marker and cannot drift with
 * EV Database's publishing habits.
 */
export function needsThumbnailUpgrade(v: ThumbnailCandidate): boolean {
  const t = v.thumbnail;
  if (!t) return true;
  if (typeof t.width === "number" && t.width >= TARGET_WIDTH) return false;
  if (t.filename_download === thumbnailFilename(v.slug)) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/images.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles/ingest/images.ts src/lib/vehicles/ingest/images.test.ts
git commit -m "feat(images): thumbnail selection and naming"
```

---

### Task 3: CMS read for thumbnails

**Files:**
- Modify: `src/lib/vehicles/ingest/queries.ts` (append)
- Test: `src/lib/vehicles/ingest/queries.test.ts` (append)

**Interfaces:**
- Consumes: `ThumbnailCandidate` from Task 2; `directusFetch` from `@/lib/directus`
- Produces: `fetchVehiclesForThumbnails(status?: "draft" | "published"): Promise<ThumbnailCandidate[]>`, `buildThumbnailQuery(status?, limit, offset): string`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/vehicles/ingest/queries.test.ts`:

```typescript
describe("buildThumbnailQuery", () => {
  it("requests both thumbnail fields the skip test reads", () => {
    const q = buildThumbnailQuery(undefined, 200, 0);
    expect(q).toContain("thumbnail.width");
    expect(q).toContain("thumbnail.filename_download");
  });

  it("narrows by status when one is given", () => {
    expect(buildThumbnailQuery("draft", 200, 0)).toContain("filter[status][_eq]=draft");
  });

  it("omits the status filter entirely when none is given", () => {
    expect(buildThumbnailQuery(undefined, 200, 0)).not.toContain("filter[status]");
  });

  it("carries limit and offset for pagination", () => {
    const q = buildThumbnailQuery(undefined, 200, 400);
    expect(q).toContain("limit=200");
    expect(q).toContain("offset=400");
  });

  it("sorts by id so pagination is stable across pages", () => {
    expect(buildThumbnailQuery(undefined, 200, 0)).toContain("sort=id");
  });
});
```

Add `buildThumbnailQuery` to the existing import at the top of that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/queries.test.ts`
Expected: FAIL — `buildThumbnailQuery` is not exported

- [ ] **Step 3: Write the implementation**

Append to `src/lib/vehicles/ingest/queries.ts`:

```typescript
import type { ThumbnailCandidate } from "./images";

/**
 * Both thumbnail fields are required: the skip test reads the width AND the
 * filename, because width alone would loop on an undersized source.
 */
export function buildThumbnailQuery(
  status: "draft" | "published" | undefined,
  limit: number,
  offset: number,
): string {
  const parts = [
    "fields=id,slug,name,evdb_images_urls,thumbnail.width,thumbnail.filename_download",
    `limit=${limit}`,
    `offset=${offset}`,
    "sort=id",
  ];
  if (status) parts.push(`filter[status][_eq]=${status}`);
  return `/items/vehicles?${parts.join("&")}`;
}

export async function fetchVehiclesForThumbnails(
  status?: "draft" | "published",
): Promise<ThumbnailCandidate[]> {
  const out: ThumbnailCandidate[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await directusFetch<{ data: ThumbnailCandidate[] }>(
      buildThumbnailQuery(status, PAGE, offset),
      { next: { revalidate: 0 } },
    );
    const batch = res.data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) return out;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/queries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles/ingest/queries.ts src/lib/vehicles/ingest/queries.test.ts
git commit -m "feat(images): CMS read for thumbnail candidates"
```

---

### Task 4: Orchestration

Takes its side effects by injection, exactly as `applyPlan` takes `write` — which is what let the plan executor be tested without touching Directus.

**Files:**
- Modify: `src/lib/vehicles/ingest/images.ts` (append)
- Test: `src/lib/vehicles/ingest/images.test.ts` (append)

**Interfaces:**
- Consumes: everything from Task 2
- Produces: `ThumbnailSeams {download, uploadFile, attachThumbnail}`, `ThumbnailResult {uploaded, skipped, failed, failures}`, `upgradeThumbnails(vehicles, seams, opts): Promise<ThumbnailResult>`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/vehicles/ingest/images.test.ts`:

```typescript
import { vi } from "vitest";
import { upgradeThumbnails, type ThumbnailSeams } from "./images";

const seams = () => {
  const s = {
    download: vi.fn(async () => Buffer.from("jpeg-bytes")),
    uploadFile: vi.fn(async () => "file-uuid"),
    attachThumbnail: vi.fn(async () => {}),
  };
  return s as unknown as ThumbnailSeams & typeof s;
};

describe("upgradeThumbnails", () => {
  it("downloads, uploads and attaches for a vehicle that needs it", async () => {
    const s = seams();
    const r = await upgradeThumbnails([v()], s, { dryRun: false });

    expect(s.download).toHaveBeenCalledWith("https://x/a-01@2x.jpg");
    expect(s.uploadFile).toHaveBeenCalledWith(
      expect.anything(),
      "bmw-i4-xdrive40-84kwh-490km-2025@2x.jpg",
      "BMW i4 xDrive40 84kWh 490km [2025-] (thumbnail)",
    );
    expect(s.attachThumbnail).toHaveBeenCalledWith("uuid-1", "file-uuid");
    expect(r).toMatchObject({ uploaded: 1, skipped: 0, failed: 0 });
  });

  it("does nothing at all for a vehicle already at the target width", async () => {
    const s = seams();
    const r = await upgradeThumbnails(
      [v({ thumbnail: { width: TARGET_WIDTH, filename_download: "x.jpg" } })],
      s,
      { dryRun: false },
    );
    expect(s.download).not.toHaveBeenCalled();
    expect(r).toMatchObject({ uploaded: 0, skipped: 1 });
  });

  it("counts a vehicle with no source url as skipped, never as a silent success", async () => {
    const s = seams();
    const r = await upgradeThumbnails([v({ evdb_images_urls: [] })], s, { dryRun: false });
    expect(s.download).not.toHaveBeenCalled();
    expect(r).toMatchObject({ uploaded: 0, skipped: 1, failed: 0 });
  });

  it("keeps going after a failed download and reports the failure", async () => {
    const s = seams();
    s.download
      .mockRejectedValueOnce(new Error("502 from EVDB"))
      .mockResolvedValueOnce(Buffer.from("ok"));

    const r = await upgradeThumbnails([v({ id: "a", slug: "a" }), v({ id: "b", slug: "b" })], s, {
      dryRun: false,
    });

    expect(r).toMatchObject({ uploaded: 1, failed: 1 });
    expect(r.failures[0]).toMatchObject({ slug: "a" });
    expect(r.failures[0].error).toMatch(/502 from EVDB/);
  });

  it("keeps going after a failed upload too", async () => {
    const s = seams();
    s.uploadFile.mockRejectedValueOnce(new Error("413 too large"));
    const r = await upgradeThumbnails([v({ id: "a", slug: "a" }), v({ id: "b", slug: "b" })], s, {
      dryRun: false,
    });
    expect(r).toMatchObject({ uploaded: 1, failed: 1 });
  });

  it("performs ZERO side effects under dryRun while still reporting intent", async () => {
    const s = seams();
    const r = await upgradeThumbnails([v()], s, { dryRun: true });
    expect(s.download).not.toHaveBeenCalled();
    expect(s.uploadFile).not.toHaveBeenCalled();
    expect(s.attachThumbnail).not.toHaveBeenCalled();
    expect(r).toMatchObject({ uploaded: 1, skipped: 0 });
  });

  it("never deletes the previous thumbnail — there is no delete seam to call", async () => {
    const s = seams();
    await upgradeThumbnails([v({ thumbnail: { width: 448, filename_download: "old_thumb@2x.jpg" } })], s, {
      dryRun: false,
    });
    expect(Object.keys(s)).toEqual(["download", "uploadFile", "attachThumbnail"]);
  });

  it("honours limit", async () => {
    const s = seams();
    const r = await upgradeThumbnails([v({ id: "a" }), v({ id: "b" }), v({ id: "c" })], s, {
      dryRun: false,
      limit: 2,
    });
    expect(r.uploaded).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/images.test.ts`
Expected: FAIL — `upgradeThumbnails` is not exported

- [ ] **Step 3: Write the implementation**

Append to `src/lib/vehicles/ingest/images.ts`:

```typescript
export interface ThumbnailSeams {
  download: (url: string) => Promise<Buffer>;
  uploadFile: (bytes: Buffer, filename: string, title: string) => Promise<string>;
  attachThumbnail: (vehicleId: string, fileId: string) => Promise<void>;
}

export interface ThumbnailFailure {
  slug: string;
  error: string;
}

export interface ThumbnailResult {
  uploaded: number;
  skipped: number;
  failed: number;
  failures: ThumbnailFailure[];
  noUrl: string[];
}

/**
 * There is deliberately no delete seam. The previous file stays: rollback is
 * repointing `thumbnail`, and nothing in this pipeline has ever deleted.
 *
 * One failure never aborts the run — across ~830 network round-trips,
 * stopping at the first error would make the command unusable.
 */
export async function upgradeThumbnails(
  vehicles: ThumbnailCandidate[],
  seams: ThumbnailSeams,
  opts: { dryRun: boolean; limit?: number; onProgress?: (done: number, total: number) => void },
): Promise<ThumbnailResult> {
  const todo = vehicles.filter(needsThumbnailUpgrade);
  const skippedAlreadyDone = vehicles.length - todo.length;

  const selected = typeof opts.limit === "number" ? todo.slice(0, opts.limit) : todo;

  const result: ThumbnailResult = {
    uploaded: 0,
    skipped: skippedAlreadyDone,
    failed: 0,
    failures: [],
    noUrl: [],
  };

  for (const [i, vehicle] of selected.entries()) {
    const url = pickImageUrl(vehicle.evdb_images_urls);

    if (!url) {
      // Nothing is broken — the data is simply absent upstream.
      result.skipped += 1;
      result.noUrl.push(vehicle.slug);
      continue;
    }

    if (opts.dryRun) {
      result.uploaded += 1;
      continue;
    }

    try {
      const bytes = await seams.download(url);
      const fileId = await seams.uploadFile(
        bytes,
        thumbnailFilename(vehicle.slug),
        thumbnailTitle(vehicle.name),
      );
      await seams.attachThumbnail(vehicle.id, fileId);
      result.uploaded += 1;
    } catch (err) {
      result.failed += 1;
      result.failures.push({
        slug: vehicle.slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    opts.onProgress?.(i + 1, selected.length);
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/images.test.ts`
Expected: PASS (20 tests)

- [ ] **Step 5: Verify the whole suite and types**

Run: `npm test && npx tsc --noEmit`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/lib/vehicles/ingest/images.ts src/lib/vehicles/ingest/images.test.ts
git commit -m "feat(images): thumbnail upgrade orchestration"
```

---

### Task 5: CLI command

**Files:**
- Modify: `src/lib/vehicles/ingest/cli-helpers.ts` (`COMMAND_FLAGS`)
- Modify: `scripts/vehicles-ingest.ts` (imports, `cmdImages`, `commands`, `HELP`)
- Test: `src/lib/vehicles/ingest/cli-helpers.test.ts` (append)

**Interfaces:**
- Consumes: `readProxyConfig`, `createDispatcher` (Task 1); `upgradeThumbnails`, `ThumbnailSeams` (Tasks 2 and 4); `fetchVehiclesForThumbnails` (Task 3)
- Produces: the `images` CLI command

- [ ] **Step 1: Write the failing test**

Append to `src/lib/vehicles/ingest/cli-helpers.test.ts`:

```typescript
describe("images command flags", () => {
  it("accepts its three flags", () => {
    expect(() =>
      validateFlags("images", ["images", "--status", "draft", "--limit", "5", "--dry-run"]),
    ).not.toThrow();
  });

  it("rejects an unknown flag rather than ignoring it", () => {
    expect(() => validateFlags("images", ["images", "--statuss", "draft"])).toThrow(/Unknown flag/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/vehicles/ingest/cli-helpers.test.ts`
Expected: FAIL — "Unknown command \"images\""

- [ ] **Step 3: Register the flags**

In `src/lib/vehicles/ingest/cli-helpers.ts`, add to `COMMAND_FLAGS`:

```typescript
  images: [
    { name: "status", takesValue: true },
    { name: "limit", takesValue: true },
    { name: "dry-run", takesValue: false },
  ],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/vehicles/ingest/cli-helpers.test.ts`
Expected: PASS

- [ ] **Step 5: Write the command**

In `scripts/vehicles-ingest.ts`, add these imports:

```typescript
import { fetch as undiciFetch } from "undici";
import { DIRECTUS_URL } from "@/lib/directus";
import { readProxyConfig, createDispatcher } from "@/lib/vehicles/ingest/proxy";
import { upgradeThumbnails, type ThumbnailSeams } from "@/lib/vehicles/ingest/images";
import { fetchVehiclesForThumbnails } from "@/lib/vehicles/ingest/queries";
```

Add the command function:

```typescript
async function cmdImages() {
  const dryRun = has("dry-run");
  const rawStatus = flag("status");
  if (rawStatus && rawStatus !== "draft" && rawStatus !== "published") {
    throw new Error(`--status must be "draft" or "published". Got "${rawStatus}".`);
  }
  const status = rawStatus as "draft" | "published" | undefined;
  const limit = flag("limit") ? Number(flag("limit")) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`--limit must be a positive number. Got "${flag("limit")}".`);
  }

  // Fail closed BEFORE reading the CMS: if the proxy is not configured there
  // is nothing to do, and we must never fall back to a direct download.
  const proxy = readProxyConfig(process.env);
  const dispatcher = createDispatcher(proxy);
  console.log(`  egress via Bright Data zone "${proxy.zone}" (${proxy.host})`);

  const vehicles = await fetchVehiclesForThumbnails(status);
  console.log(`  ${vehicles.length} vehicles${status ? ` with status ${status}` : ""}`);

  const seams: ThumbnailSeams = {
    download: async (url) => {
      const res = await undiciFetch(url, { dispatcher });
      if (!res.ok) throw new Error(`download ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    },
    // NOT directusFetch: it sets Content-Type: application/json BEFORE
    // spreading init.headers, so `headers: {}` cannot remove it and the
    // multipart boundary would never be sent. Verified by reading
    // src/lib/directus.ts. This one call goes direct, with the bearer set by
    // hand and no Content-Type, so FormData sets its own.
    uploadFile: async (bytes, filename, title) => {
      const form = new FormData();
      form.append("folder", VEHICLES_FOLDER_ID);
      form.append("title", title);
      form.append("file", new Blob([bytes], { type: "image/jpeg" }), filename);

      const res = await undiciFetch(`${DIRECTUS_URL}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}` },
        body: form,
      });
      if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 200)}`);

      const json = (await res.json()) as { data: { id: string } };
      return json.data.id;
    },
    attachThumbnail: async (vehicleId, fileId) => {
      await directusFetch(`/items/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify({ thumbnail: fileId }),
        next: { revalidate: 0 },
      });
    },
  };

  const r = await upgradeThumbnails(vehicles, seams, {
    dryRun,
    limit,
    onProgress: (done, total) => {
      if (done % 25 === 0 || done === total) console.log(`  ${done}/${total} …`);
    },
  });

  console.log(
    `\n${dryRun ? "[DRY RUN] " : ""}✅ uploaded ${r.uploaded}, skipped ${r.skipped}, failed ${r.failed}`,
  );
  if (r.noUrl.length) printTruncated("ℹ️  no source image url upstream", r.noUrl);
  if (r.failures.length) {
    printTruncated(
      "⚠️  failed",
      r.failures.map((f) => `${f.slug}: ${f.error}`),
    );
  }
  if (!dryRun && r.uploaded > 0) {
    console.log("   Previous thumbnail files are kept — rollback is a repoint.");
  }
}
```

Add the folder constant near `CHUNK`:

```typescript
/** The vehicles folder the existing 562 thumbnails already live in. */
const VEHICLES_FOLDER_ID = "8d8adba5-b056-49f9-9882-e12c8c6efb55";
```

Register it in `commands`:

```typescript
  images: cmdImages,
```

Add to `HELP`, under Commands:

```
  images                    download 1536px thumbnails through the Bright Data proxy
```

and under Options:

```
  --status <draft|published> images: restrict to one half of the catalogue
```

- [ ] **Step 6: Verify the CLI rejects bad input without touching the network**

```bash
npm run ingest -- images --statuss draft
npm run ingest -- images --status nonsense
npm run ingest -- badcommand
```

Expected in order: `Unknown flag "--statuss"`; `--status must be "draft" or "published"`; `Unknown command`.

- [ ] **Step 7: Verify the fail-closed rule holds**

```bash
env -u BRIGHTDATA_PROXY_ZONE npx tsx --env-file=/dev/null scripts/vehicles-ingest.ts images --dry-run
```

Expected: throws naming `BRIGHTDATA_PROXY_ZONE` and the phrase "never downloads directly". It must NOT reach Directus or download anything.

- [ ] **Step 8: Verify the whole suite, types and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green; lint reports nothing on the touched files.

- [ ] **Step 9: Commit**

```bash
git add src/lib/vehicles/ingest/cli-helpers.ts src/lib/vehicles/ingest/cli-helpers.test.ts scripts/vehicles-ingest.ts
git commit -m "feat(images): images command"
```

---

### Task 6: Staged rollout

Verification only. No production code changes.

**Files:**
- Modify: `docs/vehicle-ingest.md` (document the command)

- [ ] **Step 1: Dry run over the whole catalogue**

```bash
npm run ingest -- images --dry-run
```

Expected: `830 vehicles`, roughly `uploaded 827, skipped 3`, and the three no-url slugs listed. Zero bytes transferred.

If the counts differ materially from 827/3, stop and report — the selection logic disagrees with the CMS and that must be understood before writing anything.

- [ ] **Step 2: Five drafts, which no visitor can see**

```bash
npm run ingest -- images --status draft --limit 5
```

Then in Directus, open one of the five files and confirm `width: 1536`, `height: 864`, the `<slug>@2x.jpg` name, and the vehicles folder.

- [ ] **Step 3: The remaining drafts**

```bash
npm run ingest -- images --status draft
```

Expected: ~263 uploaded.

- [ ] **Step 4: Five published, then look at the site**

```bash
npm run ingest -- images --status published --limit 5
```

Open one of those five vehicle pages on a phone. This is the case that prompted the work — the card image should be visibly sharper than its neighbours, which still carry the 448px source.

If it is not better, stop. Repoint those five back to their previous file (still present) and report.

- [ ] **Step 5: The remaining published**

```bash
npm run ingest -- images --status published
```

- [ ] **Step 6: Confirm idempotence against the live CMS**

```bash
npm run ingest -- images --dry-run
```

Expected: `uploaded 0, skipped 830` (the 3 without urls among them). A non-zero upload count means the skip test does not match what was written, which is the loop this design exists to avoid.

- [ ] **Step 7: Document the command**

Add an `images` section to `docs/vehicle-ingest.md` covering: the required proxy variables, that the command fails closed without them, `--status` and `--limit`, that it is idempotent and safe to re-run, that old files are kept as the rollback, and that the port is 44445 and not the 33335 in Bright Data's public docs.

- [ ] **Step 8: Commit**

```bash
git add docs/vehicle-ingest.md
git commit -m "docs(images): runbook entry for the images command"
```

---

## Self-Review

**Spec coverage:** every section maps to a task — proxy egress and fail-closed (1), selection/naming/idempotence (2), CMS read with both thumbnail fields (3), orchestration, error handling and the injected seams (4), CLI with `--status`/`--limit`/`--dry-run` (5), staged rollout and docs (6). The conventions (folder, title, filename change) are carried in Tasks 2 and 5; the "never delete" rule is enforced structurally in Task 4 by the absence of a delete seam and asserted by a test.

**Type consistency:** `ThumbnailCandidate` (Task 2) is consumed by Tasks 3 and 4. `ThumbnailSeams` and `ThumbnailResult` (Task 4) are consumed by Task 5. `readProxyConfig`/`createDispatcher` (Task 1) are consumed by Task 5. `TARGET_WIDTH` is used in Tasks 2 and 4's tests. `thumbnailFilename` is used by Task 2's skip test and Task 4's upload call — the same function, so the marker written and the marker read cannot diverge.

**A defect found during this review, already fixed above:** the upload
originally went through `directusFetch`, with `headers: {}` meant to clear the
JSON content type. Reading `src/lib/directus.ts` shows it sets
`Content-Type: application/json` *before* spreading `init.headers`, so an empty
object cannot remove it and the multipart boundary would never be sent — the
upload would have failed for all 830 vehicles. Task 5 now calls
`${DIRECTUS_URL}/files` directly with the bearer set by hand and no content
type, letting `FormData` supply its own.

**What remains unverified:** the upload itself has been exercised once, by
hand, with `curl -F` — it returned a file whose `width` Directus recorded as
1536. It has not been exercised from Node with `FormData` and `Blob`. If that
shape is rejected, it surfaces at Task 6 Step 2, on five draft vehicles no
visitor can see.
