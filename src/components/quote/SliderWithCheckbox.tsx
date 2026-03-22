"use client";

import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface SliderWithCheckboxProps {
  value: number | "na" | null;
  onChange: (value: number | "na") => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  unit?: string;
  checkboxLabel?: string;
  className?: string;
  icon?: LucideIcon;
  showEdgeLabels?: boolean;
  tickInterval?: number;
  tooltip?: ReactNode;
  tooltipImage?: string;
}

export function SliderWithCheckbox({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  unit = "",
  checkboxLabel = "Je ne sais pas",
  className = "",
  icon: Icon,
  showEdgeLabels = false,
  tickInterval,
  tooltip,
  tooltipImage,
}: SliderWithCheckboxProps) {
  // Remember the last numeric value before switching to 'na'
  const lastNumericValueRef = useRef<number>(min);

  // Update the remembered value whenever a numeric value is set
  useEffect(() => {
    if (typeof value === "number") {
      lastNumericValueRef.current = value;
    }
  }, [value]);

  const isNA = value === "na";
  const isUnset = value === null;
  const numericValue = typeof value === "number" ? value : lastNumericValueRef.current;

  const handleCheckboxChange = (checked: boolean | "indeterminate") => {
    // Treat indeterminate as checked for safety
    if (checked === true || checked === "indeterminate") {
      // Switching to "Je ne sais pas"
      onChange("na");
    } else {
      // Restoring previous numeric value
      onChange(lastNumericValueRef.current);
    }
  };

  // Generate tick marks based on min, max, and tickInterval (or step if no tickInterval)
  const ticks = [];
  if (tickInterval) {
    // Custom tick interval: show min, then multiples of tickInterval up to max
    ticks.push(min);
    for (let i = Math.ceil(min / tickInterval) * tickInterval; i <= max; i += tickInterval) {
      if (i > min) {
        ticks.push(i);
      }
    }
  } else {
    // Default: show all steps
    for (let i = min; i <= max; i += step) {
      ticks.push(i);
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">
          <InfoTooltip className="flex items-center gap-1.5" content={tooltip} image={tooltipImage}>
            {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
            {label}
          </InfoTooltip>
        </Label>
        <div className={`text-sm font-semibold text-primary tabular-nums ${isNA || isUnset ? "invisible" : ""}`}>
          {numericValue}{unit}
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/40 overflow-hidden">
        {/* Slider area */}
        <div className={`px-4 pt-4 pb-8 relative ${isNA ? "opacity-40 pointer-events-none" : ""}`}>
          <Slider
            value={[numericValue]}
            onValueChange={(val) => {
              if (isNA) return;
              const v = Array.isArray(val) ? val[0] : val;
              onChange(v);
            }}
            min={min}
            max={max}
            step={step}
            disabled={isNA}
            className="w-full"
            data-testid={`slider-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
          <div className="absolute left-4 right-4 top-[30px] flex justify-between">
            {ticks.map((tick) => (
              <div key={tick} className="flex flex-col items-center" style={{ width: "1px" }}>
                <div className="w-px h-1.5 bg-border" />
                <span className="text-[10px] text-muted-foreground mt-1">{tick}</span>
              </div>
            ))}
          </div>
        </div>

        {/* "I don't know" — separator + toggle row */}
        <label
          htmlFor={`checkbox-${label}`}
          className={`flex items-center gap-3 px-4 py-2.5 border-t cursor-pointer transition-all ${
            isNA
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/60 bg-background/60 hover:bg-primary/5 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Checkbox
            id={`checkbox-${label}`}
            checked={isNA}
            onCheckedChange={handleCheckboxChange}
            data-testid={`checkbox-na-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
          <span className="text-sm flex-1">{checkboxLabel}</span>
        </label>
      </div>
    </div>
  );
}
