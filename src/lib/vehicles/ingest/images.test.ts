import { describe, it, expect, vi } from "vitest";
import {
  pickImageUrl,
  thumbnailFilename,
  thumbnailTitle,
  needsThumbnailUpgrade,
  upgradeThumbnails,
  TARGET_WIDTH,
  type ThumbnailCandidate,
  type ThumbnailSeams,
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
