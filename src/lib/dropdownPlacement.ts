// The quote form has a fixed bottom nav bar (~72px, z-50). A dropdown
// opening downward near the bottom of the viewport lands under it, so we
// flip upward when the usable space below the input is too small.

export const NAV_BAR_CLEARANCE = 72;

const MIN_DROPDOWN_HEIGHT = 160; // ~3 suggestion rows

export function dropdownPlacement(
  input: { top: number; bottom: number },
  viewportHeight: number,
): "down" | "up" {
  const usableBelow = viewportHeight - input.bottom - NAV_BAR_CLEARANCE;
  if (usableBelow >= MIN_DROPDOWN_HEIGHT) return "down";
  return input.top > usableBelow ? "up" : "down";
}
