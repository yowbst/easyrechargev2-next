import { beforeEach, describe, expect, it, vi } from "vitest";

const paths: string[] = [];
vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string) => {
    paths.push(decodeURIComponent(path));
    return { data: [{ id: "inv-1" }] };
  }),
}));
vi.mock("@/lib/directus-storage", () => ({ getEnvironment: () => "production" }));

import { listInvoices } from "./invoice";

beforeEach(() => { paths.length = 0; });

describe("listInvoices", () => {
  it("lists newest first, scoped to the current environment", async () => {
    expect(await listInvoices()).toEqual([{ id: "inv-1" }]);
    expect(paths[0]).toContain("sort=-issued_at");
    // A staging invoice must never appear in a production listing.
    expect(paths[0]).toContain("filter[environment][_eq]=production");
    expect(paths[0]).not.toContain("filter[period_month]");
    expect(paths[0]).not.toContain("filter[status]");
  });

  it("filters by month and status when given", async () => {
    await listInvoices({ month: "2026-08", status: "sent" });
    expect(paths[0]).toContain("filter[period_month][_eq]=2026-08");
    expect(paths[0]).toContain("filter[status][_eq]=sent");
  });
});
