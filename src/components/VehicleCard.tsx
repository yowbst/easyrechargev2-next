"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Home, Plug } from "lucide-react";
import { t } from "@/lib/i18n/dictionaries";
import { getRouteSlug } from "@/lib/i18n/config";
import { BrandIcon } from "@/lib/vehicles/shared";

interface ChargingMetric {
  value?: number;
  unit?: string;
}

interface HomeDestinationCharging {
  charge_port?: string;
  charge_time?: {
    value?: number;
    unit?: string;
    range?: { from?: ChargingMetric; to?: ChargingMetric };
  };
  charge_power?: ChargingMetric;
  charge_speed?: ChargingMetric;
}

interface VehicleCharging {
  home_destination?: HomeDestinationCharging;
}

interface VehicleCardProps {
  id: string;
  brand: string;
  model: string;
  slug?: string;
  image: string;
  rangeDisplay: string;
  batteryDisplay: string;
  efficiencyDisplay: string;
  pricePerRange: number;
  charging?: VehicleCharging;
  brandIconSvg?: string | null;
  brandIconName?: string | null;
  /** False marks a model no longer on sale. It stays listed — see Vehicle.isAvailable. */
  isAvailable?: boolean;
  lang: string;
  dictionary: Record<string, string>;
}

const metric = (m?: ChargingMetric) => (m?.value != null && m.unit ? `${m.value} ${m.unit}` : null);

/** "510 min" → "8 h 30": a full charge reads in hours. */
export function formatChargeTime(m?: ChargingMetric): string | null {
  if (m?.value == null) return null;
  if (m.unit !== "min" || m.value < 60) return metric(m);
  const h = Math.floor(m.value / 60);
  const min = Math.round(m.value % 60);
  return min ? `${h} h ${String(min).padStart(2, "0")}` : `${h} h`;
}

/**
 * Vehicle card, Direction B (design 13 Véhicules): brand and model first, the
 * three figures people compare, then a "home charging" inset that answers the
 * question the site exists for — how long a full charge takes at home.
 */
export function VehicleCard({
  id,
  brand,
  model,
  slug,
  image,
  rangeDisplay,
  batteryDisplay,
  efficiencyDisplay,
  pricePerRange,
  charging,
  brandIconSvg,
  brandIconName,
  isAvailable = true,
  lang,
  dictionary,
}: VehicleCardProps) {
  const d = (key: string) => t(dictionary, key);
  const f = "shared.vehiclesFilters";

  const vehiclesPath = getRouteSlug(lang, "vehicles");
  const vehicleUrl = `/${lang}/${vehiclesPath}/${slug || id}`;

  const home = charging?.home_destination;
  const time = formatChargeTime(home?.charge_time);
  const from = home?.charge_time?.range?.from;
  const to = home?.charge_time?.range?.to;
  const timeRange = from?.value != null && to?.value != null ? `${from.value}–${to.value}${to.unit ? ` ${to.unit}` : ""}` : null;
  const power = metric(home?.charge_power);
  const speed = metric(home?.charge_speed);
  const viewLabel = t(dictionary, "shared.vehicleCard.view");

  // Short labels from the vehicle page when present ("Batterie" rather than
  // the filter's "Capacité batterie", which does not fit a third of a card).
  const label = (spec: string, filterKey: string) => {
    const short = t(dictionary, `pages.vehicle.specs.${spec}`);
    return short && !short.startsWith("[") && short !== `pages.vehicle.specs.${spec}` ? short : d(`${f}.general.${filterKey}.label`);
  };
  const stats = [
    { label: label("range", "range"), value: rangeDisplay },
    { label: label("battery", "battery"), value: batteryDisplay },
    { label: label("efficiency", "efficiency"), value: efficiencyDisplay },
  ];

  return (
    <Link
      href={vehicleUrl}
      title={`${brand} ${model}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card text-foreground transition-shadow hover:shadow-[0_12px_32px_-16px_rgba(7,35,26,.35)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      data-testid={`card-vehicle-${id}`}
    >
      <div className="relative aspect-video overflow-hidden bg-b-inset">
        {image ? (
          <Image
            src={image}
            alt={`${brand} ${model}`}
            fill
            // The card sits in the 1240 px container (px-5 on mobile): its real
            // width is the viewport minus 2.5rem, not 100vw. Over-declaring made
            // phones pick the 1920w candidate.
            sizes="(max-width: 768px) calc(100vw - 2.5rem), (max-width: 1024px) 46vw, 380px"
            quality={65}
            loading="lazy"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-sm text-muted-foreground">{brand} {model}</span>
          </div>
        )}
        {(brandIconSvg || brandIconName) && (
          <span className="absolute left-3 top-3 inline-flex size-10 items-center justify-center rounded-lg bg-b-paper/95">
            <BrandIcon iconSvg={brandIconSvg} iconName={brandIconName} className="size-5.5" />
          </span>
        )}
        {!isAvailable && (
          <span className="absolute bottom-3 left-3 inline-flex h-7 items-center rounded-md border bg-b-paper px-2.5 text-[13px] font-semibold text-muted-foreground">
            {d("common.vehicle.discontinued")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4.5 p-5 md:px-5.5">
        <div className="min-w-0">
          <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{brand}</div>
          <h3 className="font-heading text-[22px] font-semibold leading-[1.15] tracking-[-0.03em] md:text-2xl">{model}</h3>
        </div>

        <dl className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="mb-1 truncate text-[13px] text-muted-foreground" title={s.label}>{s.label}</dt>
              <dd className="text-[17px] font-semibold leading-tight whitespace-nowrap md:text-lg">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="rounded-lg bg-b-inset px-4 py-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold leading-tight">
              <Home className="size-[15px] text-b-link" aria-hidden />
              {d("pages.vehicle.card.title")}
            </span>
            {home?.charge_port && (
              <span className="inline-flex h-6.5 items-center gap-1.5 rounded-md bg-b-paper px-2 text-[13px] font-semibold text-muted-foreground" title={d(`${f}.chargingHomeDestination.chargePort.label`)}>
                <Plug className="size-[13px]" aria-hidden />
                {home.charge_port}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="font-heading text-[26px] font-semibold leading-none tracking-[-0.03em]">{time ?? "—"}</span>
            {timeRange && <span className="text-sm text-muted-foreground">{timeRange}</span>}
          </div>
          {(power || speed) && (
            <div className="mt-1.5 text-sm text-muted-foreground">
              {[power, speed ? `+${speed}` : null].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground" title={d(`${f}.general.pricePerRange.label`)}>
            {Math.round(pricePerRange)} CHF/km
          </span>
          {viewLabel && !viewLabel.startsWith("[") && (
            <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-b-link">
              {viewLabel}
              <ArrowRight className="size-[15px] transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
