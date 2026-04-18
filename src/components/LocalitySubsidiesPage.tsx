/**
 * Locality subsidies page — shows EV charging subsidy programs
 * available for a given Swiss locality.
 * Server component.
 */

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { t } from "@/lib/i18n/dictionaries";
import {
  Zap,
  Car,
  Landmark,
  ExternalLink,
  FileText,
  Phone,
  Mail,
  Globe,
  ChevronRight,
  Building2,
  Users,
  CircleDollarSign,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

interface SubsidyAmount {
  text: string;
  chf: number[] | null;
  percent: number | null;
}

interface SubsidyContributor {
  name: string;
  phone?: string;
  email?: string;
  url?: string;
}

interface Subsidy {
  source_id: number;
  category: string;
  audiences: string[];
  name: string;
  description: string;
  financial_contribution: string | null;
  amounts: SubsidyAmount[] | null;
  site_url: string | null;
  form_url: string | null;
  contributor: SubsidyContributor;
}

interface LocalitySubsidiesPageProps {
  locality: {
    name: string;
    postalCode: string;
    canton2l: string;
    cantonName: string;
    subsidiesFetchedAt: string | null;
  };
  subsidies: Subsidy[];
  cantonArticle: { title: string; href: string } | null;
  dictionary: Record<string, string>;
  lang: string;
  quoteHref: string;
}

// ── Helpers ────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, typeof Zap> = {
  "charging-infrastructure": Zap,
  "electric-vehicles": Car,
  "tax-relief": CircleDollarSign,
};

const AUDIENCE_ICONS: Record<string, typeof Users> = {
  personal: Users,
  business: Building2,
  communes: Landmark,
};

function getTopChfAmount(subsidies: Subsidy[]): number | null {
  let max = 0;
  for (const s of subsidies) {
    for (const a of s.amounts || []) {
      for (const v of a.chf || []) {
        if (v > max) max = v;
      }
    }
  }
  return max > 0 ? max : null;
}

// ── Component ──────────────────────────────────────────────

