import { describe, it, expect } from "vitest";
import { dropdownPlacement, NAV_BAR_CLEARANCE } from "./dropdownPlacement";

describe("dropdownPlacement", () => {
  it("opens down when there is ample room below", () => {
    expect(dropdownPlacement({ top: 100, bottom: 140 }, 800)).toBe("down");
  });

  it("opens up when the input sits just above the fixed nav bar", () => {
    // 800px viewport, input bottom at 700 → 100px below minus nav clearance < min height
    expect(dropdownPlacement({ top: 660, bottom: 700 }, 800)).toBe("up");
  });

  it("still opens down when above is even tighter than below", () => {
    expect(dropdownPlacement({ top: 40, bottom: 80 }, 300)).toBe("down");
  });

  it("exports the nav bar clearance used by the layout", () => {
    expect(NAV_BAR_CLEARANCE).toBeGreaterThanOrEqual(64);
  });
});
