"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
}

export function NavLink({ href, children, className = "", activeClassName = "text-primary" }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={`${className} ${isActive ? activeClassName : "text-foreground"}`}
    >
      {children}
    </Link>
  );
}
