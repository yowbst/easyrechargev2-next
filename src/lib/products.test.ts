import { describe, it, expect } from "vitest";
import {
  PRODUCTS,
  DEFAULT_PRODUCT,
  normalizeProduct,
  isProduct,
  FUNNEL_ROUTES,
  isFunnelRoute,
  funnelRouteFor,
  successPageIds,
  viewPageIds,
} from "./products";

describe("products", () => {
  it("declares ecp as the default product and battery as the second", () => {
    expect(DEFAULT_PRODUCT).toBe("ecp");
    expect(PRODUCTS).toEqual(["ecp", "battery"]);
  });

  it("normalizeProduct passes through valid keys", () => {
    expect(normalizeProduct("ecp")).toBe("ecp");
    expect(normalizeProduct("battery")).toBe("battery");
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
    expect(isProduct("battery")).toBe(true);
    expect(isProduct("ECP")).toBe(false);
    expect(isProduct("")).toBe(false);
  });
});

describe("funnel routes", () => {
  it("maps each funnel page to its product", () => {
    expect(FUNNEL_ROUTES.quote).toBe("ecp");
    expect(FUNNEL_ROUTES["quote-battery"]).toBe("battery");
  });

  it("recognises funnel pages and nothing else", () => {
    expect(isFunnelRoute("quote")).toBe(true);
    expect(isFunnelRoute("quote-battery")).toBe(true);
    expect(isFunnelRoute("contact")).toBe(false);
    expect(isFunnelRoute("toString")).toBe(false);
  });

  it("finds the funnel page of a product", () => {
    expect(funnelRouteFor("ecp")).toBe("quote");
    expect(funnelRouteFor("battery")).toBe("quote-battery");
  });

  it("lists success and view pages most specific first, charger last", () => {
    expect(successPageIds("ecp")).toEqual(["quote-success"]);
    expect(successPageIds("battery")).toEqual(["quote-battery-success", "quote-success"]);
    expect(viewPageIds("ecp")).toEqual(["quote-view"]);
    expect(viewPageIds("battery")).toEqual(["quote-battery-view", "quote-view"]);
  });
});
