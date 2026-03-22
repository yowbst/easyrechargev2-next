import Link from "next/link";

import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { MobileMenu } from "./MobileMenu";
import { NavLink } from "./NavLink";

import { t } from "@/lib/i18n/dictionaries";
import type { PageRegistryEntry } from "@/lib/directus-queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LayoutData = Record<string, any>;

interface HeaderProps {
  lang: string;
  layoutData: LayoutData;
  dictionary: Record<string, string>;
  pageRegistry: PageRegistryEntry[];
}

function resolveNavHref(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any,
  lang: string,
  pageRegistry: PageRegistryEntry[],
): string | null {
  if (item.type === "external") return item.url;

  const page = typeof item.page === "string" ? null : item.page;
  if (!page?.route_id) return null;

  // Home page → language root
  if (page.route_id === "home") return `/${lang}`;

  const entry = pageRegistry.find((p) => p.id === page.route_id);
  const slug = entry?.slugs[lang];
  if (slug) return `/${lang}/${slug}`;

  return null;
}

export function Header({
  lang,
  layoutData,
  dictionary,
  pageRegistry,
}: HeaderProps) {
  const headerNavItems = layoutData?.header_navigation?.items || [];
  const headerConfig = layoutData?.header_config || {};

  const logoSrc = "/logo-color.svg";
  const logoDarkSrc = "/logo-white.svg";

  // Build nav links
  const navLinks = headerNavItems
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((item: any) => item.variant === "link")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => {
      const href = resolveNavHref(item, lang, pageRegistry);
      if (!href) return null;
      const navCount = headerConfig?.nav_counts?.[item.key];
      const label = t(
        dictionary,
        `layout.nav.header.${item.key}`,
        navCount != null ? { count: navCount } : undefined,
      );
      return {
        id: item.id || item.key,
        href,
        label,
        variant: "link" as const,
        external: item.type === "external",
        openInNewTab: item.open_in_new_tab,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    href: string;
    label: string;
    variant: "link" | "button";
    external?: boolean;
    openInNewTab?: boolean;
  }>;

  // CTA button
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctaItem = headerNavItems.find((item: any) => item.variant === "button");
  let ctaLink: (typeof navLinks)[number] | null = null;
  if (ctaItem) {
    const ctaHref = resolveNavHref(ctaItem, lang, pageRegistry);
    if (ctaHref) {
      ctaLink = {
        id: ctaItem.id || ctaItem.key,
        href: ctaHref,
        label: t(dictionary, `layout.nav.header.${ctaItem.key}`),
        variant: "button",
        external: ctaItem.type === "external",
        openInNewTab: ctaItem.open_in_new_tab,
      };
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href={`/${lang}`} title="easyRecharge" className="flex items-center" data-testid="link-home">
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt="easyRecharge"
              className="h-10 dark:hidden"
              style={{ width: "auto", height: "2.5rem" }}
              data-testid="img-logo"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoDarkSrc}
              alt="easyRecharge"
              className="h-10 hidden dark:block"
              style={{ width: "auto", height: "2.5rem" }}
            />
          </>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((item) => (
            <NavLink
              key={item.id}
              href={item.href}
              title={item.label}
              data-testid={`link-nav-${item.id}`}
              className="text-sm font-medium transition-colors hover:text-primary"
              activeClassName="text-primary"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {headerConfig?.show_language_selector && (
            <LanguageSwitcher pageRegistry={pageRegistry} />
          )}
          {headerConfig?.show_theme_toggle && <ThemeToggle />}

          {/* Desktop CTA */}
          {ctaLink &&
            (ctaLink.external ? (
              <a
                href={ctaLink.href}
                title={ctaLink.label}
                target={ctaLink.openInNewTab ? "_blank" : "_self"}
                rel={ctaLink.openInNewTab ? "noopener noreferrer" : undefined}
                className="hidden md:inline-flex w-44 items-center justify-center rounded-lg bg-primary text-primary-foreground [a]:hover:bg-primary/80 h-8 px-2.5 text-sm font-medium transition-all"
                data-testid="button-header-quote"
              >
                {ctaLink.label}
              </a>
            ) : (
              <Link
                href={ctaLink.href}
                title={ctaLink.label}
                className="hidden md:inline-flex w-44 items-center justify-center rounded-lg bg-primary text-primary-foreground [a]:hover:bg-primary/80 h-8 px-2.5 text-sm font-medium transition-all"
                data-testid="button-header-quote"
              >
                {ctaLink.label}
              </Link>
            ))}

          {/* Mobile Menu (Client Component) */}
          <MobileMenu navLinks={navLinks} ctaLink={ctaLink} />
        </div>
      </div>
    </header>
  );
}
