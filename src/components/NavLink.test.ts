import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { isActivePath } from "./NavLink";

describe("isActivePath", () => {
  it("marks a section and its sub-pages", () => {
    expect(isActivePath("/fr/vehicules", "/fr/vehicules")).toBe(true);
    expect(isActivePath("/fr/vehicules/tesla/model-3", "/fr/vehicules")).toBe(true);
    expect(isActivePath("/fr/vehicules-occasion", "/fr/vehicules")).toBe(false);
  });

  it("keeps the home link active on the home page only", () => {
    expect(isActivePath("/fr", "/fr")).toBe(true);
    expect(isActivePath("/fr/blog", "/fr")).toBe(false);
  });
});
