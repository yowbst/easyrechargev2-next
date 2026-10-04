import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { MobileMenu } from "./MobileMenu";
import { NavLink } from "./NavLink";
import { EnvBadge } from "./EnvBadge";
import { HeaderShell } from "./HeaderShell";

import { t } from "@/lib/i18n/dictionaries";
import { opt } from "@/components/home-b/content";
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

  const labels = {
    nav: opt(dictionary, "layout.header.nav_label") ?? "Navigation principale",
    menuOpen: opt(dictionary, "layout.header.menu.open"),
    menuClose: opt(dictionary, "layout.header.menu.close"),
    language: opt(dictionary, "layout.header.language.label"),
    theme: opt(dictionary, "layout.header.theme.toggle"),
    themeShort: opt(dictionary, "layout.header.theme.label"),
    // Below `xl` the CTA stays in the bar, in a short form when one exists.
    ctaShort: opt(dictionary, "layout.header.cta_short"),
  };

  const ctaClass =
    "items-center justify-center gap-2 whitespace-nowrap rounded-md bg-b-forest font-semibold text-b-on-forest transition-colors hover:bg-b-charge hover:text-b-on-charge focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

  const renderCta = (className: string, content: React.ReactNode, testId: string) =>
    ctaLink &&
    (ctaLink.external ? (
      <a
        href={ctaLink.href}
        title={ctaLink.label}
        target={ctaLink.openInNewTab ? "_blank" : "_self"}
        rel={ctaLink.openInNewTab ? "noopener noreferrer" : undefined}
        className={className}
        data-testid={testId}
      >
        {content}
      </a>
    ) : (
      <Link href={ctaLink.href} title={ctaLink.label} className={className} data-testid={testId}>
        {content}
      </Link>
    ));

  return (
    <HeaderShell>
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-1.5 pr-3 pl-5 md:px-10 xl:gap-10">
        <Link
          href={`/${lang}`}
          aria-label="easyRecharge — accueil"
          className="flex shrink-0 items-center rounded-md focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          data-testid="link-home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt="easyRecharge"
            className="h-9 w-auto md:h-10 dark:hidden"
            data-testid="img-logo"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDarkSrc} alt="easyRecharge" className="hidden h-9 w-auto md:h-10 dark:block" />
        </Link>
        <EnvBadge />

        {/* Desktop navigation from `xl`: with the counts and the German labels
            the links, language, theme and CTA need ~1250 px. Below that the
            menu takes over rather than truncating a label. */}
        <nav aria-label={labels.nav} className="ml-2 hidden items-center gap-1.5 xl:flex">
          {navLinks.map((item) => (
            <NavLink
              key={item.id}
              href={item.href}
              title={item.label}
              data-testid={`link-nav-${item.id}`}
              className="inline-flex h-11 items-center whitespace-nowrap rounded-md px-3.5 text-[15px] transition-colors duration-100 hover:bg-b-inset focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              activeClassName="bg-b-sand font-semibold text-foreground hover:bg-b-sand"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 xl:gap-3">
          {renderCta(
            `inline-flex h-11 px-3.5 text-sm xl:hidden ${ctaClass}`,
            labels.ctaShort ?? ctaLink?.label,
            "button-header-quote-short",
          )}
          {headerConfig?.show_language_selector && (
            <LanguageSwitcher pageRegistry={pageRegistry} label={labels.language} />
          )}
          {headerConfig?.show_theme_toggle && (
            <div className="hidden xl:block">
              <ThemeToggle label={labels.theme} />
            </div>
          )}
          {renderCta(
            `hidden h-11 px-5 text-[15px] xl:inline-flex ${ctaClass}`,
            <>
              {ctaLink?.label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>,
            "button-header-quote",
          )}

          {/* Mobile Menu (Client Component) */}
          <MobileMenu
            navLinks={navLinks}
            ctaLink={ctaLink}
            labels={{ open: labels.menuOpen, close: labels.menuClose, nav: labels.nav, theme: labels.themeShort }}
            themeToggle={headerConfig?.show_theme_toggle ? <ThemeToggle label={labels.theme} /> : undefined}
          />
        </div>
      </div>
    </HeaderShell>
  );
}
