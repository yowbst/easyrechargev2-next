import { describe, expect, it } from "vitest";
import { normalizeAssetQuery, sanitizeTransformParams } from "./route";

const CANONICAL = "?format=webp&quality=80&width=1200&height=630&fit=cover";

describe("normalizeAssetQuery", () => {
  it("leaves a clean query string untouched", () => {
    expect(normalizeAssetQuery(CANONICAL)).toBe(CANONICAL);
  });

  it("repairs literal backslash separators (\\u0026)", () => {
    const mangled = "?format=webp\\u0026quality=80\\u0026width=1200\\u0026height=630\\u0026fit=cover";
    expect(normalizeAssetQuery(mangled)).toBe(CANONICAL);
  });

  it("repairs percent-encoded backslash separators (%5Cu0026)", () => {
    const mangled = "?format=webp%5Cu0026quality=80%5Cu0026width=1200%5Cu0026height=630%5Cu0026fit=cover";
    expect(normalizeAssetQuery(mangled)).toBe(CANONICAL);
  });

  it("repairs the bare u0026 separator variant (backslash dropped)", () => {
    const mangled = "?format=webpu0026quality=80u0026width=1200u0026height=630u0026fit=cover";
    expect(normalizeAssetQuery(mangled)).toBe(CANONICAL);
  });

  it("repairs &amp; entity separators", () => {
    const mangled = "?format=webp&amp;quality=80&amp;width=1200&amp;height=630&amp;fit=cover";
    expect(normalizeAssetQuery(mangled)).toBe(CANONICAL);
  });

  it("returns an empty search unchanged", () => {
    expect(normalizeAssetQuery("")).toBe("");
  });
});

describe("sanitizeTransformParams", () => {
  it("keeps a full set of valid transform params", () => {
    expect(sanitizeTransformParams(CANONICAL)).toBe(CANONICAL);
  });

  it("drops a truncated format value (e.g. bot-truncated `format=we`)", () => {
    expect(sanitizeTransformParams("?format=we")).toBe("");
  });

  it("keeps the valid params and drops only the malformed one", () => {
    expect(sanitizeTransformParams("?format=we&quality=80&width=1200")).toBe(
      "?quality=80&width=1200",
    );
  });

  it("drops non-numeric or out-of-range dimensions and quality", () => {
    expect(sanitizeTransformParams("?width=abc&height=-5&quality=999")).toBe("");
  });

  it("drops unknown params entirely", () => {
    expect(sanitizeTransformParams("?evil=1&width=800")).toBe("?width=800");
  });

  it("drops an invalid fit value", () => {
    expect(sanitizeTransformParams("?fit=squish&format=webp")).toBe("?format=webp");
  });

  it("returns an empty search unchanged", () => {
    expect(sanitizeTransformParams("")).toBe("");
  });

  it("collapses a bot request with no salvageable params to empty", () => {
    // After normalizeAssetQuery cannot help (no separators), whitelist yields nothing.
    expect(sanitizeTransformParams("?format=we")).toBe("");
  });
});
