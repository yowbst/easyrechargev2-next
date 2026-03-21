import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Link from "next/link";
import { cmsImage } from "@/lib/directusAssets";
import { resolveRouteLinks, resolveRouteId } from "@/lib/pageConfig";
import type { PageRegistryEntry } from "@/lib/directus-queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface FAQItem {
  id: string | number;
  question: string;
  answer?: string;
}

interface FAQProps {
  title?: string;
  subtitle?: string;
  items: FAQItem[];
  image?: string;
  ctaLabel?: string;
  ctaHref?: string;
  ctaVariant?: string;
  lang: string;
  pageRegistry: PageRegistryEntry[];
}

export function FAQ({
  title,
  subtitle,
  items,
  image,
  ctaLabel,
  ctaHref,
  ctaVariant,
  lang,
  pageRegistry,
}: FAQProps) {
  if (!items.length) return null;

  const hasImage = !!image;

  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className={`${hasImage ? "grid lg:grid-cols-2 gap-12 lg:gap-20 items-start" : "max-w-3xl mx-auto"}`}>
          {/* Left column: heading + accordion + CTA */}
          <div>
            <div className={`${hasImage ? "mb-10" : "text-center mb-12"}`}>
              <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4">
                {title}
              </h2>
              {subtitle && (
                <p className="text-lg text-muted-foreground max-w-3xl">
                  {subtitle}
                </p>
              )}
            </div>

            <Accordion className="w-full">
              {items.map((item, index) => (
                <AccordionItem
                  key={item.id || index}
                  value={`item-${index}`}
                  data-testid={`accordion-item-${index}`}
                >
                  <AccordionTrigger
                    className="text-left hover:no-underline w-full justify-between gap-4 md:gap-8"
                    data-testid={`accordion-trigger-${index}`}
                  >
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent data-testid={`accordion-content-${index}`}>
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: resolveRouteLinks(item.answer || "", lang, pageRegistry),
                      }}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {ctaVariant === "button" && ctaHref && (
              <div className={`flex mt-8 ${hasImage ? "" : "justify-center"}`}>
                <Link
                  href={ctaHref}
                  className="inline-flex items-center justify-center min-w-[240px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 h-9 px-4 text-sm font-medium"
                  data-testid="button-faq-cta"
                >
                  {ctaLabel}
                </Link>
              </div>
            )}
          </div>

          {/* Right column: image (desktop only, sticky) */}
          {hasImage && (
            <div className="hidden lg:block lg:sticky lg:top-24 self-start">
              <div className="relative rounded-2xl overflow-hidden aspect-[4/5]">
                <img
                  {...cmsImage(image, [400, 600])}
                  alt=""
                  loading="lazy"
                  width={600}
                  height={750}
                  className="w-full h-full object-cover"
                  aria-hidden="true"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/30 via-transparent to-transparent" />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
