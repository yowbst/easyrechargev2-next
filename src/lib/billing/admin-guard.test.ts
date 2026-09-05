import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertAdmin, errorStatus } from "./admin-guard";

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
    ["missing_invoice_code", 500],
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
