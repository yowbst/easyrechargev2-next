import Link from "next/link";
import { CheckCircle, ChevronRight } from "lucide-react";
import { GetQuote } from "@/components/GetQuote";
import { resolveRouteLinks, resolveRouteId } from "@/lib/pageConfig";
import { buildFAQPage, buildBreadcrumbList, wrapInGraph } from "@/lib/seo/jsonLd";
import { getSiteUrl } from "@/lib/seo/resolver";
import type { PageRegistryEntry } from "@/lib/directus-queries";

// Rendered for the Directus page with route_id "installation" (service page
// targeting "installation borne de recharge" queries). ALL copy lives in the
// page translation's `content` JSON in Directus — this component only
// provides structure, the FAQPage schema, and live charger price bounds.

interface SectionText {
  heading?: string;
  intro?: string;
  text?: string;
}

interface InstallationContent {
  intro?: string;
  steps?: SectionText & { items?: Array<{ title?: string; text?: string }> };
  price?: SectionText & {
    rows?: Array<{ label?: string; value?: string }>;
    note?: string;
  };
  delais?: SectionText;
  subventions?: SectionText;
  zones?: SectionText;
  faq?: { heading?: string; items?: Array<{ q?: string; a?: string }> };
  cta?: {
    headline?: string;
    subheadline?: string;
    label?: string;
    note?: string;
  };
}

interface InstallationServicePageProps {
  lang: string;
  slug: string;
  title: string;
  content: InstallationContent;
  registry: PageRegistryEntry[];
  /** Live CHF price bounds computed from the Directus chargers catalog. */
  chargerRange?: { min: number; max: number } | null;
}

function formatChf(value: number): string {
  return new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(
    value,
  );
}

export function InstallationServicePage({
  lang,
  slug,
  title,
  content,
  registry,
  chargerRange,
}: InstallationServicePageProps) {
  // Resolve {r:route-id} tokens and the live charger price placeholders.
  const resolve = (html?: string): string => {
    if (!html) return "";
    let out = resolveRouteLinks(html, lang, registry);
    if (chargerRange) {
      out = out
        .replace(/\{charger_min\}/g, formatChf(Math.floor(chargerRange.min / 10) * 10))
        .replace(/\{charger_max\}/g, formatChf(Math.ceil(chargerRange.max / 50) * 50));
    }
    return out;
  };

  const SITE_URL = getSiteUrl();
  const faqItems = (content.faq?.items || []).filter((i) => i.q && i.a);
  const schemas = [
    buildBreadcrumbList([
      { name: "easyRecharge", url: `${SITE_URL}/${lang}` },
      { name: title, url: `${SITE_URL}/${lang}/${slug}` },
    ]),
    ...(faqItems.length
      ? [
          buildFAQPage(
            faqItems.map((i) => ({
              question: i.q!,
              answer: i.a!.replace(/<[^>]+>/g, ""),
            })),
          ),
        ]
      : []),
  ];

  const quoteHref = resolveRouteId("quote", lang, registry) || `/${lang}`;
  const prose = "prose dark:prose-invert max-w-none prose-p:text-muted-foreground prose-p:leading-relaxed prose-a:text-primary prose-a:font-medium hover:prose-a:underline";

  return (
    <div className="flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(wrapInGraph(...schemas)) }}
      />

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-heading font-bold mb-6">
          {title}
        </h1>
        <div
          className={`${prose} mb-12 text-lg`}
          dangerouslySetInnerHTML={{ __html: resolve(content.intro) }}
        />

        {/* Étapes */}
        {content.steps && (
          <section className="mb-12">
            <h2 className="text-xl md:text-2xl font-heading font-semibold mb-4">
              {content.steps.heading}
            </h2>
            <div
              className={`${prose} mb-6`}
              dangerouslySetInnerHTML={{ __html: resolve(content.steps.intro) }}
            />
            <ol className="space-y-4">
              {(content.steps.items || []).map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-heading font-bold text-sm">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-heading font-semibold mb-1">{step.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {step.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Prix */}
        {content.price && (
          <section className="mb-12">
            <h2 className="text-xl md:text-2xl font-heading font-semibold mb-4">
              {content.price.heading}
            </h2>
            <div
              className={`${prose} mb-6`}
              dangerouslySetInnerHTML={{ __html: resolve(content.price.intro) }}
            />
            {!!content.price.rows?.length && (
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm border rounded-lg overflow-hidden">
                  <tbody>
                    {content.price.rows.map((row, i) => (
                      <tr key={i} className={i % 2 ? "bg-muted/30" : ""}>
                        <td className="px-4 py-3 font-medium">{row.label}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs md:text-sm">
                          {resolve(row.value).replace(/<[^>]+>/g, "")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div
              className={prose}
              dangerouslySetInnerHTML={{ __html: resolve(content.price.note) }}
            />
          </section>
        )}

        {/* Délais / Subventions / Zones */}
        {[content.delais, content.subventions, content.zones]
          .filter((s): s is SectionText => !!s?.heading)
          .map((section, i) => (
            <section key={i} className="mb-12">
              <h2 className="text-xl md:text-2xl font-heading font-semibold mb-4">
                {section.heading}
              </h2>
              <div
                className={prose}
                dangerouslySetInnerHTML={{ __html: resolve(section.text) }}
              />
            </section>
          ))}

        {/* FAQ */}
        {faqItems.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl md:text-2xl font-heading font-semibold mb-6">
              {content.faq?.heading}
            </h2>
            <div className="space-y-6">
              {faqItems.map((item, i) => (
                <div key={i} className="border rounded-xl p-5">
                  <h3 className="font-heading font-semibold mb-2 flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    {item.q}
                  </h3>
                  <div
                    className={`${prose} text-sm`}
                    dangerouslySetInnerHTML={{ __html: resolve(item.a) }}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Inline CTA link (the full-width GetQuote banner follows) */}
        <p className="mb-4">
          <Link
            href={quoteHref}
            className="inline-flex items-center gap-2 text-primary font-medium hover:underline"
          >
            {content.cta?.label}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </p>
      </div>

      {content.cta && (
        <GetQuote
          title={content.cta.headline || ""}
          subtitle={content.cta.subheadline}
          ctaLabel={content.cta.label || ""}
          ctaHref={quoteHref}
          note={content.cta.note}
        />
      )}
    </div>
  );
}
