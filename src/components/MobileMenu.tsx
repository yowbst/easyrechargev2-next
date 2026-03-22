"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

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
}

export function MobileMenu({ navLinks, ctaLink }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + "/");

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        data-testid="button-mobile-menu"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {open && (
        <div className="md:hidden border-t bg-background absolute top-16 left-0 right-0 z-50">
          <nav className="container mx-auto flex flex-col gap-4 p-4">
            {navLinks.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                title={item.label}
                data-testid={`link-mobile-${item.id}`}
                onClick={() => setOpen(false)}
                className={`text-sm font-medium ${
                  isActive(item.href) ? "text-primary" : "text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}

            {ctaLink &&
              (ctaLink.external ? (
                <a
                  href={ctaLink.href}
                  title={ctaLink.label}
                  target={ctaLink.openInNewTab ? "_blank" : "_self"}
                  rel={ctaLink.openInNewTab ? "noopener noreferrer" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(buttonVariants(), "w-full")}
                  data-testid="button-mobile-quote"
                >
                  {ctaLink.label}
                </a>
              ) : (
                <Link
                  href={ctaLink.href}
                  title={ctaLink.label}
                  onClick={() => setOpen(false)}
                  className={cn(buttonVariants(), "w-full")}
                  data-testid="button-mobile-quote"
                >
                  {ctaLink.label}
                </Link>
              ))}
          </nav>
        </div>
      )}
    </>
  );
}
