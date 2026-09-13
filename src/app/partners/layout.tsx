/**
 * Partner-space shell.
 *
 * The only job of this layout is to mark the subtree with
 * `data-partner-shell`. `globals.css` hooks `html:has([data-partner-shell])`
 * off that attribute and swaps in the Direction B palette and type for the
 * whole document — which is what lets the sidebar's mobile Sheet and every
 * popover/tooltip portal (all of which mount on document.body, outside this
 * subtree) pick the partner palette up too.
 *
 * `display: contents` keeps the wrapper out of the layout box tree, so the
 * sidebar's own flex/grid sizing is unaffected by its presence.
 */
export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-partner-shell className="contents">
      {children}
    </div>
  );
}
