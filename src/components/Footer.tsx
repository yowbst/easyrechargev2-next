import Link from "next/link";
import { LucideCmsIcon } from "./LucideCmsIcon";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { opt } from "@/components/home-b/content";
import { FooterLanguageSwitch } from "./FooterLanguageSwitch";
import type { PageRegistryEntry } from "@/lib/directus-queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LayoutData = Record<string, any>;

interface FooterProps {
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
  const anchor = item.url?.startsWith("#") ? item.url : "";
  if (page.route_id === "home") return `/${lang}${anchor}`;
  const entry = pageRegistry.find((p) => p.id === page.route_id);
  const slug = entry?.slugs[lang];
  if (slug) return `/${lang}/${slug}${anchor}`;
  return null;
}

const SOCIAL_NAMES: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X",
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
};

const linkClass =
  "flex items-center gap-2.5 text-[15px] text-b-on-forest transition-colors hover:text-b-signal focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-b-signal rounded-sm";
const legalLinkClass =
  "inline-flex min-h-11 items-center text-sm text-b-on-forest underline underline-offset-3 hover:text-b-signal focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-b-signal rounded-sm";
/**
 * The footer is Forest on every page, including the ones that have not moved
 * to Direction B yet (their palette would turn `bg-b-forest` grey). Dark mode
 * keeps the darker forest from the Direction B dark palette.
 */
const FOREST_VARS = "[--b-forest:#07231a] [--b-on-forest:#f3f1eb] [--b-charge:#16a34a] [--b-on-charge:#04150c] [--b-signal:#3ddc84] dark:[--b-forest:#0c1b14] dark:[--b-on-forest:#e8ede9]";

const headingClass =
  "mb-4.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-b-on-forest/72";

/**
 * Site footer, Direction B (design 10 Footer): Forest ground in every theme,
 * four columns in `footer_config.columnsOrder`, link columns as accordions on
 * mobile, a quote CTA under the steps, and a bottom bar with the subline,
 * the legal pages and a FR/DE switch.
 *
 * `variant="compact"` is the one-line version (logo, subline without the
 * company id, legal links, language) for focused flows.
 */
