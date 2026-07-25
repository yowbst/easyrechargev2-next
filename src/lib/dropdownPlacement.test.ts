import { describe, it, expect } from "vitest";
import { dropdownPlacement, NAV_BAR_CLEARANCE } from "./dropdownPlacement";

describe("dropdownPlacement", () => {
  it("opens down when there is ample room below", () => {
    const result = dropdownPlacement({ top: 100, bottom: 140 }, 800);
    expect(result.placement).toBe("down");
    expect(result.maxHeight).toBe(240);
  });

  it("opens up when the input sits just above the fixed nav bar", () => {
    // 800px viewport, input bottom at 700 → 100px below minus nav clearance < min height
    const result = dropdownPlacement({ top: 660, bottom: 700 }, 800, NAV_BAR_CLEARANCE);
    expect(result.placement).toBe("up");
    expect(result.maxHeight).toBe(240);
  });

  it("still opens down when above is even tighter than below", () => {
    const result = dropdownPlacement({ top: 40, bottom: 80 }, 300, NAV_BAR_CLEARANCE);
    expect(result.placement).toBe("down");
    // capped to the space actually available below (300 - 80 - 72 - 8)
    expect(result.maxHeight).toBe(140);
  });

  it("with no bottom clearance an input near the bottom still opens down when it has room", () => {
    // 800px viewport, bottom at 600 → 192px usable below with clearance 0, ≥160 min
    const result = dropdownPlacement({ top: 560, bottom: 600 }, 800, 0);
    expect(result.placement).toBe("down");
    expect(result.maxHeight).toBe(192);
  });

  it("caps maxHeight to the available side on a short viewport so nothing renders off-screen", () => {
    // 360px-tall viewport (mobile landscape + keyboard), input centered
    const result = dropdownPlacement({ top: 160, bottom: 200 }, 360);
    const available = result.placement === "down" ? 360 - 200 - 8 : 160 - 8;
    expect(result.maxHeight).toBeLessThan(240);
    expect(result.maxHeight).toBeLessThanOrEqual(available);
  });

  it("exports the nav bar clearance used by the layout", () => {
    expect(NAV_BAR_CLEARANCE).toBeGreaterThanOrEqual(64);
  });
});
