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
