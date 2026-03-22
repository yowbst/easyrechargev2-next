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

export function NavLink({ href, children, className = "", activeClassName = "text-primary", title, "data-testid": testId, onClick }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      title={title}
      data-testid={testId}
      onClick={onClick}
      className={`${className} ${isActive ? activeClassName : "text-foreground"}`}
    >
      {children}
    </Link>
  );
}
