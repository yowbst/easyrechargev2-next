/**
 * Canton installation page (/fr/installation-borne-de-recharge/{canton}), served cantons,
 * French only. Server component. Every figure is live data with its source and date:
 * register companies (Zefix via `npm run companies`), the commune subsidy survey and the
 * charger catalog. Copy falls back to `installation-canton/copy.ts`.
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getRouteSlug } from "@/lib/i18n/config";
import { GetQuote } from "@/components/GetQuote";
import { PartnerCard } from "@/components/partners/PartnerCard";
import { InstallerCard } from "@/components/companies/InstallerCard";
import { TrackedSection } from "@/components/companies/TrackedSection";
import { formatRegisterDate } from "@/components/companies/NearbyInstallers";
import { CANTON_ADJECTIVE, CANTON_PARAGRAPHS, COPY } from "@/components/installation-canton/copy";
import type { CantonInfo } from "@/lib/companies/public/cantons";
import type { PublicPartner } from "@/lib/companies/public/partners";
import type { CantonInstallerStats } from "@/lib/companies/public/installers";
import type { CantonSubsidySummary } from "@/lib/localities-server";
import { buildBreadcrumbList, buildElectricianItemList, buildFAQPage, buildInstallationService, wrapInGraph } from "@/lib/seo/jsonLd";

export interface InstallationCantonPageProps {
  canton: CantonInfo;
  partners: PublicPartner[];
  stats: CantonInstallerStats;
  subsidies: CantonSubsidySummary | null;
  chargerRange: { min: number; max: number } | null;
  /** Lower-cased locality name -> locality page slug. */
  localitySlugs: Record<string, string>;
  installationTitle: string;
  installationPath: string;
  currentPath: string;
  quoteHref: string;
  contactHref: string | null;
  siteUrl: string;
}

const chf = (v: number) => `CHF ${new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(v)}`;

/** Price bounds, rounded like the installation page (floor to 10, ceil to 50). */
export function chargerBounds(range: { min: number; max: number } | null): { min: number; max: number } | null {
  if (!range) return null;
  return { min: Math.floor(range.min / 10) * 10, max: Math.ceil(range.max / 50) * 50 };
}

export function localitySubsidyPath(slug: string): string {
  return `/fr/${getRouteSlug("fr", "localities")}/${slug}/${getRouteSlug("fr", "subsidies")}`;
}

