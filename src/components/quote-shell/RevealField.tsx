"use client";

/**
 * Progressive reveal: hidden until `visible`, then slides down (180 ms).
 * It never scrolls by itself: the shell's auto-advance scrolls to the next
 * question after a choice, and a reveal caused by restored or prefilled
 * answers (draft, mini-quote URL) must leave the page where it is.
 */
export function RevealField({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      inert={!visible}
      className={`transition-all duration-180 ease-out motion-reduce:transition-none ${
        visible
          ? "opacity-100 max-h-500 translate-y-0"
          : "opacity-0 max-h-0 overflow-hidden translate-y-2 pointer-events-none"
      }`}
    >
      {children}
    </div>
  );
}
