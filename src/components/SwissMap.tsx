"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { t } from "@/lib/i18n/dictionaries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

// Mapping des IDs des cantons suisses vers leurs codes et noms
const cantonMapping: Record<number, { abbr: string; name: string }> = {
  1: { abbr: "ZH", name: "Zürich" }, 2: { abbr: "BE", name: "Bern" },
  3: { abbr: "LU", name: "Luzern" }, 4: { abbr: "UR", name: "Uri" },
  5: { abbr: "SZ", name: "Schwyz" }, 6: { abbr: "OW", name: "Obwalden" },
  7: { abbr: "NW", name: "Nidwalden" }, 8: { abbr: "GL", name: "Glarus" },
  9: { abbr: "ZG", name: "Zug" }, 10: { abbr: "FR", name: "Fribourg" },
  11: { abbr: "SO", name: "Solothurn" }, 12: { abbr: "BS", name: "Basel-Stadt" },
  13: { abbr: "BL", name: "Basel-Landschaft" }, 14: { abbr: "SH", name: "Schaffhausen" },
  15: { abbr: "AR", name: "Appenzell Ausserrhoden" }, 16: { abbr: "AI", name: "Appenzell Innerrhoden" },
  17: { abbr: "SG", name: "St. Gallen" }, 18: { abbr: "GR", name: "Graubünden" },
  19: { abbr: "AG", name: "Aargau" }, 20: { abbr: "TG", name: "Thurgau" },
  21: { abbr: "TI", name: "Ticino" }, 22: { abbr: "VD", name: "Vaud" },
  23: { abbr: "VS", name: "Valais" }, 24: { abbr: "NE", name: "Neuchâtel" },
  25: { abbr: "GE", name: "Genève" }, 26: { abbr: "JU", name: "Jura" },
};

interface Canton {
  properties: { abbr: string; name: string; KANTONSNUM?: number };
  geometry: AnyRecord;
  uniqueId: string;
  scaledPath: string;
}

interface StatConfig {
  id: string;
  icon: string;
  value: number;
}

interface SwissMapProps {
  title?: string;
  subtitle?: string;
  activeCantons?: string[];
  statsConfig?: StatConfig[];
  tPrefix: string;
  dictionary: Record<string, string>;
}

