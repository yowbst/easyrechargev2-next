"use client";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Battery,
  Zap,
  MapPin,
  SlidersHorizontal,
  X,
  Plug,
  Clock,
  Gauge,
  BadgeDollarSign,
  Rocket,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n/dictionaries";
import type { VehicleFiltersState } from "@/hooks/useVehicleFilters";

/** Extract the first number from a Slider onValueChange payload. */
function val(v: number | readonly number[]): number {
  return Array.isArray(v) ? v[0] : (v as number);
}

interface VehicleFiltersProps {
  filters: VehicleFiltersState;
  onFilterChange?: () => void;
  dictionary: Record<string, string>;
}

export function VehicleFilters({
  filters,
  onFilterChange,
  dictionary,
}: VehicleFiltersProps) {
  const {
    showFilters, setShowFilters,
    hasActiveFilters, clearFilters,
    filterBounds, uniqueChargePorts,
    rangeFilter, setRangeFilter,
    batteryFilter, setBatteryFilter,
    efficiencyFilter, setEfficiencyFilter,
    pricePerRangeFilter, setPricePerRangeFilter,
    chargePortFilter, setChargePortFilter,
    chargePowerFilter, setChargePowerFilter,
    chargeTimeFilter, setChargeTimeFilter,
    chargeSpeedFilter, setChargeSpeedFilter,
  } = filters;

  const d = (key: string) => t(dictionary, key);
  const [showCharging, setShowCharging] = useState(true);

  const handleFilterChange = () => {
    onFilterChange?.();
  };

  const prefix = "shared.vehiclesFilters";

  // Count active filters for the badge
  const activeCount = [
    rangeFilter > 0,
    batteryFilter > 0,
    efficiencyFilter < Infinity && efficiencyFilter > 0,
    pricePerRangeFilter < Infinity,
    chargePortFilter !== null,
    chargePowerFilter > 0,
    chargeTimeFilter < Infinity,
    chargeSpeedFilter > 0,
  ].filter(Boolean).length;

  return (
    <section className="border-b">
      <div className="container mx-auto px-4 py-4">
        {/* Toggle row */}
        <div className="flex items-center gap-3">
          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
            data-testid="button-toggle-filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {showFilters ? d(`${prefix}.hide`) : d(`${prefix}.show`)}
            {activeCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/20 px-1.5 text-[11px] font-bold tabular-nums">
                {activeCount}
              </span>
            )}
          </Button>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { clearFilters(); onFilterChange?.(); }}
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              data-testid="button-clear-filters"
            >
              <X className="h-3.5 w-3.5" />
              {d(`${prefix}.clear`)}
            </Button>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-5 space-y-6 animate-in slide-in-from-top-2 fade-in-0 duration-200">
            {/* General filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <FilterCard
                icon={<MapPin className="h-4 w-4 text-primary" />}
                label={d(`${prefix}.general.range.label`)}
                valueLabel={rangeFilter > 0 ? `≥ ${rangeFilter} km` : d(`${prefix}.all`)}
                active={rangeFilter > 0}
              >
                <Slider
                  value={[rangeFilter]}
                  onValueChange={(v) => { setRangeFilter(val(v)); handleFilterChange(); }}
                  min={filterBounds.range.min}
                  max={filterBounds.range.max}
                  step={10}
                  data-testid="slider-range-filter"
                />
                <FilterBoundsLabel min={`${filterBounds.range.min} km`} max={`${filterBounds.range.max} km`} />
              </FilterCard>

              <FilterCard
                icon={<Battery className="h-4 w-4 text-primary" />}
                label={d(`${prefix}.general.battery.label`)}
                valueLabel={batteryFilter > 0 ? `≥ ${batteryFilter} kWh` : d(`${prefix}.all`)}
                active={batteryFilter > 0}
              >
                <Slider
                  value={[batteryFilter]}
                  onValueChange={(v) => { setBatteryFilter(val(v)); handleFilterChange(); }}
                  min={filterBounds.battery.min}
                  max={filterBounds.battery.max}
                  step={5}
                  data-testid="slider-battery-filter"
                />
                <FilterBoundsLabel min={`${filterBounds.battery.min} kWh`} max={`${filterBounds.battery.max} kWh`} />
              </FilterCard>

              <FilterCard
                icon={<Gauge className="h-4 w-4 text-primary" />}
                label={d(`${prefix}.general.efficiency.label`)}
                valueLabel={efficiencyFilter < Infinity && efficiencyFilter > 0 ? `≤ ${efficiencyFilter} Wh/km` : d(`${prefix}.all`)}
                active={efficiencyFilter < Infinity && efficiencyFilter > 0}
              >
                <Slider
                  value={[efficiencyFilter === Infinity ? filterBounds.efficiency.max : efficiencyFilter]}
                  onValueChange={(v) => {
                    const n = val(v);
                    setEfficiencyFilter(n === filterBounds.efficiency.max ? Infinity : n);
                    handleFilterChange();
                  }}
                  min={filterBounds.efficiency.min}
                  max={filterBounds.efficiency.max}
                  step={5}
                  data-testid="slider-efficiency-filter"
                />
                <FilterBoundsLabel min={`${filterBounds.efficiency.min} Wh/km`} max={`${filterBounds.efficiency.max} Wh/km`} />
              </FilterCard>

              <FilterCard
                icon={<BadgeDollarSign className="h-4 w-4 text-primary" />}
                label={d(`${prefix}.general.pricePerRange.label`)}
                valueLabel={pricePerRangeFilter < Infinity ? `≤ ${pricePerRangeFilter} CHF/km` : d(`${prefix}.all`)}
                active={pricePerRangeFilter < Infinity}
              >
                <Slider
                  value={[pricePerRangeFilter === Infinity ? filterBounds.pricePerRange.max : pricePerRangeFilter]}
                  onValueChange={(v) => {
                    const n = val(v);
                    setPricePerRangeFilter(n === filterBounds.pricePerRange.max ? Infinity : n);
                    handleFilterChange();
                  }}
                  min={filterBounds.pricePerRange.min}
                  max={filterBounds.pricePerRange.max}
                  step={5}
                  data-testid="slider-price-per-range-filter"
                />
                <FilterBoundsLabel min={`${filterBounds.pricePerRange.min} CHF/km`} max={`${filterBounds.pricePerRange.max} CHF/km`} />
              </FilterCard>
            </div>

            {/* Charging section — collapsible */}
            <div>
              <button
                type="button"
                onClick={() => setShowCharging(!showCharging)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plug className="h-4 w-4" />
                {d(`${prefix}.chargingHomeDestination.title`)}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showCharging ? "rotate-180" : ""}`} />
              </button>

              {showCharging && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-1 fade-in-0 duration-150">
                  {uniqueChargePorts.length > 0 && (
                    <FilterCard
                      icon={<Plug className="h-4 w-4 text-primary" />}
                      label={d(`${prefix}.chargingHomeDestination.chargePort.label`)}
                      valueLabel={chargePortFilter || d(`${prefix}.all`)}
                      active={chargePortFilter !== null}
                    >
                      <Select
                        value={chargePortFilter || "all"}
                        onValueChange={(value) => {
                          setChargePortFilter(value === "all" ? null : value);
                          handleFilterChange();
                        }}
                      >
                        <SelectTrigger data-testid="select-charge-port-filter">
                          <SelectValue placeholder={d(`${prefix}.all`)} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{d(`${prefix}.all`)}</SelectItem>
                          {uniqueChargePorts.map((port) => (
                            <SelectItem key={port} value={port}>{port}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FilterCard>
                  )}

                  <FilterCard
                    icon={<Zap className="h-4 w-4 text-primary" />}
                    label={d(`${prefix}.chargingHomeDestination.chargePower.label`)}
                    valueLabel={chargePowerFilter > 0 ? `≥ ${chargePowerFilter} kW` : d(`${prefix}.all`)}
                    active={chargePowerFilter > 0}
                  >
                    <Slider
                      value={[chargePowerFilter]}
                      onValueChange={(v) => { setChargePowerFilter(val(v)); handleFilterChange(); }}
                      min={filterBounds.chargePower.min}
                      max={filterBounds.chargePower.max}
                      step={1}
                      data-testid="slider-charge-power-filter"
                    />
                    <FilterBoundsLabel min={`${filterBounds.chargePower.min} kW`} max={`${filterBounds.chargePower.max} kW`} />
                  </FilterCard>

                  <FilterCard
                    icon={<Clock className="h-4 w-4 text-primary" />}
                    label={d(`${prefix}.chargingHomeDestination.chargeTime.label`)}
                    valueLabel={chargeTimeFilter < Infinity ? `≤ ${chargeTimeFilter} min` : d(`${prefix}.all`)}
                    active={chargeTimeFilter < Infinity}
                  >
                    <Slider
                      value={[chargeTimeFilter === Infinity ? filterBounds.chargeTime.max : chargeTimeFilter]}
                      onValueChange={(v) => {
                        const n = val(v);
                        setChargeTimeFilter(n === filterBounds.chargeTime.max ? Infinity : n);
                        handleFilterChange();
                      }}
                      min={filterBounds.chargeTime.min}
                      max={filterBounds.chargeTime.max}
                      step={1}
                      data-testid="slider-charge-time-filter"
                    />
                    <FilterBoundsLabel min={`${filterBounds.chargeTime.min} min`} max={`${filterBounds.chargeTime.max} min`} />
                  </FilterCard>

                  <FilterCard
                    icon={<Rocket className="h-4 w-4 text-primary" />}
                    label={d(`${prefix}.chargingHomeDestination.chargeSpeed.label`)}
                    valueLabel={chargeSpeedFilter > 0 ? `≥ ${chargeSpeedFilter} km/h` : d(`${prefix}.all`)}
                    active={chargeSpeedFilter > 0}
                  >
                    <Slider
                      value={[chargeSpeedFilter]}
                      onValueChange={(v) => { setChargeSpeedFilter(val(v)); handleFilterChange(); }}
                      min={filterBounds.chargeSpeed.min}
                      max={filterBounds.chargeSpeed.max}
                      step={5}
                      data-testid="slider-charge-speed-filter"
                    />
                    <FilterBoundsLabel min={`${filterBounds.chargeSpeed.min} km/h`} max={`${filterBounds.chargeSpeed.max} km/h`} />
                  </FilterCard>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function FilterCard({
  icon,
  label,
  valueLabel,
  active,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  valueLabel: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-4 space-y-3 transition-colors ${
        active
          ? "border-primary/30 bg-primary/5 dark:bg-primary/10"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <span className={`text-xs font-medium tabular-nums ${active ? "text-primary" : "text-muted-foreground"}`}>
          {valueLabel}
        </span>
      </div>
      {children}
    </div>
  );
}

function FilterBoundsLabel({ min, max }: { min: string; max: string }) {
  return (
    <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
      <span>{min}</span>
      <span>{max}</span>
    </div>
  );
}
