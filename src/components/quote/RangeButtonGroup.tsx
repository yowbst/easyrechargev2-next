"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { FieldLabel } from "@/components/quote-shell/FieldLabel";
import type { BucketOption } from "@/lib/quoteBuckets";

interface RangeButtonGroupProps {
  value: number | "na" | null;
  onChange: (value: number | "na") => void;
  options: BucketOption[];
  label: string;
  /** Why we ask (`…fields.<field>.why`). */
  help?: string;
  naLabel?: string;
  /** Kept for call-site compatibility; the v2 labels carry no icon. */
  icon?: LucideIcon;
  tooltip?: ReactNode;
  tooltipImage?: string;
  className?: string;
  testId?: string;
  /** Show the "don't know" button. Off for questions everyone can answer. */
  allowNa?: boolean;
}

/**
 * Bucket picker (design 06 / 15 v2): 48 px pills on one row from `sm` up;
 * "don't know" sits last, dashed, in a wider column so it never reads as one
 * more value. One tap = answered, and the unanswered state is obvious.
 */
export function RangeButtonGroup({
  value,
  onChange,
  options,
  label,
  help,
  naLabel = "Je ne sais pas",
  tooltip,
  tooltipImage,
  className = "",
  testId,
  allowNa = true,
}: RangeButtonGroupProps) {
  const isNA = value === "na";
  const columns = allowNa
    ? `repeat(${options.length}, minmax(0,1fr)) minmax(150px,1.3fr)`
    : `repeat(${options.length}, minmax(0,1fr))`;
  const pill = (selected: boolean) =>
    `inline-flex min-h-12 min-w-0 items-center justify-center rounded-lg px-3 text-sm transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${
      selected
        ? "border-2 border-b-charge bg-b-charge/10 font-semibold text-foreground"
        : "border border-border bg-card font-medium text-foreground hover:bg-b-inset"
    }`;

  return (
    <div className={className}>
      <FieldLabel label={label} help={help} tooltip={typeof tooltip === "string" ? tooltip : undefined} image={tooltipImage} />
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2.5 sm:grid-cols-(--cols)" style={{ "--cols": columns } as React.CSSProperties}>
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={pill(isSelected)}
              onClick={() => onChange(option.value)}
              data-testid={testId ? `bucket-${testId}-${option.value}` : undefined}
            >
              {option.label}
            </button>
          );
        })}
        {allowNa && (
          <button
            type="button"
            role="radio"
            aria-checked={isNA}
            className={`${pill(isNA)} col-span-2 sm:col-span-1 ${isNA ? "" : "border-dashed bg-transparent text-muted-foreground"}`}
            onClick={() => onChange("na")}
            data-testid={testId ? `bucket-${testId}-na` : undefined}
          >
            {naLabel}
          </button>
        )}
      </div>
    </div>
  );
}
