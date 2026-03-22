import Link from "next/link";
import { LucideCmsIcon } from "./LucideCmsIcon";
import { t } from "@/lib/i18n/dictionaries";
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
  if (page.route_id === "home") return `/${lang}`;
  const entry = pageRegistry.find((p) => p.id === page.route_id);
  const slug = entry?.slugs[lang];
  if (slug) return `/${lang}/${slug}`;
  return null;
}

export function Footer({
  lang,
  layoutData,
  dictionary,
  pageRegistry,
}: FooterProps) {
  const footerQuickLinksItems =
    layoutData?.footer_quicklinks_navigation?.items || [];
  const footerAboutItems =
    layoutData?.footer_about_navigation?.items || [];
  const footerConfig = layoutData?.footer_config || {};

  const logoSrc = "/logo-color.svg";
  const logoDarkSrc = "/logo-white.svg";

  const socials = footerConfig?.socials || [];
  const stepRows = footerConfig?.columns?.rows || [];
  const columnsOrder: string[] = footerConfig?.columnsOrder ?? [
    "brand",
    "about",
    "quickLinks",
    "steps",
  ];

  const brandTagline = t(dictionary, "layout.footer.brand.tagline");
  const quickLinksHeading = t(
    dictionary,
    "layout.footer.columns.quicklinks.heading",
  );
  const aboutHeading = t(dictionary, "layout.footer.columns.about.heading");
  const stepsHeading = t(dictionary, "layout.footer.columns.steps.heading");

  // SLA values from global_config for step interpolation
  const gc = layoutData?.global_config || {};
  const slasVars = {
    first_contact: gc?.slas?.first_contact?.value ?? 48,
    quote_delivery_timeline: gc?.slas?.quote_delivery_timeline?.value ?? "3-5",
    quote_request_duration: gc?.slas?.quote_request_duration?.value ?? 3,
  };

  const subline = t(dictionary, "layout.footer.subline", {
    year: new Date().getFullYear(),
    address: footerConfig?.subline?.address ?? "",
    company_id: footerConfig?.subline?.company_id ?? "",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderNavList = (items: any[], prefix: string) =>
    items.map((item) => {
      const href = resolveNavHref(item, lang, pageRegistry);
      if (!href) return null;

      const label = t(dictionary, `layout.nav.${prefix}.${item.key}`);
      const external = item.type === "external";

      return (
        <li key={item.id} className="flex items-center gap-2">
          <LucideCmsIcon
            name={item.icon_lucide}
            className="h-4 w-4 text-muted-foreground"
          />
          {external ? (
            <a
              href={href}
              title={label}
              target={item.open_in_new_tab ? "_blank" : "_self"}
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              {label}
            </a>
          ) : (
            <Link
              href={href}
              title={label}
              className="text-muted-foreground hover:text-foreground"
            >
              {label}
            </Link>
          )}
        </li>
      );
    });

  const columns: Record<string, React.ReactNode> = {
    brand: (
      <div key="brand">
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt="easyRecharge"
            className="h-10 mb-3 dark:hidden"
            style={{ width: "auto", height: "2.5rem" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoDarkSrc}
            alt="easyRecharge"
            className="h-10 mb-3 hidden dark:block"
            style={{ width: "auto", height: "2.5rem" }}
          />
        </>
        {brandTagline && !brandTagline.startsWith("[") && (
          <p className="text-sm text-muted-foreground mb-4">{brandTagline}</p>
        )}
        <div className="flex gap-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {socials.map((social: any) => (
            <a
              key={social.id}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={social.id}
              title={social.id}
            >
              <LucideCmsIcon name={social.icon_lucide} className="h-5 w-5" />
            </a>
          ))}
        </div>
      </div>
    ),
    quickLinks: (
      <div key="quickLinks">
        {quickLinksHeading && !quickLinksHeading.startsWith("[") && (
          <h3 className="font-semibold mb-4">{quickLinksHeading}</h3>
        )}
        <ul className="space-y-2 text-sm">
          {renderNavList(footerQuickLinksItems, "footer_quicklinks")}
        </ul>
      </div>
    ),
    about: (
      <div key="about">
        {aboutHeading && !aboutHeading.startsWith("[") && (
          <h3 className="font-semibold mb-4">{aboutHeading}</h3>
        )}
        <ul className="space-y-2 text-sm">
          {renderNavList(footerAboutItems, "footer_about")}
        </ul>
      </div>
    ),
    steps: (
      <div key="steps">
        {stepsHeading && !stepsHeading.startsWith("[") && (
          <h3 className="font-semibold mb-4">{stepsHeading}</h3>
        )}
        <ul className="space-y-2 text-sm text-muted-foreground">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {Array.isArray(stepRows) &&
            stepRows.map((row: any) => {
              const label = t(
                dictionary,
                `layout.footer.columns.steps.rows.${row.id}`,
                slasVars as Record<string, string | number>,
              );
              if (!label || label.startsWith("[")) return null;

              const stepIcon = row.icon_lucide;
              const isNumeric = /^\d+$/.test(stepIcon || "");
              return (
                <li key={row.id} className="flex items-start gap-2">
                  {stepIcon && !isNumeric ? (
                    <LucideCmsIcon name={stepIcon} className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
                  ) : (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0 mt-0.5">
                      {isNumeric ? stepIcon : row.id}
                    </span>
                  )}
                  <span>{label}</span>
                </li>
              );
            })}
        </ul>
      </div>
    ),
  };

  return (
    <footer className="bg-muted/50 border-t">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {columnsOrder.map((id) => columns[id]).filter(Boolean)}
        </div>

        <div className="border-t pt-8 text-center text-sm text-muted-foreground">
          {subline && !subline.startsWith("[") && <p>{subline}</p>}
        </div>
      </div>
    </footer>
  );
}
