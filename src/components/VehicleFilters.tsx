"use client";

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
import { useEffect, useState } from "react";
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
  /** Number of vehicles matching — shown in the bar and on the mobile sheet's button. */
  resultCount: number;
  /** Result count / page line, rendered at the right of the bar (role="status"). */
  status?: React.ReactNode;
}

/**
 * Vehicle filters, Direction B (design 13 Véhicules). Desktop: the eight
 * filters open inline under the bar. Mobile: they open in a bottom sheet with
 * a pinned "show {n} vehicles" button, instead of pushing the grid down.
 * Active filters are repeated as removable chips under the bar.
 */
export function VehicleFilters({
  filters,
  onFilterChange,
  dictionary,
  resultCount,
  status,
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

  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);
  const [showCharging, setShowCharging] = useState(true);
  const changed = () => onFilterChange?.();
  const prefix = "shared.vehiclesFilters";

  // Bottom sheet on mobile: Escape closes it and the page behind does not scroll.
  useEffect(() => {
    if (!showFilters) return;
    const mobile = window.matchMedia("(max-width: 767px)");
    if (!mobile.matches) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowFilters(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [showFilters, setShowFilters]);

  const efficiencyOn = efficiencyFilter < Infinity && efficiencyFilter > 0;
  const active = [
    { on: rangeFilter > 0, label: d(`${prefix}.general.range.label`), value: `≥ ${rangeFilter} km`, reset: () => setRangeFilter(0) },
    { on: batteryFilter > 0, label: d(`${prefix}.general.battery.label`), value: `≥ ${batteryFilter} kWh`, reset: () => setBatteryFilter(0) },
    { on: efficiencyOn, label: d(`${prefix}.general.efficiency.label`), value: `≤ ${efficiencyFilter} Wh/km`, reset: () => setEfficiencyFilter(Infinity) },
    { on: pricePerRangeFilter < Infinity, label: d(`${prefix}.general.pricePerRange.label`), value: `≤ ${pricePerRangeFilter} CHF/km`, reset: () => setPricePerRangeFilter(Infinity) },
    { on: chargePortFilter !== null, label: d(`${prefix}.chargingHomeDestination.chargePort.label`), value: chargePortFilter ?? "", reset: () => setChargePortFilter(null) },
    { on: chargePowerFilter > 0, label: d(`${prefix}.chargingHomeDestination.chargePower.label`), value: `≥ ${chargePowerFilter} kW`, reset: () => setChargePowerFilter(0) },
    { on: chargeTimeFilter < Infinity, label: d(`${prefix}.chargingHomeDestination.chargeTime.label`), value: `≤ ${chargeTimeFilter} min`, reset: () => setChargeTimeFilter(Infinity) },
    { on: chargeSpeedFilter > 0, label: d(`${prefix}.chargingHomeDestination.chargeSpeed.label`), value: `≥ ${chargeSpeedFilter} km/h`, reset: () => setChargeSpeedFilter(0) },
  ].filter((a) => a.on);
  const activeCount = active.length;

  const sheetTitle = d(`${prefix}.title`);
  const applyLabel = d(`${prefix}.apply`, { count: resultCount });

  const panel = (
    <div className="space-y-6">
      {/* General filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
        <FilterCard icon={MapPin} label={d(`${prefix}.general.range.label`)} valueLabel={rangeFilter > 0 ? `≥ ${rangeFilter} km` : d(`${prefix}.all`)} active={rangeFilter > 0}>
          <Slider value={[rangeFilter]} onValueChange={(v) => { setRangeFilter(val(v)); changed(); }} min={filterBounds.range.min} max={filterBounds.range.max} step={10} data-testid="slider-range-filter" />
          <FilterBoundsLabel min={`${filterBounds.range.min} km`} max={`${filterBounds.range.max} km`} />
        </FilterCard>

        <FilterCard icon={Battery} label={d(`${prefix}.general.battery.label`)} valueLabel={batteryFilter > 0 ? `≥ ${batteryFilter} kWh` : d(`${prefix}.all`)} active={batteryFilter > 0}>
          <Slider value={[batteryFilter]} onValueChange={(v) => { setBatteryFilter(val(v)); changed(); }} min={filterBounds.battery.min} max={filterBounds.battery.max} step={5} data-testid="slider-battery-filter" />
          <FilterBoundsLabel min={`${filterBounds.battery.min} kWh`} max={`${filterBounds.battery.max} kWh`} />
        </FilterCard>

        <FilterCard icon={Gauge} label={d(`${prefix}.general.efficiency.label`)} valueLabel={efficiencyOn ? `≤ ${efficiencyFilter} Wh/km` : d(`${prefix}.all`)} active={efficiencyOn}>
          <Slider
            value={[efficiencyFilter === Infinity ? filterBounds.efficiency.max : efficiencyFilter]}
            onValueChange={(v) => { const n = val(v); setEfficiencyFilter(n === filterBounds.efficiency.max ? Infinity : n); changed(); }}
            min={filterBounds.efficiency.min} max={filterBounds.efficiency.max} step={5} data-testid="slider-efficiency-filter"
          />
          <FilterBoundsLabel min={`${filterBounds.efficiency.min} Wh/km`} max={`${filterBounds.efficiency.max} Wh/km`} />
        </FilterCard>

        <FilterCard icon={BadgeDollarSign} label={d(`${prefix}.general.pricePerRange.label`)} valueLabel={pricePerRangeFilter < Infinity ? `≤ ${pricePerRangeFilter} CHF/km` : d(`${prefix}.all`)} active={pricePerRangeFilter < Infinity}>
          <Slider
            value={[pricePerRangeFilter === Infinity ? filterBounds.pricePerRange.max : pricePerRangeFilter]}
            onValueChange={(v) => { const n = val(v); setPricePerRangeFilter(n === filterBounds.pricePerRange.max ? Infinity : n); changed(); }}
            min={filterBounds.pricePerRange.min} max={filterBounds.pricePerRange.max} step={5} data-testid="slider-price-per-range-filter"
          />
          <FilterBoundsLabel min={`${filterBounds.pricePerRange.min} CHF/km`} max={`${filterBounds.pricePerRange.max} CHF/km`} />
        </FilterCard>
      </div>

      {/* Charging section — collapsible, open by default */}
      <div>
        <button
          type="button"
          onClick={() => setShowCharging(!showCharging)}
          aria-expanded={showCharging}
          className="flex min-h-11 items-center gap-2 text-[15px] font-semibold text-foreground"
        >
          <Plug className="size-4 text-b-link" aria-hidden />
          {d(`${prefix}.chargingHomeDestination.title`)}
          <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${showCharging ? "rotate-180" : ""}`} aria-hidden />
        </button>

        {showCharging && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
            {uniqueChargePorts.length > 0 && (
              <FilterCard icon={Plug} label={d(`${prefix}.chargingHomeDestination.chargePort.label`)} valueLabel={chargePortFilter || d(`${prefix}.all`)} active={chargePortFilter !== null}>
                <Select
                  value={chargePortFilter || "all"}
                  onValueChange={(value) => { setChargePortFilter(value === "all" ? null : value); changed(); }}
                >
                  <SelectTrigger className="h-11 w-full bg-b-paper" data-testid="select-charge-port-filter">
                    {/* Base UI renders the raw value otherwise ("all"). */}
                    <SelectValue>{(value: string | null) => (!value || value === "all" ? d(`${prefix}.all`) : value)}</SelectValue>
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

            <FilterCard icon={Zap} label={d(`${prefix}.chargingHomeDestination.chargePower.label`)} valueLabel={chargePowerFilter > 0 ? `≥ ${chargePowerFilter} kW` : d(`${prefix}.all`)} active={chargePowerFilter > 0}>
              <Slider value={[chargePowerFilter]} onValueChange={(v) => { setChargePowerFilter(val(v)); changed(); }} min={filterBounds.chargePower.min} max={filterBounds.chargePower.max} step={1} data-testid="slider-charge-power-filter" />
              <FilterBoundsLabel min={`${filterBounds.chargePower.min} kW`} max={`${filterBounds.chargePower.max} kW`} />
            </FilterCard>

            <FilterCard icon={Clock} label={d(`${prefix}.chargingHomeDestination.chargeTime.label`)} valueLabel={chargeTimeFilter < Infinity ? `≤ ${chargeTimeFilter} min` : d(`${prefix}.all`)} active={chargeTimeFilter < Infinity}>
              <Slider
                value={[chargeTimeFilter === Infinity ? filterBounds.chargeTime.max : chargeTimeFilter]}
                onValueChange={(v) => { const n = val(v); setChargeTimeFilter(n === filterBounds.chargeTime.max ? Infinity : n); changed(); }}
                min={filterBounds.chargeTime.min} max={filterBounds.chargeTime.max} step={1} data-testid="slider-charge-time-filter"
              />
              <FilterBoundsLabel min={`${filterBounds.chargeTime.min} min`} max={`${filterBounds.chargeTime.max} min`} />
            </FilterCard>

            <FilterCard icon={Rocket} label={d(`${prefix}.chargingHomeDestination.chargeSpeed.label`)} valueLabel={chargeSpeedFilter > 0 ? `≥ ${chargeSpeedFilter} km/h` : d(`${prefix}.all`)} active={chargeSpeedFilter > 0}>
              <Slider value={[chargeSpeedFilter]} onValueChange={(v) => { setChargeSpeedFilter(val(v)); changed(); }} min={filterBounds.chargeSpeed.min} max={filterBounds.chargeSpeed.max} step={5} data-testid="slider-charge-speed-filter" />
              <FilterBoundsLabel min={`${filterBounds.chargeSpeed.min} km/h`} max={`${filterBounds.chargeSpeed.max} km/h`} />
            </FilterCard>
          </div>
        )}
      </div>
    </div>
  );

  return (
    // Sliders and the active state use the Charge green, not the page's Forest primary.
    <div className="[--primary:var(--b-charge,var(--primary))]">
      {/* Bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-4">
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          className="inline-flex h-11 items-center gap-2 rounded-md border-[1.5px] border-foreground px-4.5 text-[15px] font-semibold transition-colors hover:bg-b-inset"
          data-testid="button-toggle-filters"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {showFilters ? d(`${prefix}.hide`) : d(`${prefix}.show`)}
          {activeCount > 0 && (
            <span className="inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-md bg-b-charge px-1.5 text-xs font-bold text-b-on-charge tabular-nums">
              {activeCount}
            </span>
          )}
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => { clearFilters(); changed(); }}
            className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[15px] font-semibold text-[#8C1D18] hover:underline dark:text-[#f2645a]"
            data-testid="button-clear-filters"
          >
            <X className="size-4" aria-hidden />
            {d(`${prefix}.clear`)}
          </button>
        )}
        {status && (
          <p role="status" className="ml-auto text-[15px] text-muted-foreground max-sm:w-full">
            {status}
          </p>
        )}
      </div>

      {/* Active filters as removable chips */}
      {activeCount > 0 && (
        <ul className="flex flex-wrap gap-2 pt-4">
          {active.map((a) => (
            <li key={a.label}>
              <button
                type="button"
                onClick={() => { a.reset(); changed(); }}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-b-charge bg-b-charge/10 pr-2 pl-3 text-sm text-foreground hover:bg-b-charge/15"
                aria-label={`${a.label} ${a.value} — ${d(`${prefix}.clear`)}`}
              >
                <span className="text-muted-foreground">{a.label}</span>
                <span className="font-semibold">{a.value}</span>
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Desktop: inline panel */}
      {showFilters && <div className="hidden pt-5 md:block">{panel}</div>}

      {/* Mobile: bottom sheet */}
      {showFilters && (
        <div className="md:hidden">
          <div aria-hidden onClick={() => setShowFilters(false)} className="fixed inset-0 z-50 bg-[rgba(7,35,26,.4)]" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={sheetTitle}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-xl bg-b-paper"
          >
            <div className="flex h-15 shrink-0 items-center justify-between border-b px-5">
              <span className="text-lg font-semibold">{sheetTitle}</span>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                aria-label={d(`${prefix}.hide`)}
                className="inline-flex size-11 items-center justify-center rounded-md hover:bg-b-inset"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{panel}</div>
            <div className="shrink-0 border-t px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="flex h-13 w-full items-center justify-center rounded-md bg-b-forest text-base font-semibold text-b-on-forest"
              >
                {applyLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function FilterCard({
  icon: Icon,
  label,
  valueLabel,
  active,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  valueLabel: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`space-y-3 rounded-lg border p-4 transition-colors ${
        active ? "border-b-charge bg-b-charge/10" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 shrink-0 text-b-link" />
          <span className="truncate">{label}</span>
        </div>
        <span className={`whitespace-nowrap text-sm tabular-nums ${active ? "font-semibold text-[#0B5C2E] dark:text-b-signal" : "font-medium text-muted-foreground"}`}>
          {valueLabel}
        </span>
      </div>
      {children}
    </div>
  );
}

function FilterBoundsLabel({ min, max }: { min: string; max: string }) {
  return (
    <div className="flex justify-between pt-1 text-[13px] text-muted-foreground">
      <span>{min}</span>
      <span>{max}</span>
    </div>
  );
}
