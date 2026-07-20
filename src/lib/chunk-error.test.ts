import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./chunk-error";

/**
 * Chunk-load failures happen when a stale tab loads a `next/dynamic` chunk that
 * a newer Vercel deploy has already replaced. They surface either as an error
 * named "ChunkLoadError" or with a "Loading chunk … failed" message, and the
 * error boundary must recognise both to force a full reload.
 */
describe("isChunkLoadError", () => {
  it("detects errors named ChunkLoadError", () => {
    const err = new Error("boom");
    err.name = "ChunkLoadError";
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("detects the 'Loading chunk … failed' message", () => {
    expect(
      isChunkLoadError(new Error("Loading chunk 4823 failed.\n(missing: …)")),
    ).toBe(true);
  });

  it("detects plain objects (non-Error) with a matching name", () => {
    expect(isChunkLoadError({ name: "ChunkLoadError" })).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isChunkLoadError(new Error("TypeError: x is not a function"))).toBe(
      false,
    );
    expect(isChunkLoadError(new Error("Something went wrong"))).toBe(false);
  });

  it("handles null/undefined safely", () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
