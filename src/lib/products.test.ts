import { describe, it, expect } from "vitest";
import { PRODUCTS, DEFAULT_PRODUCT, normalizeProduct, isProduct } from "./products";

describe("products", () => {
  it("declares ecp as the default product", () => {
    expect(DEFAULT_PRODUCT).toBe("ecp");
    expect(PRODUCTS).toContain("ecp");
  });

  it("normalizeProduct passes through valid keys", () => {
    expect(normalizeProduct("ecp")).toBe("ecp");
  });

  it("normalizeProduct falls back to the default for unknown/missing input", () => {
    expect(normalizeProduct("solar")).toBe("ecp");
    expect(normalizeProduct(undefined)).toBe("ecp");
    expect(normalizeProduct(null)).toBe("ecp");
    expect(normalizeProduct(42)).toBe("ecp");
    expect(normalizeProduct({})).toBe("ecp");
  });

  it("isProduct narrows correctly", () => {
    expect(isProduct("ecp")).toBe(true);
    expect(isProduct("ECP")).toBe(false);
    expect(isProduct("")).toBe(false);
  });
});
