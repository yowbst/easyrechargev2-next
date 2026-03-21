"use client";

import { Card } from "@/components/ui/card";
import { LucideCmsIcon } from "./LucideCmsIcon";

interface StatItem {
  id: string;
  icon: string;
  value: number;
  label: string;
}

interface SwissMapProps {
  title?: string;
  subtitle?: string;
  activeCantons?: string[];
  stats: StatItem[];
}

/**
 * Swiss coverage section with stats.
 * The full interactive SVG map with topojson canton rendering and
 * coat-of-arms assets will be added in a future iteration.
 */
export function SwissMap({
  title,
  subtitle,
  activeCantons = [],
  stats,
}: SwissMapProps) {
  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        {title && (
          <h2 className="font-heading text-3xl font-bold text-center mb-3">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="text-center text-muted-foreground mb-10 max-w-2xl mx-auto">
            {subtitle}
          </p>
        )}

        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Map placeholder — will be replaced with interactive SVG */}
          <div className="relative aspect-[4/3] bg-muted/30 rounded-2xl flex items-center justify-center border">
            <div className="text-center space-y-3">
              <div className="text-5xl">🇨🇭</div>
              <div className="flex flex-wrap justify-center gap-2">
                {activeCantons.map((canton) => (
                  <span
                    key={canton}
                    className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-medium"
                  >
                    {canton}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-4">
            {stats.map((stat) => (
              <Card key={stat.id} className="flex items-center gap-4 p-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <LucideCmsIcon
                    name={stat.icon}
                    className="h-6 w-6 text-primary"
                  />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}+</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
