import Link from "next/link";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { Container, Eyebrow, SectionTitle } from "./Shell";

export interface FaqEntry {
  id: string;
  question: string;
  /** Trusted CMS rich text. */
  answer: string;
}

/**
 * FAQ as native `<details>` / `<summary>`.
 *
 * Deliberately not a JS accordion: this section backs the page's FAQPage
 * structured data, so every answer has to be real text in the document, not
 * markup a crawler has to execute to reach. `details` also gives keyboard
 * operation and in-page find for free.
 */
export function FaqB({
  eyebrow,
  title,
  lede,
  items,
  action,
  defaultOpenIndex = 0,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  items: FaqEntry[];
  action?: { label: string; href: string };
  /** Which entry starts expanded; -1 for none. */
  defaultOpenIndex?: number;
}) {
  if (items.length === 0) return null;
  return (
    <section data-reveal className="bg-b-paper py-14">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <SectionTitle>{title}</SectionTitle>
            {lede && (
              <p className="mt-4 text-[17px] leading-[1.65] text-muted-foreground">
                {lede}
              </p>
            )}
            {action && (
              <Link
                href={action.href}
                className="mt-7 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold"
              >
                {action.label}
                <ArrowRight className="size-[15px]" aria-hidden />
              </Link>
            )}
          </div>

          <div className="border-t">
            {items.map((item, i) => (
              <details
                key={item.id}
                open={i === defaultOpenIndex}
                className="group border-b open:rounded-lg open:bg-card open:px-5 open:-mx-5"
                data-testid={`faq-${item.id}`}
              >
                <summary className="flex min-h-[72px] cursor-pointer list-none items-center gap-5 py-4 text-[17px] font-semibold leading-[1.3] md:text-xl [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">{item.question}</span>
                  <span
                    aria-hidden
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-b-sand text-foreground transition-colors group-open:bg-b-forest group-open:text-b-on-forest"
                  >
                    <Plus className="size-[18px] group-open:hidden" />
                    <Minus className="hidden size-[18px] group-open:block" />
                  </span>
                </summary>
                <div
                  className="pb-7 pr-0 text-[17px] leading-[1.65] text-muted-foreground md:pr-14 [&_a]:underline [&_a]:underline-offset-[3px] [&_li]:mb-1.5 [&_p]:mb-3.5 [&_p:last-child]:mb-0 [&_ul]:mb-3.5 [&_ul]:list-disc [&_ul]:pl-5.5"
                  dangerouslySetInnerHTML={{ __html: item.answer }}
                />
              </details>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
