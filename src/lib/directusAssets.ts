const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_DIRECTUS_URL || "";

export function directusAssetUrl(fileId?: string | null) {
  if (!DIRECTUS_URL || !fileId) return null;
  return `${DIRECTUS_URL.replace(/\/$/, "")}/assets/${fileId}`;
}

/** Build a CMS asset URL with Directus image transforms. */
function cmsUrl(path: string, width: number, quality = 75) {
  // For direct Directus URLs, append transforms
  if (path.includes("/assets/")) {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}width=${width}&quality=${quality}&format=webp`;
  }
  return `${path}?width=${width}&quality=${quality}&format=webp`;
}

/**
 * Returns optimised src/srcSet/sizes for a CMS image path.
 *
 * Usage:
 *   <img {...cmsImage(url, [400, 700])} loading="lazy" />
 */
export function cmsImage(
  src: string,
  widths: number[] = [640, 1024],
  opts?: { quality?: number },
) {
  const q = opts?.quality ?? 75;
  const largest = Math.max(...widths);
  return {
    src: cmsUrl(src, largest, q),
    srcSet: widths.map((w) => `${cmsUrl(src, w, q)} ${w}w`).join(", "),
    sizes: widths
      .slice(0, -1)
      .map((w) => `(max-width: ${w}px) ${w}px`)
      .concat([`${largest}px`])
      .join(", "),
  };
}

/** Return a single optimised URL for use in CSS background-image. */
export function cmsBgImage(src: string, width = 1920, quality = 75) {
  return cmsUrl(src, width, quality);
}
