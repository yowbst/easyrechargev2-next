/**
 * Detects a Next.js/webpack chunk-load failure.
 *
 * These occur when a user keeps a stale tab open across a Vercel deploy: the
 * previous build's hashed chunk files are replaced, so any lazily-loaded
 * `next/dynamic` import (or `import()` call) 404s and throws a `ChunkLoadError`.
 * A React error boundary's `reset()` cannot recover from this — the chunk is
 * permanently gone — so the only fix is a full-page reload against the new build.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  if (name === "ChunkLoadError") return true;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : "";

  return /Loading chunk .* failed/i.test(message);
}