export function LocalitySubsidiesPage({
  locality,
  subsidies,
  cantonArticle,
  dictionary,
  lang,
  quoteHref,
}: LocalitySubsidiesPageProps) {
  const P = "pages.locality-subsidies.";
  const d = (key: string, vars?: Record<string, string | number>) => {
    const val = t(dictionary, P + key, vars);
    return val === P + key ? `[${key}]` : val;
  };

  const chargingInfra = subsidies.filter(
    (s) => s.category === "charging-infrastructure" && s.audiences.includes("personal"),
  );
  const otherIncentives = subsidies.filter(
    (s) => s.category !== "charging-infrastructure" && s.audiences.includes("personal"),
  );
  const businessOnly = subsidies.filter(
    (s) => s.audiences.includes("business") && !s.audiences.includes("personal"),
  );

  const hasSubsidies = subsidies.length > 0;
  const personalCount = chargingInfra.length + otherIncentives.length;

  // Top highlight for intro
  const topAmount = getTopChfAmount(chargingInfra);
  const topContributor = chargingInfra[0]?.contributor?.name;
  const topHighlight =
    topAmount && topContributor
      ? d("introTopHighlight", { contributor: topContributor, amount: topAmount.toLocaleString("fr-CH") })
      : "";

  // FAQ data
  const topSummary = chargingInfra[0]
    ? `${chargingInfra[0].name} (${chargingInfra[0].contributor.name})${topAmount ? ` avec jusqu'à CHF ${topAmount.toLocaleString("fr-CH")}` : ""}.`
    : "";

  const faqItems = [
    {
      question: d("faq.q1", { ville: locality.name }),
      answer: d("faq.a1", { count: personalCount, topSummary }),
    },
    { question: d("faq.q2"), answer: d("faq.a2") },
    {
      question: d("faq.q3", { ville: locality.name }),
      answer: d("faq.a3"),
    },
  ];

  return (
    <div className="flex-1">
      {/* Breadcrumbs */}
      <nav aria-label="breadcrumb" className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3">
          <ol className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
            <li>
              <Link href={`/${lang}`} className="hover:text-foreground transition-colors">
                {d("breadcrumb.localities")}
              </Link>
            </li>
            <li><ChevronRight className="h-3.5 w-3.5 shrink-0" /></li>
            <li className="text-foreground font-medium truncate max-w-[200px]">
              {locality.name}
            </li>
            <li><ChevronRight className="h-3.5 w-3.5 shrink-0" /></li>
            <li className="text-foreground font-medium">
              {d("breadcrumb.subsidies")}
            </li>
          </ol>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl sm:text-3xl font-heading font-bold mb-4">
            {d("h1", { ville: locality.name })}
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed max-w-3xl">
            {hasSubsidies
              ? d("intro", {
                  ville: locality.name,
                  canton: locality.cantonName,
                  count: personalCount,
                  topHighlight,
                })
              : d("introNoSubsidy", { ville: locality.name })}
          </p>
          {!hasSubsidies && (
            <Link
              href={quoteHref}
              className="inline-flex items-center gap-2 mt-6 rounded-lg bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {d("cta.label")}
            </Link>
          )}
        </div>
      </section>

      {/* Charging infrastructure */}
      {chargingInfra.length > 0 && (
        <section className="py-10 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-xl sm:text-2xl font-heading font-bold mb-6">
              {d("sections.chargingInfrastructure")}
            </h2>
            <div className="grid gap-4">
              {chargingInfra.map((s) => (
                <SubsidyCard key={s.source_id} subsidy={s} d={d} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Other incentives */}
      {otherIncentives.length > 0 && (
        <section className="py-10">
          <div className="container mx-auto px-4">
            <h2 className="text-xl sm:text-2xl font-heading font-bold mb-6">
              {d("sections.otherIncentives")}
            </h2>
            <Accordion className="w-full">
              {otherIncentives.map((s, i) => (
                <AccordionItem key={s.source_id} value={`other-${i}`}>
                  <AccordionTrigger className="text-left hover:no-underline gap-4">
                    <span className="flex items-center gap-2">
                      {(() => {
                        const Icon = CATEGORY_ICONS[s.category] || Zap;
                        return <Icon className="h-4 w-4 text-primary shrink-0" />;
                      })()}
                      {s.name}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <SubsidyCardContent subsidy={s} d={d} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      )}

      {/* Business section */}
      {businessOnly.length > 0 && (
        <section className="py-10 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-xl sm:text-2xl font-heading font-bold mb-6">
              {d("sections.business")}
            </h2>
            <Accordion className="w-full">
              {businessOnly.map((s, i) => (
                <AccordionItem key={s.source_id} value={`biz-${i}`}>
                  <AccordionTrigger className="text-left hover:no-underline gap-4">
                    {s.name}
                  </AccordionTrigger>
                  <AccordionContent>
                    <SubsidyCardContent subsidy={s} d={d} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      )}

      {/* Contextual links */}
      <section className="py-10">
        <div className="container mx-auto px-4">
          <h2 className="text-xl sm:text-2xl font-heading font-bold mb-6">
            {d("sections.links")}
          </h2>
          <div className="grid gap-3">
            {cantonArticle && (
              <Link
                href={cantonArticle.href}
                className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <FileText className="h-5 w-5 text-primary shrink-0" />
                <span className="text-sm font-medium">{cantonArticle.title}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
              </Link>
            )}
            <Link
              href={quoteHref}
              className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Zap className="h-5 w-5 text-primary shrink-0" />
              <span className="text-sm font-medium">{d("links.quote")}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      {hasSubsidies && (
        <section className="py-10 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-xl sm:text-2xl font-heading font-bold mb-6">
              {d("sections.faq")}
            </h2>
            <Accordion className="w-full">
              {faqItems.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left hover:no-underline w-full justify-between gap-4">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.answer}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      )}

      {/* Last updated */}
      {locality.subsidiesFetchedAt && (
        <div className="container mx-auto px-4 py-4">
          <p className="text-xs text-muted-foreground">
            {d("lastUpdated", {
              date: new Date(locality.subsidiesFetchedAt).toLocaleDateString(
                lang === "de" ? "de-CH" : "fr-CH",
                { day: "numeric", month: "long", year: "numeric" },
              ),
            })}
          </p>
        </div>
      )}
    </div>
  );
}

// ── SubsidyCard ────────────────────────────────────────────

function SubsidyCard({
  subsidy: s,
  d,
}: {
  subsidy: Subsidy;
  d: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const Icon = CATEGORY_ICONS[s.category] || Zap;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-3">
        <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-heading font-semibold">{s.name}</h3>
          <span className="text-xs text-muted-foreground">{s.contributor.name}</span>
        </div>
      </div>
      <SubsidyCardContent subsidy={s} d={d} />
    </Card>
  );
}

function SubsidyCardContent({
  subsidy: s,
  d,
}: {
  subsidy: Subsidy;
  d: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>

      {/* Financial contribution */}
      {s.amounts && s.amounts.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {d("card.financialContribution")}
          </h4>
          <ul className="space-y-1">
            {s.amounts.map((a, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Audiences */}
      <div className="flex flex-wrap gap-1.5">
        {s.audiences.map((aud) => {
          const AudIcon = AUDIENCE_ICONS[aud] || Users;
          return (
            <Badge key={aud} variant="secondary" className="gap-1 text-xs">
              <AudIcon className="h-3 w-3" />
              {d(`audiences.${aud}`)}
            </Badge>
          );
        })}
      </div>

      {/* Links */}
      <div className="flex flex-wrap gap-3 pt-2">
        {s.site_url && (
          <a
            href={s.site_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {d("card.officialPage")}
          </a>
        )}
        {s.form_url && (
          <a
            href={s.form_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <FileText className="h-3.5 w-3.5" />
            {d("card.applicationForm")}
          </a>
        )}
      </div>

      {/* Contributor contact */}
      {(s.contributor.phone || s.contributor.email || s.contributor.url) && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t">
          {s.contributor.phone && (
            <a href={`tel:${s.contributor.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
              <Phone className="h-3 w-3" /> {s.contributor.phone}
            </a>
          )}
          {s.contributor.email && (
            <a href={`mailto:${s.contributor.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
              <Mail className="h-3 w-3" /> {s.contributor.email}
            </a>
          )}
          {s.contributor.url && (
            <a href={s.contributor.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              <Globe className="h-3 w-3" /> {new URL(s.contributor.url).hostname}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