export function InstallationCantonPage({
  canton,
  partners,
  stats,
  subsidies,
  chargerRange,
  localitySlugs,
  installationTitle,
  installationPath,
  currentPath,
  quoteHref,
  contactHref,
  siteUrl,
}: InstallationCantonPageProps) {
  const of = canton.ofFr;
  const one = partners.length === 1 ? partners[0] : null;
  const registerDate = formatRegisterDate(stats.registerDate);
  const subsidyDate = formatRegisterDate(subsidies?.fetchedAt ? `${subsidies.fetchedAt.replace(/Z?$/, "Z")}` : null);
  const bounds = chargerBounds(chargerRange);
  const top = stats.topLocalities[0];
  const h1 = COPY.h1(of);

  const statTiles: { value: string; label: string }[] = [];
  if (stats.count > 0) statTiles.push({ value: String(stats.count), label: `entreprises du canton dont le but social mentionne des installations électriques` });
  if (top && top.count > 1) statTiles.push({ value: String(top.count), label: `de ces entreprises ont leur siège à ${top.locality}` });
  if (subsidies && subsidies.total > 0)
    statTiles.push({ value: `${subsidies.withSubsidy} / ${subsidies.total}`, label: "localités où une aide pour une borne privée est recensée" });
  if (bounds) statTiles.push({ value: chf(bounds.min), label: `prix d'entrée d'une borne dans notre catalogue (jusqu'à ${chf(bounds.max)})` });

  const sources = [
    registerDate ? `registre du commerce (Zefix), données du ${registerDate}` : "registre du commerce (Zefix)",
    subsidies ? (subsidyDate ? `relevé des aides communales du ${subsidyDate}` : "relevé des aides communales") : null,
    bounds ? "catalogue easyRecharge" : null,
  ].filter(Boolean);

  const faq: { q: string; a: string }[] = [];
  if (partners.length > 0)
    faq.push({
      q: `Qui installe ma borne dans le canton ${of} ?`,
      a: one
        ? `Votre demande est transmise à ${one.name}, partenaire easyRecharge ${one.mode === "exclusive" ? "pour tout le canton" : "dans le canton"}. L'entreprise vous recontacte pour établir le devis.`
        : `Votre demande est transmise à nos partenaires du canton (${partners.map((p) => p.name).join(", ")}). Ils vous recontactent pour établir le devis.`,
    });
  if (subsidies && subsidies.total > 0)
    faq.push({
      q: "Existe-t-il une aide pour installer une borne privée ?",
      a:
        subsidies.withSubsidy > 0
          ? `Notre relevé recense une aide pour une borne privée dans ${subsidies.withSubsidy} des ${subsidies.total} localités du canton. Les conditions varient selon le programme (type de logement, nombre de places) : la page de votre localité les détaille.`
          : "Notre relevé ne recense pas d'aide pour une borne privée dans ce canton. La page de votre localité indique les autres aides disponibles.",
    });
  if (bounds)
    faq.push({
      q: "Combien coûte une borne ?",
      a: `Dans notre catalogue, les bornes vont de ${chf(bounds.min)} à ${chf(bounds.max)}. Le coût de l'installation dépend de votre tableau électrique et de la distance à la place de parc ; le devis le précise.`,
    });

  const listName = `Électriciens installateurs dans le canton ${of}`;
  const jsonLd = wrapInGraph(
    buildBreadcrumbList([
      { name: "easyRecharge", url: `${siteUrl}/fr` },
      { name: installationTitle, url: `${siteUrl}${installationPath}` },
      { name: canton.nameFr, url: `${siteUrl}${currentPath}` },
    ]),
    buildInstallationService({
      name: h1,
      description: one ? COPY.introPartner : COPY.introNoPartner,
      cantonName: canton.nameFr,
      url: `${siteUrl}${currentPath}`,
    }),
    buildElectricianItemList(
      listName,
      stats.sample.map((c) => ({ name: c.name, street: c.street, postalCode: c.postalCode, locality: c.locality, uid: c.uid })),
    ),
    faq.length ? buildFAQPage(faq.map((f) => ({ question: f.q, answer: f.a }))) : null,
  );

  const optOut = contactHref ? (
    <>
      {COPY.optOutLead}{" "}
      <Link href={contactHref} className="font-medium text-primary underline-offset-2 hover:underline">
        {COPY.optOutLink}
      </Link>{" "}
      {COPY.optOutTail}
    </>
  ) : null;

  return (
    <div className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto w-full max-w-[1240px] px-5 md:px-10 py-10 sm:py-14 space-y-12">
          {/* Breadcrumb + title (the page view fires here: a whole page never reaches 50 % on screen) */}
          <TrackedSection event="canton_page" props={{ canton: canton.code, has_partner: partners.length > 0, installers: stats.count }} className="space-y-5">
            <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Link href={installationPath} className="hover:text-foreground">
                {COPY.breadcrumb}
              </Link>
              <ChevronRight className="size-3.5" aria-hidden />
              <span className="text-foreground">{canton.nameFr}</span>
            </nav>
            <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{h1}</h1>
            <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">{partners.length ? COPY.introPartner : COPY.introNoPartner}</p>
            {CANTON_PARAGRAPHS[canton.code] && (
              <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">{CANTON_PARAGRAPHS[canton.code]}</p>
            )}
          </TrackedSection>

          <PartnerCard
            partners={partners}
            lang="fr"
            cantonPhrase={of}
            cantonName={canton.nameFr}
            cantonCode={canton.code}
            quoteHref={quoteHref}
            pageType="canton"
            variant="banner"
            title="badge"
          />

          {/* Figures */}
          {statTiles.length > 0 && (
            <section aria-labelledby="canton-stats" className="space-y-4">
              <h2 id="canton-stats" className="font-heading text-xl font-bold sm:text-2xl">
                {COPY.statsHeading}
              </h2>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {statTiles.map((s) => (
                  <div key={s.label} className="flex flex-col gap-1.5 rounded-xl border bg-card p-5">
                    <dt className="order-2 text-sm leading-snug text-muted-foreground">{s.label}</dt>
                    <dd className="order-1 font-mono text-2xl font-medium tracking-tight">{s.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-muted-foreground">Sources&nbsp;: {sources.join(" · ")}.</p>
            </section>
          )}

          {/* Installers */}
          {stats.sample.length > 0 && (
            <section aria-labelledby="canton-installers" className="space-y-4">
              <div className="space-y-1.5">
                <h2 id="canton-installers" className="font-heading text-xl font-bold sm:text-2xl">
                  {COPY.installersHeading}
                </h2>
                <p className="text-muted-foreground">{COPY.installersLead(stats.sample.length, stats.count)}</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stats.sample.map((c) => (
                  <li key={c.ehraid}>
                    <InstallerCard installer={c} />
                  </li>
                ))}
              </ul>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Source&nbsp;: registre du commerce (Zefix){registerDate ? `, données du ${registerDate}` : ""}. {optOut}
              </p>
            </section>
          )}

          {/* Localities */}
          {stats.topLocalities.length > 0 && (
            <section aria-labelledby="canton-localities" className="space-y-4">
              <div className="space-y-1.5">
                <h2 id="canton-localities" className="font-heading text-xl font-bold sm:text-2xl">
                  {COPY.localitiesHeading}
                </h2>
                <p className="text-muted-foreground">{COPY.localitiesLead}</p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {stats.topLocalities.map((l) => {
                  const slug = localitySlugs[l.locality.toLowerCase()];
                  const inner = (
                    <>
                      <span className="font-semibold">{l.locality}</span>
                      <span className="font-mono text-sm text-muted-foreground">{l.count} installateurs</span>
                    </>
                  );
                  return (
                    <li key={l.locality}>
                      {slug ? (
                        <Link href={localitySubsidyPath(slug)} className="flex h-full items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50">
                          {inner}
                        </Link>
                      ) : (
                        <div className="flex h-full items-center justify-between gap-3 rounded-lg border p-4">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Canton-wide subsidy programs */}
          {subsidies && subsidies.widePrograms.length > 0 && (
            <section aria-labelledby="canton-subsidies" className="space-y-4">
              <h2 id="canton-subsidies" className="font-heading text-xl font-bold sm:text-2xl">
                {COPY.subsidiesHeading}
              </h2>
              <ul className="grid gap-3">
                {subsidies.widePrograms.map((p) => (
                  <li key={String(p.sourceId)} className="rounded-xl border bg-card p-5 space-y-2">
                    <p className="font-semibold">
                      {p.name}
                      {p.contributor ? <span className="font-normal text-muted-foreground"> · {p.contributor}</span> : null}
                    </p>
                    {p.conditions && <p className="text-sm leading-relaxed text-muted-foreground">{p.conditions}</p>}
                    {p.amounts.length > 0 && (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {p.amounts.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Recensée dans {p.localities} des {subsidies.total} localités du canton.
                      {p.siteUrl ? (
                        <>
                          {" "}
                          <a href={p.siteUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                            Source officielle
                          </a>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
              {subsidyDate && <p className="text-sm text-muted-foreground">Relevé des aides communales du {subsidyDate}. Vérifiez les conditions auprès de l&apos;organisme avant les travaux.</p>}
            </section>
          )}

          {/* FAQ */}
          {faq.length > 0 && (
            <section aria-labelledby="canton-faq" className="space-y-4">
              <h2 id="canton-faq" className="font-heading text-xl font-bold sm:text-2xl">
                {COPY.faqHeading}
              </h2>
              <div className="space-y-3">
                {faq.map((f) => (
                  <div key={f.q} className="rounded-xl border p-5">
                    <h3 className="mb-1.5 font-heading font-semibold">{f.q}</h3>
                    <p className="leading-relaxed text-muted-foreground">{f.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Method */}
          <aside aria-labelledby="canton-method" className="rounded-xl bg-muted/50 p-5 sm:p-6 space-y-2">
            <h2 id="canton-method" className="font-heading text-base font-semibold">
              {COPY.methodHeading}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{COPY.method}</p>
          </aside>
      </div>

      <GetQuote
        title={one ? COPY.ctaTitlePartner(CANTON_ADJECTIVE[canton.code] ?? "") : COPY.ctaTitleNoPartner(of)}
        subtitle={one ? COPY.ctaSubtitlePartner(one.name) : COPY.ctaSubtitleNoPartner}
        ctaLabel={COPY.cta}
        ctaHref={quoteHref}
      />
    </div>
  );
}
