"use client";

import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useEffect, useRef } from "react";
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
}: SliderWithCheckboxProps) {
  const lastNumericValueRef = useRef<number>(min);

  useEffect(() => {
    if (typeof value === "number") {
      lastNumericValueRef.current = value;
    }
  }, [value]);

  const isNA = value === "na";
  const numericValue = typeof value === "number" ? value : lastNumericValueRef.current;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
          {label}
        </Label>
        <div className={`text-sm font-semibold text-primary tabular-nums ${isNA || value === null ? "invisible" : ""}`}>
          {numericValue}{unit}
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/40 overflow-hidden">
        <div className={`px-4 pt-4 pb-4 ${isNA ? "opacity-40 pointer-events-none" : ""}`}>
          <Slider
            value={[numericValue]}
            onValueChange={([newValue]) => !isNA && onChange(newValue)}
            min={min}
            max={max}
            step={step}
            disabled={isNA}
            className="w-full"
          />
        </div>

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
            onCheckedChange={(checked) => {
              if (checked) {
                onChange("na");
              } else {
                onChange(lastNumericValueRef.current);
              }
            }}
          />
          <span className="text-sm flex-1">{checkboxLabel}</span>
        </label>
      </div>
    </div>
  );
}
