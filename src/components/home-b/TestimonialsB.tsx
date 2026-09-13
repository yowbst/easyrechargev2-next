import { Star } from "lucide-react";
import { Container, Eyebrow, SectionTitle } from "./Shell";

export interface TestimonialB {
  id: string;
  text: string;
  name: string;
  /** Line under the name, e.g. "Propriétaire · Nyon". */
  meta?: string;
  rating: number;
}

export function TestimonialsB({
  eyebrow,
  title,
  aside,
  items,
}: {
  eyebrow?: string;
  title: string;
  /** Overall score shown opposite the title, e.g. "4.8 / 5 · 124 avis". */
  aside?: string;
  items: TestimonialB[];
}) {
  if (items.length === 0) return null;
  return (
    <section data-reveal className="bg-b-paper py-14">
      <Container>
        <div className="mb-9 flex flex-wrap items-end justify-between gap-x-12 gap-y-5">
          <div className="max-w-[40rem]">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <SectionTitle>{title}</SectionTitle>
          </div>
          {aside && (
            <div className="flex shrink-0 items-center gap-3">
              <span className="flex gap-[3px]" aria-hidden>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className="size-4 fill-b-charge text-b-charge" />
                ))}
              </span>
              <span className="text-[15px] font-semibold text-muted-foreground">
                {aside}
              </span>
            </div>
          )}
        </div>
        {/* Every review visible, four to a row — social proof works by mass,
            and a carousel would hide most of it from a crawler. Narrow
            screens get the strip instead (see below). */}
        {/* One list, two behaviours: a swipe strip on phones, a grid from sm
            up. Same DOM either way — duplicating the markup per breakpoint
            would double the reviews a crawler sees. */}
        <ul className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-6 px-6 [scrollbar-width:none] sm:mx-0 sm:grid sm:gap-6 sm:overflow-visible sm:px-0 sm:[grid-template-columns:repeat(auto-fill,minmax(min(100%,16.25rem),1fr))] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex shrink-0 basis-[calc(100%-3rem)] snap-start flex-col rounded-xl bg-b-sand p-7 sm:shrink sm:basis-auto"
              data-testid={`card-testimonial-${item.id}`}
            >
              <div
                className="mb-5 flex gap-[3px]"
                aria-label={`${item.rating}/5`}
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={`size-[15px] ${
                      i < item.rating
                        ? "fill-b-charge text-b-charge"
                        : "text-muted-foreground/40"
                    }`}
                    aria-hidden
                  />
                ))}
              </div>
              <blockquote className="mb-5.5 flex-1 text-[15px] leading-[1.6]">
                &ldquo;{item.text}&rdquo;
              </blockquote>
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-b-forest text-sm font-semibold text-b-on-forest"
                  aria-hidden
                >
                  {item.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-[1.4]">
                    {item.name}
                  </p>
                  {item.meta && (
                    <p className="text-sm text-muted-foreground">{item.meta}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
