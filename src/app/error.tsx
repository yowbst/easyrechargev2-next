"use client";

import { useEffect } from "react";

import { isChunkLoadError } from "@/lib/chunk-error";

// Guards against a refresh loop: we force at most one reload per session when a
// chunk goes missing. If the page still errors after reloading against the new
// build, something else is genuinely broken and we fall through to the UI below.
const CHUNK_RELOAD_FLAG = "chunk-reload-attempted";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    import("posthog-js").then(({ default: posthog }) => {
      if (posthog.__loaded) posthog.captureException(error);
    }).catch(() => {});
  }, [error]);

  useEffect(() => {
    if (!isChunkLoadError(error)) return;
    if (typeof window === "undefined") return;

    try {
      if (window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return;
      window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1");
    } catch {
      // sessionStorage may be unavailable (private mode, blocked storage);
      // reloading once without the guard is still better than a stuck page.
    }

    // reset() cannot recover a permanently-missing chunk — force a full reload
    // so the browser fetches the current deploy's chunks.
    window.location.reload();
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-4">Something went wrong</h1>
        <p className="text-muted-foreground mb-6">
          An unexpected error occurred. Please try refreshing the page.
        </p>
        <button
          onClick={() => reset()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
