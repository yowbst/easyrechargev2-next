"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, MapPin, Shield, Zap, type LucideIcon } from "lucide-react";
import { projectCantons, type ProjectedCanton } from "@/lib/swiss-geo";
import { Container, Eyebrow, SectionTitle } from "./Shell";

export interface CoverageStat {
  id: string;
  icon: string;
  value: number;
  label: string;
}

const STAT_ICONS: Record<string, LucideIcon> = {
  Pin: MapPin,
  MapPin: MapPin,
  CheckCircle: BadgeCheck,
  Zap: Zap,
};

/**
 * Direction B coverage map.
 *
 * Same geometry and the same lazy GeoJSON fetch as the original SwissMap — the
 * projection now lives in `lib/swiss-geo` so both share it. What changes is the
 * frame: the three figures move into a column beside the map instead of a row
 * under it, so the map and the numbers are read together.
 *
 * Pointer and touch are handled separately on purpose. Hover has no meaning on
 * a touch screen, so below `lg` a canton is *tapped* and its card is pinned
 * under the map rather than floating over it.
 */
export function CoverageB({
  eyebrow,
  title,
  lede,
  activeCantons,
  stats,
  cantonCoats = {},
  legendActive,
  legendInactive,
  loadingLabel,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  activeCantons: string[];
  stats: CoverageStat[];
  cantonCoats?: Record<string, string>;
  legendActive: string;
  legendInactive: string;
  loadingLabel: string;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [cantons, setCantons] = useState<ProjectedCanton[]>([]);
  const [viewBox, setViewBox] = useState("0 0 960 620");
  const [selected, setSelected] = useState<string | null>(null);

  // Don't fetch 400 KB of geometry for a section the visitor may never reach.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    fetch("/swiss-cantons.geojson")
      .then((res) => res.json())
      .then((geo) => {
        if (cancelled || !geo?.features) return;
        const projected = projectCantons(geo.features);
        setCantons(projected.cantons);
        setViewBox(projected.viewBox);
      })
      .catch((err) => console.error("[CoverageB] map load failed:", err));
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const current = selected
    ? (cantons.find((c) => c.abbr === selected) ?? null)
    : null;
  const currentActive = !!selected && activeCantons.includes(selected);

  const fillFor = (abbr: string, hovered: boolean) => {
    const on = activeCantons.includes(abbr);
    if (on) return hovered ? "rgba(22,163,74,.7)" : "rgba(22,163,74,.4)";
    return hovered ? "var(--b-sand)" : "var(--b-inset)";
  };

  return (
    <section ref={containerRef} data-reveal className="bg-b-paper py-14">
      <Container>
        <div className="mb-9 flex flex-wrap items-end justify-between gap-x-12 gap-y-5">
          <div className="max-w-[40rem]">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <SectionTitle>{title}</SectionTitle>
            {lede && (
              <p className="mt-4 text-[17px] leading-[1.65] text-muted-foreground">
                {lede}
              </p>
            )}
          </div>
          <ul className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 text-[15px] text-muted-foreground">
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 rounded border-[1.5px] border-b-link"
                style={{ background: "rgba(22,163,74,.4)" }}
              />
              {legendActive}
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 rounded border-[1.5px] border-partner-dashed bg-b-inset"
              />
              {legendInactive}
            </li>
          </ul>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="relative rounded-xl bg-b-sand p-4 md:p-8">
            {cantons.length > 0 ? (
              <svg
                viewBox={viewBox}
                role="img"
                aria-label={title}
                className="block h-auto w-full"
              >
                <g onMouseLeave={() => setSelected(null)}>
                  {cantons.map((canton) => {
                    const on = activeCantons.includes(canton.abbr);
                    const hovered = selected === canton.abbr;
                    return (
                      <path
                        key={canton.uniqueId}
                        d={canton.path}
                        fill={fillFor(canton.abbr, hovered)}
                        stroke={on ? "var(--b-link)" : "var(--partner-dashed)"}
                        strokeWidth={on ? 1.2 : 1}
                        strokeLinejoin="round"
                        tabIndex={0}
                        role="button"
                        aria-label={`${canton.name} — ${on ? legendActive : legendInactive}`}
                        className="cursor-pointer outline-none transition-[fill] duration-150"
                        onMouseEnter={() => setSelected(canton.abbr)}
                        onFocus={() => setSelected(canton.abbr)}
                        onClick={() => setSelected(canton.abbr)}
                        data-testid={`canton-${canton.abbr}`}
                      />
                    );
                  })}
                  {current && (
                    <path
                      d={current.path}
                      fill="none"
                      stroke={currentActive ? "var(--b-forest)" : "var(--muted-foreground)"}
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                      pointerEvents="none"
                    />
                  )}
                </g>
              </svg>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-[15px] text-muted-foreground lg:h-[480px]">
                {loadingLabel}
              </div>
            )}

            {/* Desktop: the card floats over the map. Mobile gets its own
                pinned card below, so a thumb never covers the answer. */}
            {current && (
              <div className="pointer-events-none absolute bottom-6 left-6 hidden items-center gap-3.5 rounded-lg border bg-[color-mix(in_srgb,var(--card)_97%,transparent)] py-3.5 pl-3.5 pr-4.5 shadow-[0_12px_32px_-12px_rgba(12,59,39,0.25)] lg:flex">
                <CantonCard
                  name={current.name}
                  active={currentActive}
                  coat={cantonCoats[current.abbr]}
                  activeLabel={legendActive}
                  inactiveLabel={legendInactive}
                />
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:gap-6">
            {stats.map((stat, i) => {
              const Icon = STAT_ICONS[stat.icon] ?? MapPin;
              // The first figure is the headline one — it gets the forest tile.
              const lead = i === 0;
              return (
                <div
                  key={stat.id}
                  data-testid={`stat-${stat.id}`}
                  className={`flex flex-col justify-between gap-8 rounded-xl p-7 ${
                    lead
                      ? "bg-b-forest text-b-on-forest sm:col-span-2 lg:col-span-1"
                      : "bg-b-sand"
                  }`}
                >
                  <span
                    className={`inline-flex size-11 items-center justify-center rounded-lg ${
                      lead
                        ? "bg-[color-mix(in_srgb,var(--b-on-forest)_10%,transparent)]"
                        : "bg-b-paper"
                    }`}
                  >
                    <Icon
                      className={`size-5 ${lead ? "text-b-signal" : "text-b-link"}`}
                      aria-hidden
                    />
                  </span>
                  <div>
                    <p className="font-heading text-[clamp(2rem,3vw,2.75rem)] font-semibold leading-none tracking-[-0.04em]">
                      {stat.value >= 1000 ? `${stat.value.toLocaleString("fr-CH")}+` : stat.value}
                    </p>
                    <p
                      className={`mt-2.5 text-[15px] ${
                        lead ? "opacity-75" : "text-muted-foreground"
                      }`}
                    >
                      {stat.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Touch: the selected canton's card, under the map. */}
        {current && (
          <div className="mt-4 flex min-h-[72px] items-center gap-3.5 rounded-lg border bg-card p-3.5 lg:hidden">
            <CantonCard
              name={current.name}
              active={currentActive}
              coat={cantonCoats[current.abbr]}
              activeLabel={legendActive}
              inactiveLabel={legendInactive}
            />
          </div>
        )}
      </Container>
    </section>
  );
}

function CantonCard({
  name,
  active,
  coat,
  activeLabel,
  inactiveLabel,
}: {
  name: string;
  active: boolean;
  coat?: string;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <>
      {coat ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coat}
          alt=""
          loading="lazy"
          width={40}
          height={40}
          className="size-10 shrink-0 object-contain"
        />
      ) : (
        <span
          aria-hidden
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed border-partner-dashed bg-b-inset text-muted-foreground"
        >
          <Shield className="size-[18px]" />
        </span>
      )}
      <div className="min-w-0">
        <p className="mb-1.5 text-[17px] font-semibold leading-tight">{name}</p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-semibold ${
            active
              ? "bg-b-charge/15 text-b-link"
              : "bg-b-inset text-muted-foreground"
          }`}
        >
          {active && <BadgeCheck className="size-[13px]" aria-hidden />}
          {active ? activeLabel : inactiveLabel}
        </span>
      </div>
    </>
  );
}
