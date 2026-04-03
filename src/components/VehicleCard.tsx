"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { cmsImage } from "@/lib/directusAssets";
import {
  Clock,
  Plug,
  Zap,
  Gauge,
  MapPin,
  Battery,
  BadgeDollarSign,
  Rocket,
} from "lucide-react";
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
  lang: string;
  dictionary: Record<string, string>;
}

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
  lang,
  dictionary,
}: VehicleCardProps) {
  const d = (key: string) => t(dictionary, key);

  const vehiclesPath = getRouteSlug(lang, "vehicles");
  const vehicleSlug = slug || id;
  const vehicleUrl = `/${lang}/${vehiclesPath}/${vehicleSlug}`;

  return (
    <Link href={vehicleUrl} title={`${brand} ${model}`}>
      <Card
        className="overflow-hidden hover-elevate transition-all duration-300 h-full pt-0 gap-0"
        data-testid={`card-vehicle-${id}`}
      >
        <div className="aspect-video overflow-hidden relative">
          {image ? (
            <img
              {...cmsImage(image, [400, 700])}
              alt={`${brand} ${model}`}
              loading="lazy"
              width={700}
              height={394}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-muted-foreground text-sm">{brand} {model}</span>
            </div>
          )}
          {(brandIconSvg || brandIconName) && (
            <div className="absolute top-4 left-4 bg-background/90 backdrop-blur rounded-lg p-2">
              <BrandIcon iconSvg={brandIconSvg} iconName={brandIconName} className="h-6 w-6" />
            </div>
          )}
          <div className="absolute top-4 right-4 bg-background/90 backdrop-blur rounded-lg p-2.5 flex flex-col gap-2 text-[11px] font-bold shadow-md border border-border/50 w-28">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{rangeDisplay}</span>
            </div>
            <div className="flex items-center gap-2">
              <Battery className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{batteryDisplay}</span>
            </div>
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{efficiencyDisplay}</span>
            </div>
            <div className="flex items-center gap-2">
              <BadgeDollarSign className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">
                {Math.round(pricePerRange)} CHF/km
              </span>
            </div>
          </div>
        </div>
        <div className="p-4 flex flex-col items-start">
          <div className="flex flex-row items-center gap-2 mb-1">
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wider font-bold py-0 h-4"
            >
              {brand}
            </Badge>
            <h3 className="text-lg font-heading font-bold truncate w-full">
              {model}
            </h3>
          </div>

          <div className="mt-3 pt-3 border-t border-border/50 w-full">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">
              {d("pages.vehicle.card.title")}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <Plug className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {d("pages.vehicle.card.chargePort")}
                  </span>
                </div>
                <span className="text-[11px] font-medium">
                  {charging?.home_destination?.charge_port ?? "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {d("pages.vehicle.card.chargeTime")}
                    {charging?.home_destination?.charge_time?.range?.from
                      ?.value != null &&
                    charging?.home_destination?.charge_time?.range?.to?.value !=
                      null
                      ? ` (${charging.home_destination.charge_time.range.from.value}-${charging.home_destination.charge_time.range.to.value}${charging.home_destination.charge_time.range.to.unit})`
                      : " (-)"}
                  </span>
                </div>
                <span className="text-[11px] font-medium">
                  {charging?.home_destination?.charge_time?.value &&
                  charging?.home_destination?.charge_time?.unit
                    ? `${charging.home_destination.charge_time.value} ${charging.home_destination.charge_time.unit}`
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {d("pages.vehicle.card.chargePower")}
                  </span>
                </div>
                <span className="text-[11px] font-medium">
                  {charging?.home_destination?.charge_power?.value &&
                  charging?.home_destination?.charge_power?.unit
                    ? `${charging.home_destination.charge_power.value} ${charging.home_destination.charge_power.unit}`
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <Rocket className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {d("pages.vehicle.card.chargeSpeed")}
                  </span>
                </div>
                <span className="text-[11px] font-medium">
                  {charging?.home_destination?.charge_speed?.value &&
                  charging?.home_destination?.charge_speed?.unit
                    ? `${charging.home_destination.charge_speed.value} ${charging.home_destination.charge_speed.unit}`
                    : "-"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
