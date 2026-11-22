import Link from "next/link";
import { ArrowRight, BadgeCheck, MapPin, Zap } from "lucide-react";
import type { PublicPartner } from "@/lib/companies/public/partners";
import { TrackedSection } from "@/components/companies/TrackedSection";

type Lang = "fr" | "de";

const COPY = {
  fr: {
    badge: (canton: string) => `Partenaire easyRecharge · ${canton}`,
    heading: (canton: string) => `Votre installateur partenaire dans le canton ${canton}`,
    several: "Nos installateurs partenaires",
    exclusive: (canton: string) => `installe dans tout le canton ${canton}`,
    shared: (canton: string) => `intervient dans le canton ${canton}`,
    forwarded: "Votre demande de devis lui est transmise directement.",
    forwardedMany: "Votre demande de devis est transmise à nos partenaires du canton.",
    cta: "Demander un devis",
    compactLead: "Votre demande sera transmise à",
    compactMany: "nos partenaires du canton",
  },
  de: {
    badge: (canton: string) => `easyRecharge-Partner · ${canton}`,
    heading: (canton: string) => `Ihr Partner-Installateur im Kanton ${canton}`,
    several: "Unsere Partner-Installateure",
    exclusive: (canton: string) => `installiert im ganzen Kanton ${canton}`,
    shared: (canton: string) => `ist im Kanton ${canton} tätig`,
    forwarded: "Ihre Offertanfrage wird direkt an ihn weitergeleitet.",
    forwardedMany: "Ihre Offertanfrage geht an unsere Partner im Kanton.",
    cta: "Offerte anfragen",
    compactLead: "Ihre Anfrage geht an",
    compactMany: "unsere Partner im Kanton",
  },
} as const;

export interface PartnerCardProps {
  partners: PublicPartner[];
  lang: Lang;
  /** Canton as it reads after "canton" / "Kanton": "de Vaud" in French, "Waadt" in German. */
  cantonPhrase: string;
  /** Short canton name for the badge. */
  cantonName: string;
  cantonCode: string;
  quoteHref: string;
  pageType: "canton" | "locality";
  variant?: "banner" | "compact";
  /** "heading" = the long title (commune pages); "badge" = the short eyebrow (canton page). */
  title?: "heading" | "badge";
}

/**
 * The region's partner, as the dispatch resolver would pick it. Renders nothing without
 * a partner. No phone or website: the request goes through the quote funnel.
 */
export function PartnerCard({
  partners,
  lang,
  cantonPhrase,
  cantonName,
  cantonCode,
  quoteHref,
  pageType,
  variant = "banner",
  title = "badge",
}: PartnerCardProps) {
  if (partners.length === 0) return null;
  const c = COPY[lang];
  const one = partners.length === 1 ? partners[0] : null;
  const track = { canton: cantonCode, page_type: pageType, placement: variant, partner_slug: one?.slug ?? "several", locale: lang };

  if (variant === "compact") {
    return (
      <TrackedSection event="partner_card" props={track} className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#07231A] text-[#3DDC84]">
          <Zap className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{c.compactLead}</p>
          <p className="font-semibold leading-snug">{one ? one.name : c.compactMany}</p>
        </div>
      </TrackedSection>
    );
  }

  return (
    <TrackedSection
      as="aside"
      event="partner_card"
      props={track}
      aria-label={c.badge(cantonName)}
      className="flex flex-wrap items-center justify-between gap-5 rounded-xl bg-[#07231A] p-6 text-[#F3F1EB] sm:p-7 dark:border dark:border-[#25402f] dark:bg-[#142a20]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        {title === "heading" ? (
          <p className="text-sm font-semibold text-[#3DDC84]">{c.heading(cantonPhrase)}</p>
        ) : (
          <p className="inline-flex h-7 items-center gap-2 self-start rounded-md bg-[#3DDC84]/15 px-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-[#3DDC84]">
            <BadgeCheck className="size-3.5" aria-hidden />
            {c.badge(cantonName)}
          </p>
        )}
        <h2 className="font-heading text-2xl font-semibold leading-tight tracking-tight sm:text-[28px]">
          {one ? one.name : c.several}
        </h2>
        {one ? (
          <p className="flex items-center gap-1.5 text-[15px] text-[#F3F1EB]/75">
            <MapPin className="size-4 text-[#3DDC84]" aria-hidden />
            {[one.locality, one.mode === "exclusive" ? c.exclusive(cantonPhrase) : c.shared(cantonPhrase)].filter(Boolean).join(" · ")}
          </p>
        ) : (
          <p className="text-[15px] text-[#F3F1EB]/75">{partners.map((p) => p.name).join(" · ")}</p>
        )}
        <p className="text-[15px] text-[#F3F1EB]/75">{one ? c.forwarded : c.forwardedMany}</p>
      </div>
      <Link
        href={quoteHref}
        data-cta="quote"
        className="inline-flex h-14 items-center justify-center gap-2 rounded-md bg-[#3DDC84] px-6 font-semibold text-[#04150C] transition-colors hover:bg-[#5ee69b] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3DDC84]"
      >
        {c.cta}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </TrackedSection>
  );
}
