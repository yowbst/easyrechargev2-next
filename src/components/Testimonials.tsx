"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { cmsBgImage } from "@/lib/directusAssets";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n/dictionaries";

interface TestimonialItemConfig {
  id: string;
  rating: number;
}

interface TestimonialsProps {
  headline?: string;
  subheadline?: string;
  itemsConfig?: TestimonialItemConfig[];
  pageId?: string;
  image?: string;
  dictionary: Record<string, string>;
}

export function Testimonials({ headline, subheadline, itemsConfig = [], pageId, image, dictionary }: TestimonialsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      align: "start",
      loop: true,
      skipSnaps: false,
      slidesToScroll: 1,
    },
    [
      Autoplay({
        delay: 4000,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      }),
    ],
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (itemsConfig.length === 0) return null;

  const hasImage = !!image;

  return (
    <section
      className="relative py-24 overflow-hidden"
      style={hasImage ? { backgroundImage: `url(${cmsBgImage(image!)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      {hasImage && <div className="absolute inset-0 bg-slate-900/70" />}

      <div className="relative z-10 container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className={`text-3xl md:text-4xl font-heading font-bold mb-4 ${hasImage ? "text-white" : ""}`}>
            {headline}
          </h2>
          {subheadline && (
            <p className={`text-lg max-w-3xl mx-auto ${hasImage ? "text-white/75" : "text-muted-foreground"}`}>
              {subheadline}
            </p>
          )}
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {itemsConfig.map((item) => {
                const tbp = `pages.${pageId || "default"}.blocks.testimonials`;
                const name = t(dictionary, `${tbp}.items.${item.id}.name`);
                const text = t(dictionary, `${tbp}.items.${item.id}.text`);
                const status = t(dictionary, `${tbp}.items.${item.id}.status`);
                const location = t(dictionary, `${tbp}.items.${item.id}.location`);

                return (
                  <div key={item.id} className="flex-[0_0_100%] md:flex-[0_0_50%] min-w-0 px-3">
                    <Card
                      className={`p-6 h-full flex flex-col ${
                        hasImage ? "bg-white/10 backdrop-blur-md border-white/15 text-white" : ""
                      }`}
                      data-testid={`card-testimonial-${item.id}`}
                    >
                      <div className="flex items-center gap-1 mb-4">
                        {[...Array(item.rating || 5)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>

                      <p className={`text-sm mb-6 leading-relaxed italic flex-1 ${hasImage ? "text-white/90" : "text-foreground"}`}>
                        &ldquo;{text}&rdquo;
                      </p>

                      <div className="mt-auto flex items-center gap-3 pt-4 border-t border-white/10">
                        <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <span className={`text-sm font-bold ${hasImage ? "text-white" : "text-primary"}`}>
                            {name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <div className={`font-semibold text-sm ${hasImage ? "text-white" : ""}`}>{name}</div>
                          <div className={`text-xs ${hasImage ? "text-white/60" : "text-muted-foreground"}`}>
                            {status}{location && !location.startsWith("[") ? ` · ${location}` : ""}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mt-8">
            <Button
              variant={hasImage ? "ghost" : "outline"}
              size="icon"
              onClick={scrollPrev}
              className={hasImage ? "text-white border border-white/20 hover:bg-white/10" : ""}
              data-testid="button-testimonial-prev"
              aria-label="Previous testimonial"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="flex gap-2">
              {itemsConfig.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(index)}
                  className={`transition-all duration-300 rounded-full ${
                    index === selectedIndex
                      ? `w-8 h-2 ${hasImage ? "bg-white" : "bg-primary"}`
                      : `w-2 h-2 ${hasImage ? "bg-white/30 hover:bg-white/50" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"}`
                  }`}
                  aria-label={`Go to testimonial ${index + 1}`}
                  data-testid={`dot-testimonial-${index}`}
                />
              ))}
            </div>

            <Button
              variant={hasImage ? "ghost" : "outline"}
              size="icon"
              onClick={scrollNext}
              className={hasImage ? "text-white border border-white/20 hover:bg-white/10" : ""}
              data-testid="button-testimonial-next"
              aria-label="Next testimonial"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
