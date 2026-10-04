"use client";

import { t } from "@/lib/i18n/dictionaries";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Snowflake, Sun, Info, Building2, Route, BarChart3, type LucideIcon } from "lucide-react";

interface RangeCardProps {
  label: string;
  data: any;
  tooltip?: string;
  icon: LucideIcon;
}

function RangeCard({ label, data, tooltip, icon: Icon }: RangeCardProps) {
  if (!data) return null;
  const km = data.value || data;
  const numKm = typeof km === "number" ? km : parseInt(String(km), 10);
  if (!numKm || isNaN(numKm)) return null;

  return (
    <div className="rounded-xl bg-b-sand p-5.5">
      <div className="mb-2.5 flex items-center gap-2 text-[15px] text-muted-foreground">
        <Icon className="size-4 shrink-0 text-b-link" />
        {tooltip ? <InfoTooltip content={tooltip}>{label}</InfoTooltip> : label}
      </div>
      <div className="font-heading text-[32px] font-semibold leading-none tracking-[-0.03em]">{numKm} km</div>
    </div>
  );
}

interface VehicleDetailClientProps {
  dictionary: Record<string, string>;
  realRange: any;
  coldCity: any;
  coldHighway: any;
  coldCombined: any;
  mildCity: any;
  mildHighway: any;
  mildCombined: any;
  realRangeMin?: number;
  realRangeMax?: number;
  brand?: string;
  model?: string;
  lang?: string;
  intro?: string;
}

export function VehicleDetailClient({
  dictionary,
  coldCity,
  coldHighway,
  coldCombined,
  mildCity,
  mildHighway,
  mildCombined,
  realRangeMin,
  realRangeMax,
  brand,
  model,
  lang,
  intro,
}: VehicleDetailClientProps) {
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);

  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto w-full max-w-[1240px] px-5 md:px-10">
          <Tabs defaultValue="mild">
            <div className="mb-5">
              <h2 className="font-heading text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] md:text-[32px]">
                {d("pages.vehicle.sections.realRangeOf", { brand: brand || "", model: model || "" })}
              </h2>
              {intro && (
                <p className="mt-2 max-w-[45rem] text-[17px] leading-relaxed text-muted-foreground">{intro}</p>
              )}
            </div>
            <TabsList className="mb-5 h-auto w-full gap-1 rounded-lg bg-b-sand p-1 sm:w-auto">
              <TabsTrigger value="cold" className="h-11 gap-2 rounded-md px-5 text-[15px] font-semibold text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-[0_1px_2px_rgba(7,35,26,.12)]">
                <Snowflake className="h-4 w-4" />
                {d("pages.vehicle.realRange.cold")}
              </TabsTrigger>
              <TabsTrigger value="mild" className="h-11 gap-2 rounded-md px-5 text-[15px] font-semibold text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-[0_1px_2px_rgba(7,35,26,.12)]">
                <Sun className="h-4 w-4 text-[#A16207]" />
                {d("pages.vehicle.realRange.mild")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cold">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <RangeCard icon={Building2} label={d("pages.vehicle.realRange.city")} data={coldCity} />
                <RangeCard
                  icon={Route}
                  label={d("pages.vehicle.realRange.highway")}
                  tooltip={d("pages.vehicle.realRange.highwayTooltip")}
                  data={coldHighway}
                />
                <RangeCard icon={BarChart3} label={d("pages.vehicle.realRange.combined")} data={coldCombined} />
              </div>
              <p className="mt-3.5 flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {d("pages.vehicle.realRange.coldDesc")}
              </p>
            </TabsContent>

            <TabsContent value="mild">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <RangeCard icon={Building2} label={d("pages.vehicle.realRange.city")} data={mildCity} />
                <RangeCard
                  icon={Route}
                  label={d("pages.vehicle.realRange.highway")}
                  tooltip={d("pages.vehicle.realRange.highwayTooltip")}
                  data={mildHighway}
                />
                <RangeCard icon={BarChart3} label={d("pages.vehicle.realRange.combined")} data={mildCombined} />
              </div>
              <p className="mt-3.5 flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {d("pages.vehicle.realRange.mildDesc")}
              </p>
            </TabsContent>
          </Tabs>
      </div>
    </section>
  );
}
