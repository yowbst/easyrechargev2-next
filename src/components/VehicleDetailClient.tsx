"use client";

import { t } from "@/lib/i18n/dictionaries";
import { Card } from "@/components/ui/card";
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
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1.5">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        {tooltip ? <InfoTooltip content={tooltip}>{label}</InfoTooltip> : label}
      </div>
      <div className="text-2xl font-bold">{numKm} km</div>
    </Card>
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
    <section className="py-12">
      <div className="container mx-auto px-4">
          <Tabs defaultValue="mild">
            <div className="mb-8">
              <h2 className="text-xl sm:text-2xl font-heading font-bold">
                {d("pages.vehicle.sections.realRangeOf", { brand, model })}
              </h2>
              {intro && (
                <p className="text-base text-muted-foreground leading-relaxed mt-2">{intro}</p>
              )}
            </div>
            <TabsList className="h-auto w-full sm:w-auto p-1.5 gap-1.5 mb-6">
              <TabsTrigger value="cold" className="px-8 py-3.5 text-sm gap-2">
                <Snowflake className="h-4 w-4" />
                {d("pages.vehicle.realRange.cold")}
              </TabsTrigger>
              <TabsTrigger value="mild" className="px-8 py-3.5 text-sm gap-2">
                <Sun className="h-4 w-4" />
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
              <p className="flex items-start gap-2 text-xs text-muted-foreground mt-4">
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
              <p className="flex items-start gap-2 text-xs text-muted-foreground mt-4">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {d("pages.vehicle.realRange.mildDesc")}
              </p>
            </TabsContent>
          </Tabs>
      </div>
    </section>
  );
}
