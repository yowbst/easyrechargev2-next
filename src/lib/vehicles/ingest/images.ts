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
