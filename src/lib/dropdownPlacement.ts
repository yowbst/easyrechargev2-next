// The quote form has a fixed bottom nav bar (~72px, z-50). A dropdown
// opening downward near the bottom of the viewport lands under it, so we
// flip upward when the usable space below the input is too small, and cap
// the dropdown's height to the space actually available in the chosen
// direction so it never extends off-screen on short viewports.
//
// The clearance is opt-in (`bottomClearance`) because PlaceAutocomplete is
// also used on pages without the fixed nav bar (e.g. ContactForm).

export const NAV_BAR_CLEARANCE = 72;

const MIN_DROPDOWN_HEIGHT = 160; // ~3 suggestion rows
const MAX_DROPDOWN_HEIGHT = 240; // matches the previous max-h-60
const EDGE_MARGIN = 8;

export function dropdownPlacement(
  input: { top: number; bottom: number },
  viewportHeight: number,
  bottomClearance = 0,
): { placement: "down" | "up"; maxHeight: number } {
  const usableBelow = viewportHeight - input.bottom - bottomClearance - EDGE_MARGIN;
  const usableAbove = input.top - EDGE_MARGIN;
  const placement: "down" | "up" =
    usableBelow >= MIN_DROPDOWN_HEIGHT || usableBelow >= usableAbove ? "down" : "up";
  const maxHeight = Math.max(
    96,
    Math.min(MAX_DROPDOWN_HEIGHT, placement === "down" ? usableBelow : usableAbove),
  );
  return { placement, maxHeight };
}
