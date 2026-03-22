"use client";

import { t } from "@/lib/i18n/dictionaries";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Snowflake, Sun } from "lucide-react";

interface RangeCardProps {
  label: string;
  data: any;
  tooltip?: string;
}

function RangeCard({ label, data, tooltip }: RangeCardProps) {
  if (!data) return null;
  const km = data.value || data;
  const numKm = typeof km === "number" ? km : parseInt(String(km), 10);
  if (!numKm || isNaN(numKm)) return null;

  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground mb-1">
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
}: VehicleDetailClientProps) {
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);

  return (
    <section className="py-12 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-heading font-bold mb-4">
            {d("pages.vehicle.sections.realRange")}
          </h2>
          {realRangeMin != null && realRangeMax != null && (
            <p className="text-lg text-muted-foreground mb-8">
              {d("pages.vehicle.realRange.banner", { min: realRangeMin, max: realRangeMax })}
            </p>
          )}

          <Tabs defaultValue="mild">
            <TabsList className="mb-6">
              <TabsTrigger value="cold" className="gap-1.5">
                <Snowflake className="h-4 w-4" />
                {d("pages.vehicle.realRange.cold")}
              </TabsTrigger>
              <TabsTrigger value="mild" className="gap-1.5">
                <Sun className="h-4 w-4" />
                {d("pages.vehicle.realRange.mild")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cold">
              <p className="text-sm text-muted-foreground mb-4">
                {d("pages.vehicle.realRange.coldDesc")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <RangeCard label={d("pages.vehicle.realRange.city")} data={coldCity} />
                <RangeCard
                  label={d("pages.vehicle.realRange.highway")}
                  tooltip={d("pages.vehicle.realRange.highwayTooltip")}
                  data={coldHighway}
                />
                <RangeCard label={d("pages.vehicle.realRange.combined")} data={coldCombined} />
              </div>
            </TabsContent>

            <TabsContent value="mild">
              <p className="text-sm text-muted-foreground mb-4">
                {d("pages.vehicle.realRange.mildDesc")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <RangeCard label={d("pages.vehicle.realRange.city")} data={mildCity} />
                <RangeCard
                  label={d("pages.vehicle.realRange.highway")}
                  tooltip={d("pages.vehicle.realRange.highwayTooltip")}
                  data={mildHighway}
                />
                <RangeCard label={d("pages.vehicle.realRange.combined")} data={mildCombined} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  );
}
