import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertAdmin } from "./admin-auth";

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

describe("assertAdmin — length mismatch", () => {
  beforeEach(() => vi.stubEnv("DIRECTUS_STATIC_TOKEN", "the-real-token"));
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a header that is a prefix of the token, or longer than it", () => {
    const req = (token: string) => new Request("http://x", { headers: { "x-admin-token": token } });
    expect(assertAdmin(req("the-real"))).toBe(false);
    expect(assertAdmin(req("the-real-token-and-more"))).toBe(false);
  });
});
