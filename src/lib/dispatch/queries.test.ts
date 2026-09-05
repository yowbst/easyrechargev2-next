import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async () => { throw new Error("directus down"); }),
}));

describe("fetchDispatchConfig fallback", () => {
  it("falls back to a 15-day acceptance window", async () => {
    const { fetchDispatchConfig } = await import("./queries");
    const cfg = await fetchDispatchConfig();
    expect(cfg.billing.acceptance_window_days).toBe(15);
    expect(cfg.billing.currency).toBe("CHF");
  });
});
