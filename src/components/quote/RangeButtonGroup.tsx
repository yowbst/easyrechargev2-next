"use client";

import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { BucketOption } from "@/lib/quoteBuckets";

interface RangeButtonGroupProps {
  value: number | "na" | null;
  onChange: (value: number | "na") => void;
  options: BucketOption[];
  label: string;
  naLabel?: string;
  icon?: LucideIcon;
  tooltip?: ReactNode;
  tooltipImage?: string;
  className?: string;
  testId?: string;
}

/** Tap-button bucket picker that replaced SliderWithCheckbox: one tap =
 * answered, and the unanswered state is visually obvious (nothing
 * selected), unlike a slider thumb parked at min. */
export function RangeButtonGroup({
  value,
  onChange,
  options,
  label,
  naLabel = "Je ne sais pas",
  icon: Icon,
  tooltip,
  tooltipImage,
  className = "",
  testId,
}: RangeButtonGroupProps) {
  const isNA = value === "na";
  const cols = options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4";

  return (
    <div className={className}>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 block">
        <InfoTooltip className="flex items-center gap-1.5" content={tooltip} image={tooltipImage}>
          {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
          {label}
        </InfoTooltip>
      </Label>

      <div className={`grid grid-cols-2 ${cols} gap-2`}>
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              className={`py-3 px-2 rounded-lg border text-sm font-medium transition-all ${
                isSelected
                  ? "border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30"
                  : "border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 text-foreground"
              }`}
              onClick={() => onChange(option.value)}
              data-testid={testId ? `bucket-${testId}-${option.value}` : undefined}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-pressed={isNA}
        className={`w-full mt-2 py-2 px-3 rounded-lg border text-sm text-left transition-all ${
          isNA
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border/60 bg-muted/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => onChange("na")}
        data-testid={testId ? `bucket-${testId}-na` : undefined}
      >
        {naLabel}
      </button>
    </div>
  );
}
