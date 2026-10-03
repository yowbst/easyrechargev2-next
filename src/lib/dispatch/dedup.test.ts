import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async () => ({ data: [{ partner: "p1" }] })),
}));

afterEach(() => vi.clearAllMocks());

describe("findRecentDispatchesByEmail", () => {
  it("only looks at earlier leads of the same product", async () => {
    const { directusFetch } = await import("@/lib/directus");
    const { findRecentDispatchesByEmail } = await import("./queries");

    await findRecentDispatchesByEmail("a@b.ch", ["p1", "p2"], "production", 30, "battery");

    const url = decodeURIComponent(String(vi.mocked(directusFetch).mock.calls[0][0]));
    expect(url).toContain("filter[product][_eq]=battery");
    expect(url).toContain("filter[submission][user][email][_eq]=a@b.ch");
  });

  it("returns the partners that already received this product's lead", async () => {
    const { findRecentDispatchesByEmail } = await import("./queries");
    const out = await findRecentDispatchesByEmail("a@b.ch", ["p1"], "production", 30, "ecp");
    expect([...out]).toEqual(["p1"]);
  });
});
