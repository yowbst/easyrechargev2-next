import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({ directusFetch: vi.fn() }));

describe("buildInstallationCantonEntries", () => {
  it("emits one French URL per canton, without a German alternate", async () => {
    const { buildInstallationCantonEntries } = await import("./registries");
    const entries = buildInstallationCantonEntries("installation-borne-de-recharge", ["vaud", "valais"], "2026-11-21T08:00:00Z");
    expect(entries.map((e) => new URL(e.url).pathname)).toEqual([
      "/fr/installation-borne-de-recharge/vaud",
      "/fr/installation-borne-de-recharge/valais",
    ]);
    expect(entries[0].lastModified).toBe("2026-11-21T08:00:00Z");
    expect(Object.keys(entries[0].alternates!.languages)).toEqual(["x-default", "fr"]);
  });
});
