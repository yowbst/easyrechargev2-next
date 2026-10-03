"use client";

import { useEffect, useRef } from "react";

// Shared guard: when one answer reveals several fields at once, only the
// topmost (first effect to fire) scrolls — competing smooth-scrolls cancel
// each other and land nowhere.
const lastRevealScroll = { at: 0 };

/** Progressive reveal: hidden until `visible`, then slides down and scrolls into view. */
export function RevealField({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Mounted-already-visible (filled step re-entered) must NOT scroll — only user-triggered reveals.
  const hasBeenVisible = useRef(visible);

  useEffect(() => {
    if (visible && !hasBeenVisible.current) {
      hasBeenVisible.current = true;
      const timer = setTimeout(() => {
        const now = Date.now();
        if (now - lastRevealScroll.at < 400) return;
        lastRevealScroll.at = now;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        ref.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      }, 320);
      return () => clearTimeout(timer);
    }
    if (!visible) hasBeenVisible.current = false;
  }, [visible]);

  return (
    <div
      ref={ref}
      inert={!visible}
      className={`transition-all duration-300 ease-out ${
        visible
          ? "opacity-100 max-h-[2000px] translate-y-0"
          : "opacity-0 max-h-0 overflow-hidden translate-y-2 pointer-events-none"
      }`}
    >
      {children}
    </div>
  );
}
