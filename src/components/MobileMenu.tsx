"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { isActivePath } from "./NavLink";

interface NavLink {
  id: string;
  href: string;
  label: string;
  variant: "link" | "button";
  external?: boolean;
  openInNewTab?: boolean;
}

interface MobileMenuProps {
  navLinks: NavLink[];
  ctaLink?: NavLink | null;
  labels?: { open?: string; close?: string; nav?: string; theme?: string };
  /** Rendered in the panel: the bar has no room for it below `xl`. */
  themeToggle?: React.ReactNode;
}

/** Matches the header's `xl` breakpoint, where the inline navigation takes over. */
const DESKTOP_QUERY = "(min-width: 1280px)";

/**
 * Panel under the 64 px header (design 09 Header, 9f): links of 56 px, a
 * full-width CTA, and a veil over the page that closes the menu when tapped.
 * Also closes on Escape, on navigation and when the viewport reaches the
 * desktop layout.
 */
export function MobileMenu({ navLinks, ctaLink, labels = {}, themeToggle }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  // A route change always closes the panel, whichever link triggered it.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onResize = () => {
      if (desktop.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
    };
  }, [open]);

  const linkProps = (item: NavLink) =>
    item.external
      ? {
          target: item.openInNewTab ? "_blank" : "_self",
          rel: item.openInNewTab ? "noopener noreferrer" : undefined,
        }
      : {};

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? (labels.close ?? "Fermer le menu") : (labels.open ?? "Ouvrir le menu")}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-b-inset focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-expanded:bg-b-inset xl:hidden"
        data-testid="button-mobile-menu"
      >
        {open ? <X className="h-5.5 w-5.5" aria-hidden /> : <Menu className="h-5.5 w-5.5" aria-hidden />}
      </button>

      {open && (
        <>
          <div
            aria-hidden
            onClick={close}
            className="fixed inset-x-0 top-16 bottom-0 z-40 bg-[rgba(7,35,26,.4)] xl:hidden"
          />
          <div
            id="mobile-menu"
            className="absolute inset-x-0 top-16 z-50 border-b border-border bg-b-paper shadow-[0_24px_40px_-24px_rgba(7,35,26,.35)] xl:hidden"
          >
            <nav aria-label={labels.nav ?? "Navigation principale"} className="container mx-auto flex flex-col px-5 pt-2">
              {navLinks.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Tag = item.external ? "a" : Link;
                return (
                  <Tag
                    key={item.id}
                    href={item.href}
                    {...linkProps(item)}
                    aria-current={active ? "page" : undefined}
                    onClick={close}
                    data-testid={`link-mobile-${item.id}`}
                    className={`flex min-h-14 items-center justify-between border-b border-border px-1 text-lg leading-snug text-foreground ${active ? "font-semibold" : "font-medium"}`}
                  >
                    {item.label}
                    <ArrowRight className="h-4.5 w-4.5 text-muted-foreground" aria-hidden />
                  </Tag>
                );
              })}
            </nav>

            {themeToggle && (
              <div className="container mx-auto flex min-h-14 items-center justify-between border-b border-border px-6 text-lg font-medium text-foreground">
                <span aria-hidden>{labels.theme ?? "Thème"}</span>
                {themeToggle}
              </div>
            )}

            {ctaLink && (
              <div className="container mx-auto px-5 pt-4 pb-5">
                {(() => {
                  const Tag = ctaLink.external ? "a" : Link;
                  return (
                    <Tag
                      href={ctaLink.href}
                      {...linkProps(ctaLink)}
                      onClick={close}
                      className="flex h-13 w-full items-center justify-center gap-2 rounded-md bg-b-forest text-base font-semibold text-b-on-forest transition-colors hover:bg-b-charge hover:text-b-on-charge"
                      data-testid="button-mobile-quote"
                    >
                      {ctaLink.label}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Tag>
                  );
                })()}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
