"use client";

import { usePathname, useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LANGUAGES = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
] as const;

type Lang = (typeof LANGUAGES)[number]["code"];

export function PartnerLanguageSwitcher({ lang }: { lang: Lang }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const current =
    LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  function switchLang(next: Lang) {
    if (next === lang) return;
    // pathname is the internal (post-rewrite) path, e.g. /partners/<uuid>/crm.
    // Re-prefix it with the chosen lang to keep the visible URL clean.
    const internal = pathname.replace(/^\/(fr|de)(?=\/|$)/, "");
    router.push(`/${next}${internal || "/"}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-2",
        )}
      >
        <Globe className="h-4 w-4" />
        <span className="hidden sm:inline">{current.label}</span>
        <span className="sm:hidden">{current.flag}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => switchLang(l.code)}
            className="gap-2"
          >
            <span>{l.flag}</span>
            <span>{l.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
