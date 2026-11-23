import Link from "next/link";
import { ArrowRight, BadgeCheck, MapPin, Zap } from "lucide-react";
import type { PublicPartner } from "@/lib/companies/public/partners";
import { TrackedSection } from "@/components/companies/TrackedSection";

type Lang = "fr" | "de";

const COPY = {
  fr: {
    badge: (canton: string) => `Partenaire easyRecharge · ${canton}`,
    heading: (canton: string) => `Votre installateur partenaire dans le canton ${canton}`,
    headingMany: (canton: string) => `Vos installateurs partenaires dans le canton ${canton}`,
    several: "Nos installateurs partenaires",
    /** Locality pages: where the partner installs, not where it is based. */
    installsIn: (locality: string) => `Installe des bornes à ${locality}`,
    installIn: (locality: string) => `Installent des bornes à ${locality}`,
    exclusive: (canton: string) => `installe dans tout le canton ${canton}`,
    shared: (canton: string) => `intervient dans le canton ${canton}`,
    forwarded: "Votre demande de devis lui est transmise directement.",
    forwardedMany: "Votre demande de devis est transmise à l'un de nos partenaires du canton.",
    cta: "Demander un devis",
    compactLead: "Votre demande sera transmise à",
    compactLeadMany: "Votre demande sera transmise à l'un de nos partenaires",
  },
  de: {
    badge: (canton: string) => `easyRecharge-Partner · ${canton}`,
    heading: (canton: string) => `Ihr Partner-Installateur im Kanton ${canton}`,
    headingMany: (canton: string) => `Ihre Partner-Installateure im Kanton ${canton}`,
    several: "Unsere Partner-Installateure",
    installsIn: (locality: string) => `Installiert Ladestationen in ${locality}`,
    installIn: (locality: string) => `Installieren Ladestationen in ${locality}`,
    exclusive: (canton: string) => `installiert im ganzen Kanton ${canton}`,
    shared: (canton: string) => `ist im Kanton ${canton} tätig`,
    forwarded: "Ihre Offertanfrage wird direkt an ihn weitergeleitet.",
    forwardedMany: "Ihre Offertanfrage geht an einen unserer Partner im Kanton.",
    cta: "Offerte anfragen",
    compactLead: "Ihre Anfrage geht an",
    compactLeadMany: "Ihre Anfrage geht an einen unserer Partner",
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
  /** Locality pages: the card says the partner installs there, without its base town. */
  localityName?: string;
  variant?: "banner" | "compact";
  /** "heading" = the long title (commune pages); "badge" = the short eyebrow (canton page). */
  title?: "heading" | "badge";
}

/**
 * The region's partner(s), as the dispatch resolver would pick them: an exclusive partner
 * alone, otherwise every shared partner by priority. Renders nothing without a partner.
 * No phone or website: the request goes through the quote funnel, and the resolver picks
 * the recipient when several partners share the canton.
 */
export function PartnerCard({
  partners,
  lang,
  cantonPhrase,
  cantonName,
  cantonCode,
  quoteHref,
  pageType,
  localityName,
  variant = "banner",
  title = "badge",
}: PartnerCardProps) {
  if (partners.length === 0) return null;
  const c = COPY[lang];
  const one = partners.length === 1 ? partners[0] : null;
  const track = { canton: cantonCode, page_type: pageType, placement: variant, partner_slug: one?.slug ?? "several", partners: partners.length, locale: lang };

  if (variant === "compact") {
    return (
      <TrackedSection event="partner_card" props={track} className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#07231A] text-[#3DDC84]">
          <Zap className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{one ? c.compactLead : c.compactLeadMany}</p>
          <p className="font-semibold leading-snug">{partners.map((p) => p.name).join(" · ")}</p>
        </div>
      </TrackedSection>
    );
  }

  /** One partner's area line: the locality on commune pages, the canton coverage on canton pages. */
  const areaLine = (p: PublicPartner) =>
    localityName
      ? c.installsIn(localityName)
      : [p.locality, p.mode === "exclusive" ? c.exclusive(cantonPhrase) : c.shared(cantonPhrase)].filter(Boolean).join(" · ");

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
          <p className="text-sm font-semibold text-[#3DDC84]">{one ? c.heading(cantonPhrase) : c.headingMany(cantonPhrase)}</p>
        ) : (
          <p className="inline-flex h-7 items-center gap-2 self-start rounded-md bg-[#3DDC84]/15 px-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-[#3DDC84]">
            <BadgeCheck className="size-3.5" aria-hidden />
            {c.badge(cantonName)}
          </p>
        )}
        {one ? (
          <>
            <h2 className="font-heading text-2xl font-semibold leading-tight tracking-tight sm:text-[28px]">{one.name}</h2>
            <p className="flex items-center gap-1.5 text-[15px] text-[#F3F1EB]/75">
              <MapPin className="size-4 shrink-0 text-[#3DDC84]" aria-hidden />
              {areaLine(one)}
            </p>
            <p className="text-[15px] text-[#F3F1EB]/75">{c.forwarded}</p>
          </>
        ) : (
          <>
            <h2 className="sr-only">{c.several}</h2>
            <ul className="flex flex-col gap-3">
              {partners.map((p) => (
                <li key={p.id} className="flex flex-col gap-0.5">
                  <span className="font-heading text-xl font-semibold leading-tight tracking-tight sm:text-2xl">{p.name}</span>
                  {!localityName && (
                    <span className="flex items-center gap-1.5 text-[15px] text-[#F3F1EB]/75">
                      <MapPin className="size-4 shrink-0 text-[#3DDC84]" aria-hidden />
                      {areaLine(p)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {localityName && (
              <p className="flex items-center gap-1.5 text-[15px] text-[#F3F1EB]/75">
                <MapPin className="size-4 shrink-0 text-[#3DDC84]" aria-hidden />
                {c.installIn(localityName)}
              </p>
            )}
            <p className="text-[15px] text-[#F3F1EB]/75">{c.forwardedMany}</p>
          </>
        )}
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
