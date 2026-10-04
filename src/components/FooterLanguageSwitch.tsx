"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { convertPathToLanguage, type Language } from "@/lib/i18n/slug-mapping";
import type { PageRegistryEntry } from "@/lib/directus-queries";

const LANGUAGES: { code: Language; short: string; long: string }[] = [
  { code: "fr", short: "FR", long: "Français" },
  { code: "de", short: "DE", long: "Deutsch" },
];

/**
 * FR / DE segmented control at the bottom of the footer (design 10 Footer).
 * Same path conversion as the header's LanguageSwitcher, but as plain links:
 * every language is one tap away and crawlable.
 */
export function FooterLanguageSwitch({
  pageRegistry,
  label,
  wide = false,
}: {
  pageRegistry?: PageRegistryEntry[];
  label: string;
  /** Mobile: full names on two equal halves. */
  wide?: boolean;
}) {
  const pathname = usePathname();
  const current = pathname.match(/^\/([a-z]{2})(\/|$)/)?.[1] || "fr";
  const registryMap = pageRegistry ? Object.fromEntries(pageRegistry.map((p) => [p.id, p])) : undefined;

  return (
    <div
      role="group"
      aria-label={label}
      className={`gap-1 rounded-lg bg-b-on-forest/8 p-1 ${wide ? "grid grid-cols-2" : "flex"}`}
    >
      {LANGUAGES.map((l) => {
        const active = l.code === current;
        const href = active ? pathname : convertPathToLanguage(pathname, l.code, registryMap) || `/${l.code}`;
        return (
          <Link
            key={l.code}
            href={href}
            lang={l.code}
            hrefLang={l.code}
            aria-current={active ? "true" : undefined}
            className={`inline-flex items-center justify-center rounded-md text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-b-signal ${
              wide ? "h-10" : "h-9 px-3"
            } ${active ? "bg-b-on-forest text-b-forest" : "text-b-on-forest hover:bg-b-on-forest/12"}`}
          >
            {wide ? l.long : l.short}
          </Link>
        );
      })}
    </div>
  );
}
