import { describe, expect, it, vi } from "vitest";
import { errorBody, errorStatus } from "./admin-guard";

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
