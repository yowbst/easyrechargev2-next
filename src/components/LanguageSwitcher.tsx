"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Globe } from "lucide-react";
import {
  convertPathToLanguage,
  type Language,
} from "@/lib/i18n/slug-mapping";
import type { PageRegistryEntry } from "@/lib/directus-queries";

const languages = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

interface LanguageSwitcherProps {
  pageRegistry?: PageRegistryEntry[];
  /** Accessible name prefix, e.g. "Changer de langue". */
  label?: string;
}

export function LanguageSwitcher({ pageRegistry, label = "Changer de langue" }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();

  const currentLangCode =
    pathname.match(/^\/([a-z]{2})(\/|$)/)?.[1] || "fr";
  const currentLanguage =
    languages.find((lang) => lang.code === currentLangCode) || languages[0];

  const handleLanguageChange = (newLangCode: string) => {
    if (newLangCode === currentLangCode) return;
    const registryMap = pageRegistry
      ? Object.fromEntries(pageRegistry.map((p) => [p.id, p]))
      : undefined;

    const newPath = convertPathToLanguage(
      pathname,
      newLangCode as Language,
      registryMap,
    );

    router.push(newPath || `/${newLangCode}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label} — ${currentLanguage.label}`}
        className="group inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-b-inset hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring data-popup-open:bg-b-inset data-popup-open:text-foreground"
      >
        <Globe className="hidden h-4 w-4 sm:block" aria-hidden />
        <span className="hidden sm:inline">{currentLanguage.label}</span>
        <span className="text-xl leading-none sm:hidden" aria-hidden>{currentLanguage.flag}</span>
        <ChevronDown className="hidden h-3.5 w-3.5 transition-transform group-data-popup-open:rotate-180 sm:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-auto min-w-50 rounded-lg border border-border bg-b-paper p-1.5 shadow-[0_16px_40px_-16px_rgba(12,59,39,.28)] ring-0"
      >
        <DropdownMenuRadioGroup value={currentLangCode} onValueChange={handleLanguageChange}>
          {languages.map((lang) => (
            <DropdownMenuRadioItem
              key={lang.code}
              value={lang.code}
              lang={lang.code}
              className="h-11 rounded-md px-3 pr-10 text-[15px] font-medium text-foreground focus:bg-b-inset data-checked:bg-b-sand data-checked:font-semibold **:data-[slot=dropdown-menu-radio-item-indicator]:right-3 [&_[data-slot=dropdown-menu-radio-item-indicator]_svg]:text-(--b-link,var(--primary))"
            >
              {lang.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
