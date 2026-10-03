import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ data: [] })));

vi.mock("@/lib/directus", () => ({ directusFetch: fetchMock }));
vi.mock("@/lib/directus-storage", () => ({ getEnvironment: () => "production" }));

afterEach(() => fetchMock.mockClear());

const query = () => decodeURIComponent(String(fetchMock.mock.calls[0][0]));

describe("listDispatches", () => {
  it("returns product and lead category, and filters by product", async () => {
    const { listDispatches } = await import("./admin");
    await listDispatches({ product: "battery" });

    expect(query()).toMatch(/fields=[^&]*\bproduct\b/);
    expect(query()).toMatch(/fields=[^&]*\blead_category\b/);
    expect(query()).toContain("filter[product][_eq]=battery");
  });

  it("does not filter by product when none is given", async () => {
    const { listDispatches } = await import("./admin");
    await listDispatches();

    expect(query()).not.toContain("filter[product]");
  });
});
