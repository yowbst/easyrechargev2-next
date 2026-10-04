"use client";

import { useEffect, useState } from "react";

/**
 * The sticky <header> element. At the top of the page it sits flat on the
 * paper; once the page has scrolled past 8 px it gets its bottom border and
 * the translucent, blurred background so it reads as laid over the content
 * (design 09 Header, 9a/9b).
 */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="sticky top-0 z-50 w-full border-b border-transparent bg-b-paper transition-[background-color,border-color] duration-150 data-scrolled:border-border data-scrolled:bg-b-paper/95 data-scrolled:backdrop-blur-md"
    >
      {children}
    </header>
  );
}