export function SwissMap({
  title,
  subtitle,
  activeCantons = ["GE", "VD", "FR", "VS", "JU", "NE"],
  statsConfig = [],
  tPrefix,
  dictionary,
}: SwissMapProps) {
  const [hoveredCanton, setHoveredCanton] = useState<string | null>(null);
  const [cantons, setCantons] = useState<Canton[]>([]);
  const [viewBox, setViewBox] = useState("0 0 1000 600");

  useEffect(() => {
    fetch("https://labs.karavia.ch/swiss-boundaries-geojson/geojson-lv95/2020/swissBOUNDARIES3D_1_3_TLM_KANTONSGEBIET.geojson")
      .then((res) => res.json())
      .then((cantonsGeo) => {
        if (!cantonsGeo?.features) return;

        const bounds = getBounds(cantonsGeo.features);
        const margin = 40;
        const geoWidth = bounds.maxX - bounds.minX;
        const geoHeight = bounds.maxY - bounds.minY;
        const width = 960;
        const height = (geoHeight / geoWidth) * width + 2 * margin;
        const scale = Math.min(
          (width - 2 * margin) / geoWidth,
          (height - 2 * margin) / geoHeight,
        );
        const offsetX = margin - bounds.minX * scale;
        const offsetY = height - margin + bounds.minY * scale;

        const scaledCantons = cantonsGeo.features.map((feature: AnyRecord, index: number) => {
          const cantonInfo = cantonMapping[feature.properties.KANTONSNUM];
          return {
            uniqueId: `${feature.properties.KANTONSNUM}-${index}`,
            properties: {
              ...feature.properties,
              abbr: cantonInfo?.abbr || "XX",
              name: cantonInfo?.name || feature.properties.NAME,
            },
            geometry: feature.geometry,
            scaledPath: geometryToPath(feature.geometry, scale, offsetX, offsetY),
          };
        });

        setCantons(scaledCantons);
        setViewBox(`0 0 ${width} ${height}`);
      })
      .catch((err) => {
        console.error("Error loading Swiss map:", err);
      });
  }, []);

  function getBounds(features: AnyRecord[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    features.forEach((feature) => {
      traverseCoordinates(feature.geometry.coordinates, (coords: number[]) => {
        const [x, y] = coords;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      });
    });
    return { minX, minY, maxX, maxY };
  }

  function traverseCoordinates(coords: unknown[], callback: (coord: number[]) => void) {
    if (typeof (coords as number[])[0] === "number") {
      callback(coords as number[]);
    } else {
      (coords as unknown[][]).forEach((c) => traverseCoordinates(c, callback));
    }
  }

  function geometryToPath(geometry: AnyRecord, scale: number, offsetX: number, offsetY: number): string {
    if (!geometry) return "";
    if (geometry.type === "Polygon") {
      return geometry.coordinates.map((ring: number[][]) => ringToPath(ring, scale, offsetX, offsetY)).join(" ");
    } else if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.map((polygon: number[][][]) =>
        polygon.map((ring: number[][]) => ringToPath(ring, scale, offsetX, offsetY)).join(" "),
      ).join(" ");
    }
    return "";
  }

  function ringToPath(ring: number[][], scale: number, offsetX: number, offsetY: number): string {
    if (!ring?.length) return "";
    return ring.map((coord, i) => {
      const [x, y] = coord;
      const sx = x * scale + offsetX;
      const sy = -(y * scale) + offsetY;
      return i === 0 ? `M${sx},${sy}` : `L${sx},${sy}`;
    }).join("") + "Z";
  }

  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4">{title}</h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">{subtitle}</p>
        </div>

        <div className="max-w-6xl mx-auto">
          <Card className="p-6 md:p-8 mb-8">
            <div className="relative">
              {cantons.length > 0 ? (
                <svg viewBox={viewBox} className="w-full h-auto" style={{ maxHeight: "600px" }}>
                  <g>
                    {cantons.map((canton) => {
                      const isActive = activeCantons.includes(canton.properties.abbr);
                      const isHovered = hoveredCanton === canton.properties.abbr;
                      let fillColor = "#f1f5f9";
                      if (isActive) fillColor = isHovered ? "#22c55e40" : "#22c55e20";
                      else if (isHovered) fillColor = "#e2e8f0";

                      return (
                        <path
                          key={canton.uniqueId}
                          d={canton.scaledPath}
                          fill={fillColor}
                          stroke={isActive ? "#22c55e66" : "#cbd5e1"}
                          strokeWidth={isActive ? "1.5" : "1"}
                          className="transition-all duration-200 cursor-pointer"
                          onMouseEnter={() => setHoveredCanton(canton.properties.abbr)}
                          onMouseLeave={() => setHoveredCanton(null)}
                          data-testid={`canton-${canton.properties.abbr}`}
                        />
                      );
                    })}
                    {hoveredCanton && (() => {
                      const hovered = cantons.find((c) => c.properties.abbr === hoveredCanton);
                      if (!hovered) return null;
                      const isActive = activeCantons.includes(hoveredCanton);
                      return (
                        <path
                          d={hovered.scaledPath}
                          fill={isActive ? "#22c55e40" : "#e2e8f0"}
                          stroke={isActive ? "#22c55e" : "#94a3b8"}
                          strokeWidth="2.5"
                          pointerEvents="none"
                          className="transition-all duration-200"
                        />
                      );
                    })()}
                  </g>
                </svg>
              ) : (
                <div className="flex items-center justify-center h-96">
                  <div className="text-muted-foreground">{t(dictionary, "common.loadingMap")}</div>
                </div>
              )}

              {/* Hover tooltip with coat of arms */}
              {hoveredCanton && (
                <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur-sm border rounded-xl p-4 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 min-w-[200px]">
                  <div className="flex items-center gap-3">
                    <img
                      src={`/canton-coats/${hoveredCanton}.svg`}
                      alt=""
                      loading="lazy"
                      width={40}
                      height={40}
                      className="h-10 w-10 object-contain shrink-0"
                    />
                    <div>
                      <div className="font-semibold text-sm leading-tight">
                        {cantons.find((c) => c.properties.abbr === hoveredCanton)?.properties.name}
                      </div>
                      {activeCantons.includes(hoveredCanton) ? (
                        <Badge variant="default" className="mt-1 text-xs bg-primary/15 text-primary border-primary/25 hover:bg-primary/15">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t(dictionary, `${tPrefix}.location.map.activeCantons`)}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {t(dictionary, `${tPrefix}.location.map.inactiveCantons`)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#22c55e20", border: "1px solid #22c55e66" }} />
                <span>{t(dictionary, `${tPrefix}.location.legend.activeCantons`)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-300" />
                <span>{t(dictionary, `${tPrefix}.location.legend.inactiveCantons`)}</span>
              </div>
            </div>
          </Card>

          {/* Statistics Cards */}
          {statsConfig.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {statsConfig.map((stat) => {
                const IconComponent = stat.icon === "Pin" || stat.icon === "MapPin" ? MapPin
                  : stat.icon === "CheckCircle" ? CheckCircle
                  : () => (
                    <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-primary">
                      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" fill="currentColor" />
                    </svg>
                  );

                return (
                  <Card key={stat.id} className="p-6 text-center" data-testid={`stat-${stat.id}`}>
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <IconComponent className="h-8 w-8 text-primary" />
                    </div>
                    <div className="text-3xl font-heading font-bold text-primary mb-2">
                      {stat.value >= 1000 ? `${stat.value.toLocaleString()}+` : stat.value}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t(dictionary, `${tPrefix}.location.stats.${stat.id}`)}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
