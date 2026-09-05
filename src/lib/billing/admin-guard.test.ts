import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertAdmin, errorBody, errorStatus } from "./admin-guard";

const ORIGINAL_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

describe("assertAdmin", () => {
  beforeEach(() => {
    process.env.DIRECTUS_STATIC_TOKEN = "test-static-token-abc123";
  });

  afterEach(() => {
    process.env.DIRECTUS_STATIC_TOKEN = ORIGINAL_TOKEN;
  });

  it("returns false when no x-admin-token header is present", () => {
    const req = new Request("http://localhost/api/admin/invoices");
    expect(assertAdmin(req)).toBe(false);
  });

  it("returns false when x-admin-token does not match", () => {
    const req = new Request("http://localhost/api/admin/invoices", {
      headers: { "x-admin-token": "wrong-token" },
    });
    expect(assertAdmin(req)).toBe(false);
  });

  it("returns true when x-admin-token matches DIRECTUS_STATIC_TOKEN", () => {
    const req = new Request("http://localhost/api/admin/invoices", {
      headers: { "x-admin-token": "test-static-token-abc123" },
    });
    expect(assertAdmin(req)).toBe(true);
  });

  it("refuses (returns false) when DIRECTUS_STATIC_TOKEN is unset, even with a header present", () => {
    delete process.env.DIRECTUS_STATIC_TOKEN;
    const req = new Request("http://localhost/api/admin/invoices", {
      headers: { "x-admin-token": "" },
    });
    expect(assertAdmin(req)).toBe(false);
  });

  it("refuses when DIRECTUS_STATIC_TOKEN is unset even if the header happens to be empty on both sides", () => {
    delete process.env.DIRECTUS_STATIC_TOKEN;
    const req = new Request("http://localhost/api/admin/invoices");
    expect(assertAdmin(req)).toBe(false);
  });
});

describe("errorStatus", () => {
  it.each([
    ["invalid_month", 400],
    ["partner_not_found", 404],
    ["invoice_not_found", 404],
    ["period_not_issuable", 409],
    ["unsettled_dispatches", 409],
    ["empty_scope", 409],
    ["duplicate_number", 409],
    ["invalid_transition", 409],
    ["invoice_closed", 409],
    ["mixed_unit_prices", 409],
    ["invalid_amount", 400],
    ["missing_invoice_code", 500],
    ["invoice_create_failed", 500],
    ["scope_limit_exceeded", 500],
  ])("maps %s -> %d", (message, status) => {
    expect(errorStatus(new Error(message))).toBe(status);
  });

  it("maps an unrecognized Error message to 500", () => {
    expect(errorStatus(new Error("something_unexpected"))).toBe(500);
  });

  it("maps a non-Error thrown value to 500", () => {
    expect(errorStatus("plain string")).toBe(500);
    expect(errorStatus(undefined)).toBe(500);
  });
});

describe("errorBody", () => {
  it.each([
    "invalid_month", "partner_not_found", "invoice_not_found", "period_not_issuable",
    "unsettled_dispatches", "empty_scope", "duplicate_number", "invalid_transition",
    "invoice_closed", "mixed_unit_prices", "invalid_amount", "missing_invoice_code",
    "invoice_create_failed", "scope_limit_exceeded",
  ])("returns the message verbatim for the known domain error %s", (message) => {
    expect(errorBody(new Error(message))).toEqual({ error: message });
  });

  it("collapses an unrecognized Error to a generic message and logs it server-side", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const upstream = new Error("Directus 403: forbidden on collection partners, field uid");
    const body = errorBody(upstream);
    expect(body).toEqual({ error: "internal_error" });
    expect(body.error).not.toContain("partners");
    expect(body.error).not.toContain("uid");
    expect(consoleSpy).toHaveBeenCalledWith(expect.any(String), upstream);
    consoleSpy.mockRestore();
  });

  it("collapses a non-Error thrown value to a generic message and logs it server-side", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(errorBody("plain string")).toEqual({ error: "internal_error" });
    expect(errorBody(undefined)).toEqual({ error: "internal_error" });
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });
});
