import Link from "next/link";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";
import { MobileMenu } from "./MobileMenu";
import { DIRECTUS_URL } from "@/lib/directus";
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

  const logoColorId = layoutData?.logo_color;
  const logoWhiteId = layoutData?.logo_white;
  const logoSrc = logoColorId
    ? `${DIRECTUS_URL}/assets/${logoColorId}`
    : "/og-default.webp";
  const logoDarkSrc = logoWhiteId
    ? `${DIRECTUS_URL}/assets/${logoWhiteId}`
    : logoSrc;

  // Build nav links
  const navLinks = headerNavItems
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((item: any) => item.variant === "link")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => {
      const href = resolveNavHref(item, lang, pageRegistry);
      if (!href) return null;
      const label = t(
        dictionary,
        `layout.nav.header.${item.key}`,
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
        <Link href={`/${lang}`} title="easyRecharge">
          <Image
            src={logoSrc}
            alt="easyRecharge"
            width={160}
            height={40}
            className="h-10 w-auto dark:hidden"
            priority
          />
          <Image
            src={logoDarkSrc}
            alt="easyRecharge"
            width={160}
            height={40}
            className="h-10 w-auto hidden dark:block"
            priority
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="text-sm font-medium transition-colors hover:text-primary text-foreground"
            >
              {item.label}
            </Link>
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
                target={ctaLink.openInNewTab ? "_blank" : "_self"}
                rel={ctaLink.openInNewTab ? "noopener noreferrer" : undefined}
                className={cn(
                  buttonVariants(),
                  "hidden md:inline-flex w-44",
                )}
              >
                {ctaLink.label}
              </a>
            ) : (
              <Link
                href={ctaLink.href}
                className={cn(
                  buttonVariants(),
                  "hidden md:inline-flex w-44",
                )}
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
