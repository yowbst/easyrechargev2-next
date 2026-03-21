"use client";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
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
}

export function LanguageSwitcher({ pageRegistry }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();

  const currentLangCode =
    pathname.match(/^\/([a-z]{2})(\/|$)/)?.[1] || "fr";
  const currentLanguage =
    languages.find((lang) => lang.code === currentLangCode) || languages[0];

  const handleLanguageChange = (newLangCode: string) => {
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
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}
      >
        <Globe className="h-4 w-4" />
        <span className="hidden sm:inline">{currentLanguage.label}</span>
        <span className="sm:hidden">{currentLanguage.flag}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className="gap-2"
          >
            <span>{lang.flag}</span>
            <span>{lang.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
