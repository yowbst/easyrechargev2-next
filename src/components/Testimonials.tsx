"use client";

import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";

interface TestimonialItem {
  id: string;
  name: string;
  text: string;
  status?: string;
  location?: string;
  rating: number;
}

interface TestimonialsProps {
  headline?: string;
  subheadline?: string;
  items: TestimonialItem[];
}

export function Testimonials({ headline, subheadline, items }: TestimonialsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start" },
    [Autoplay({ delay: 4000, stopOnMouseEnter: true })],
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (!items.length) return null;

  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        {headline && (
          <h2 className="font-heading text-3xl font-bold text-center mb-3">
            {headline}
          </h2>
        )}
        {subheadline && (
          <p className="text-center text-muted-foreground mb-10">
            {subheadline}
          </p>
        )}

        <div className="relative">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex gap-6">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex-[0_0_100%] min-w-0 md:flex-[0_0_50%] lg:flex-[0_0_33.333%]"
                >
                  <Card className="p-6 h-full flex flex-col">
                    <div className="flex gap-0.5 mb-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${
                            i < item.rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground flex-1 mb-4">
                      &ldquo;{item.text}&rdquo;
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {item.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        {(item.status || item.location) && (
                          <p className="text-xs text-muted-foreground">
                            {[item.status, item.location].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center gap-4 mt-6">
            <Button variant="outline" size="icon" onClick={scrollPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1.5">
              {items.map((_, i) => (
                <button
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i === selectedIndex ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                  onClick={() => emblaApi?.scrollTo(i)}
                />
              ))}
            </div>
            <Button variant="outline" size="icon" onClick={scrollNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
