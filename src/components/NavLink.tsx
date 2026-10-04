"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  title?: string;
  "data-testid"?: string;
  onClick?: () => void;
}

/** Home (`/fr`) is only active on itself, not on every page under it. */
export function isActivePath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (/^\/[a-z]{2}$/.test(href)) return false;
  return pathname.startsWith(href + "/");
}

export function NavLink({ href, children, className = "", activeClassName = "text-primary", title, "data-testid": testId, onClick }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      title={title}
      data-testid={testId}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={`${className} ${isActive ? activeClassName : "text-foreground"}`}
    >
      {children}
    </Link>
  );
}