export function Footer({
  lang,
  layoutData,
  dictionary,
  pageRegistry,
  variant = "full",
}: FooterProps & { variant?: "full" | "compact" }) {
  const footerQuickLinksItems =
    layoutData?.footer_quicklinks_navigation?.items || [];
  const footerAboutItems =
    layoutData?.footer_about_navigation?.items || [];
  const footerConfig = layoutData?.footer_config || {};

  const socials = footerConfig?.socials || [];
  const stepRows = footerConfig?.columns?.rows || [];
  const columnsOrder: string[] = footerConfig?.columnsOrder ?? [
    "brand",
    "about",
    "quickLinks",
    "steps",
  ];

  const brandTagline = opt(dictionary, "layout.footer.brand.tagline");
  const quickLinksHeading = opt(dictionary, "layout.footer.columns.quicklinks.heading");
  const aboutHeading = opt(dictionary, "layout.footer.columns.about.heading");
  const stepsHeading = opt(dictionary, "layout.footer.columns.steps.heading");
  const legalNavLabel = opt(dictionary, "layout.footer.legal.nav_label") ?? "Liens légaux";
  const languageLabel = opt(dictionary, "layout.footer.language.label") ?? "Langue";

  // SLA values from global_config for step interpolation
  const gc = layoutData?.global_config || {};
  const slasVars = {
    first_contact: gc?.slas?.first_contact?.value ?? 48,
    quote_delivery_timeline: gc?.slas?.quote_delivery_timeline?.value ?? "3-5",
    quote_request_duration: gc?.slas?.quote_request_duration?.value ?? 3,
  };

  const year = new Date().getFullYear();
  const address = footerConfig?.subline?.address ?? "";
  const subline = opt(dictionary, "layout.footer.subline", {
    year,
    address,
    company_id: footerConfig?.subline?.company_id ?? "",
  });

  // Legal pages come from the page registry, so their slugs follow the CMS.
  const legalLinks = [
    { id: "privacy-policy", label: opt(dictionary, "layout.footer.legal.privacy") },
    { id: "legal-notices", label: opt(dictionary, "layout.footer.legal.legal_notice") },
  ]
    .map((l) => {
      const slug = pageRegistry.find((p) => p.id === l.id)?.slugs[lang];
      return slug && l.label ? { ...l, href: `/${lang}/${slug}` } : null;
    })
    .filter(Boolean) as { id: string; label: string; href: string }[];

  // The quote CTA is the header's button item, so both always agree.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctaItem = (layoutData?.header_navigation?.items || []).find((i: any) => i.variant === "button");
  const ctaHref = ctaItem ? resolveNavHref(ctaItem, lang, pageRegistry) : null;
  const ctaLabel = ctaItem ? opt(dictionary, `layout.nav.header.${ctaItem.key}`) : undefined;

  const legalNav = (
    <nav aria-label={legalNavLabel} className="flex flex-wrap gap-x-5">
      {legalLinks.map((l) => (
        <Link key={l.id} href={l.href} className={legalLinkClass}>
          {l.label}
        </Link>
      ))}
    </nav>
  );

  const logo = (className: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo-white.svg" alt="easyRecharge" className={`w-auto ${className}`} />
  );

  if (variant === "compact") {
    return (
      <footer className={`${FOREST_VARS} bg-b-forest text-b-on-forest`}>
        <div className="mx-auto flex min-h-18 w-full max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-6 md:px-10 md:py-0">
          {logo("h-7")}
          <p className="text-sm text-b-on-forest/78 max-md:order-last max-md:w-full">
            © {year} easyRecharge{address ? ` · ${address}` : ""}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2">
            {legalNav}
            <FooterLanguageSwitch pageRegistry={pageRegistry} label={languageLabel} />
          </div>
        </div>
      </footer>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderNavList = (items: any[], prefix: string, mobile = false) =>
    items.map((item) => {
      const href = resolveNavHref(item, lang, pageRegistry);
      if (!href) return null;

      const label = opt(dictionary, `layout.nav.${prefix}.${item.key}`);
      if (!label) return null;
      const external = item.type === "external";
      const content = (
        <>
          {/* Fixed slot so a link without a CMS icon still lines up. */}
          <span className="inline-flex w-4 shrink-0 justify-center" aria-hidden>
            <LucideCmsIcon name={item.icon_lucide} className="h-4 w-4 text-b-signal" />
          </span>
          {label}
        </>
      );
      const cls = `${linkClass} ${mobile ? "min-h-11" : "min-h-9"}`;

      return (
        <li key={item.id}>
          {external ? (
            <a
              href={href}
              target={item.open_in_new_tab ? "_blank" : "_self"}
              rel="noopener noreferrer"
              className={cls}
            >
              {content}
            </a>
          ) : (
            <Link href={href} className={cls}>
              {content}
            </Link>
          )}
        </li>
      );
    });

  const linkColumn = (
    key: string,
    heading: string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[],
    prefix: string,
    openOnMobile: boolean,
  ) =>
    heading ? (
      <div key={key} className="max-md:order-3 md:contents">
        {/* Desktop: a plain column. */}
        <nav aria-label={heading} className="hidden md:block">
          <h3 className={headingClass}>{heading}</h3>
          <ul className="flex flex-col gap-1">{renderNavList(items, prefix)}</ul>
        </nav>
        {/* Mobile: an accordion, so four short columns do not stack into a
            long scroll. The first one starts open. */}
        <details
          open={openOnMobile}
          className="group border-t border-b-on-forest/14 last-of-type:border-b md:hidden"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between text-base font-semibold [&::-webkit-details-marker]:hidden">
            {heading}
            <Plus className="h-4.5 w-4.5 group-open:hidden" aria-hidden />
            <Minus className="hidden h-4.5 w-4.5 group-open:block" aria-hidden />
          </summary>
          <nav aria-label={heading}>
            <ul className="flex flex-col pb-3">{renderNavList(items, prefix, true)}</ul>
          </nav>
        </details>
      </div>
    ) : null;

  const firstLinkColumn = columnsOrder.find((id) => id === "about" || id === "quickLinks");

  const columns: Record<string, React.ReactNode> = {
    brand: (
      <div key="brand" className="max-md:order-1">
        {logo("mb-5 h-9 md:h-10")}
        {brandTagline && (
          <p className="mb-6 max-w-[300px] text-[15px] leading-relaxed text-b-on-forest/78">{brandTagline}</p>
        )}
        {socials.length > 0 && (
          <div className="flex gap-2 max-md:mb-8">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {socials.map((social: any) => {
              const name = SOCIAL_NAMES[String(social.id).toLowerCase()] ?? social.id;
              return (
                <a
                  key={social.id}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={name}
                  title={name}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-b-on-forest/8 text-b-on-forest transition-colors hover:bg-b-on-forest/14 hover:text-b-signal focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-b-signal"
                >
                  <LucideCmsIcon name={social.icon_lucide} className="h-4.5 w-4.5" />
                </a>
              );
            })}
          </div>
        )}
      </div>
    ),
    about: linkColumn("about", aboutHeading, footerAboutItems, "footer_about", firstLinkColumn === "about"),
    quickLinks: linkColumn(
      "quickLinks",
      quickLinksHeading,
      footerQuickLinksItems,
      "footer_quicklinks",
      firstLinkColumn === "quickLinks",
    ),
    steps: (
      <div key="steps" className="max-md:order-2 max-md:mb-6 max-md:rounded-xl max-md:bg-b-on-forest/6 max-md:p-5">
        {stepsHeading && <h3 className={headingClass}>{stepsHeading}</h3>}
        <ol className="mb-6 flex flex-col gap-3.5">
          {Array.isArray(stepRows) &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stepRows.map((row: any) => {
              const label = opt(
                dictionary,
                `layout.footer.columns.steps.rows.${row.id}`,
                slasVars as Record<string, string | number>,
              );
              if (!label) return null;

              const stepIcon = row.icon_lucide;
              const isNumeric = /^\d+$/.test(stepIcon || "");
              return (
                <li key={row.id} className="flex items-start gap-3 text-[15px] leading-normal">
                  {stepIcon && !isNumeric ? (
                    <LucideCmsIcon name={stepIcon} className="mt-0.5 h-5 w-5 shrink-0 text-b-signal" />
                  ) : (
                    <span className="inline-flex size-6.5 shrink-0 items-center justify-center rounded-md bg-b-charge text-[13px] font-semibold text-b-on-charge">
                      {isNumeric ? stepIcon : row.id}
                    </span>
                  )}
                  <span className="pt-0.5">{label}</span>
                </li>
              );
            })}
        </ol>
        {ctaHref && ctaLabel && (
          <Link
            href={ctaHref}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-b-charge px-4.5 text-[15px] font-semibold text-b-on-charge transition-opacity hover:opacity-90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-b-signal max-md:flex max-md:h-13 max-md:justify-center max-md:text-base"
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
    ),
  };

  return (
    <footer className={`${FOREST_VARS} bg-b-forest text-b-on-forest`}>
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-12 pb-2 md:px-10 md:pt-20 md:pb-14">
        <div className="flex flex-col md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] md:gap-12">
          {columnsOrder.map((id) => columns[id]).filter(Boolean)}
        </div>
      </div>

      <div className="border-t border-b-on-forest/14 max-md:border-t-0">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3.5 px-5 pt-5 pb-7 md:flex-row md:flex-wrap md:items-center md:gap-6 md:px-10 md:py-5">
          {subline && (
            <p className="text-sm leading-normal text-b-on-forest/78 max-md:order-3">
              {/* Authored as "© … | address | company id": one fact per line on
                  mobile instead of a break in the middle of the id. */}
              {subline.split(/\s*\|\s*/).map((part, i) => (
                <span key={i} className="max-md:block">
                  {i > 0 && <span className="max-md:hidden"> | </span>}
                  {part}
                </span>
              ))}
            </p>
          )}
          <div className="max-md:order-2 md:ml-auto">{legalNav}</div>
          <div className="max-md:order-1">
            <div className="hidden md:block">
              <FooterLanguageSwitch pageRegistry={pageRegistry} label={languageLabel} />
            </div>
            <div className="md:hidden">
              <FooterLanguageSwitch pageRegistry={pageRegistry} label={languageLabel} wide />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
