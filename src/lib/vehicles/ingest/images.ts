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

/**
 * Smallest byte count a real 1536x864 vehicle photo can plausibly have. The
 * six sources sampled from EV Database were 250-280 KB; a proxy interstitial
 * or an error page is orders of magnitude smaller.
 */
export const MIN_IMAGE_BYTES = 10_000;

/**
 * Rejects anything that is not a JPEG, or is too small to be a photo.
 *
 * This guard is load-bearing, not defensive padding. A block page or error
 * page served with HTTP 200 would otherwise be uploaded under our own
 * `<slug>@2x.jpg` marker; Directus would record `width: null` for it (it is
 * not an image it can measure), and `needsThumbnailUpgrade` would then skip
 * the width test and match the filename — marking that vehicle permanently
 * done, with a broken image, uncounted and unreachable by re-running. The
 * filename marker is what makes this command idempotent, and it must only
 * ever be written over bytes we have confirmed are a photo.
 *
 * Throwing is the right outcome: the caller counts it as a failure, prints
 * it, and a later run retries that vehicle.
 */
export function assertJpegBytes(bytes: Uint8Array, url: string): void {
  if (bytes.length < MIN_IMAGE_BYTES) {
    throw new Error(
      `download for ${url} returned ${bytes.length} bytes — too small to be a vehicle photo`,
    );
  }
  // JPEG SOI marker: FF D8 FF.
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
    const head = Array.from(bytes.slice(0, 3))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    throw new Error(`download for ${url} is not a JPEG (starts with ${head})`);
  }
}

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
  /**
   * Vehicles that needed an upgrade but were never attempted because
   * `--limit` truncated the run before reaching them. Without this bucket
   * those vehicles vanish from every counter: `uploaded + skipped + failed`
   * would silently fall short of `vehicles.length` and an operator would
   * have no way to tell that work remains.
   */
  notAttempted: number;
}

/**
 * There is deliberately no delete seam. The previous file stays: rollback is
 * repointing `thumbnail`, and nothing in this pipeline has ever deleted.
 *
 * One failure never aborts the run — across ~830 network round-trips,
 * stopping at the first error would make the command unusable.
 *
 * Invariant: for every input, `uploaded + skipped + failed + notAttempted`
 * always equals `vehicles.length`.
 */
export async function upgradeThumbnails(
  vehicles: ThumbnailCandidate[],
  seams: ThumbnailSeams,
  opts: { dryRun: boolean; limit?: number; onProgress?: (done: number, total: number) => void },
): Promise<ThumbnailResult> {
  const todo = vehicles.filter(needsThumbnailUpgrade);
  const skippedAlreadyDone = vehicles.length - todo.length;

  const selected = typeof opts.limit === "number" ? todo.slice(0, opts.limit) : todo;
  const notAttempted = todo.length - selected.length;

  const result: ThumbnailResult = {
    uploaded: 0,
    skipped: skippedAlreadyDone,
    failed: 0,
    failures: [],
    noUrl: [],
    notAttempted,
  };

  for (const [i, vehicle] of selected.entries()) {
    try {
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
    } finally {
      // Runs on every path — no-URL skip, dryRun, success, or failure —
      // so progress reflects every selected vehicle, not just the ones
      // that reached the network calls.
      opts.onProgress?.(i + 1, selected.length);
    }
  }

  return result;
}
