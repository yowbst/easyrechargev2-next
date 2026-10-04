"use client";

import { useRef } from "react";
import { CheckCircle2, type LucideIcon } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";

export interface IconButtonOption {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** Explanation of this option (Directus `optionTooltips.<value>`), opened from an info button. */
  tooltip?: string;
  image?: string;
}

interface IconButtonGroupProps {
  options: IconButtonOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabledValues?: string[];
  /** Accessible name of the group (the question). */
  label?: string;
  /** Columns from `sm` up; one column below. Defaults to min(options, 3). */
  cols?: number;
}

const COLS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

/**
 * Single-choice tiles of the quote funnels (design 06 / 15 v2, one size
 * down on request): at least 56 px high, icon and label left-aligned; the chosen tile gets a Charge
 * border, a 10 % Charge ground and a check. A radiogroup for assistive tech,
 * with arrow-key navigation between options.
 */
export function IconButtonGroup({ options, value, onChange, className = "", disabledValues = [], label, cols }: IconButtonGroupProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o) => !disabledValues.includes(o.value));
  const selectedIndex = options.findIndex((o) => o.value === value);
  // Roving tab stop: the chosen option, else the first enabled one.
  const tabStop = selectedIndex >= 0 ? selectedIndex : enabled.indexOf(true);

  const move = (from: number, step: number) => {
    for (let i = 1; i <= options.length; i++) {
      const next = (from + step * i + options.length) % options.length;
      if (enabled[next]) {
        refs.current[next]?.focus();
        onChange(options[next].value);
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid grid-cols-1 gap-2.5 ${COLS[cols ?? Math.min(options.length, 3)] ?? COLS[3]} ${className}`}
    >
      {options.map((option, i) => {
        const isSelected = value === option.value;
        const isDisabled = !enabled[i];
        const Icon = isSelected ? CheckCircle2 : option.icon;
        return (
          <div key={option.value} className="relative min-w-0">
          <button
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-disabled={isDisabled || undefined}
            tabIndex={i === tabStop ? 0 : -1}
            className={`flex h-full min-h-14 w-full min-w-0 items-center gap-3 rounded-lg px-4 py-2.5 text-left text-[15px] leading-tight transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              isSelected
                ? "border-2 border-b-charge bg-b-charge/10 font-semibold text-foreground"
                : "border border-border bg-card font-medium text-foreground hover:bg-b-inset"
            } ${isDisabled ? "cursor-not-allowed opacity-45 hover:bg-card" : "cursor-pointer"} ${option.tooltip || option.image ? "pr-11" : ""}`}
            onClick={() => !isDisabled && onChange(option.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); move(i, 1); }
              if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); move(i, -1); }
            }}
            data-testid={`icon-button-${option.value}`}
          >
            {Icon && <Icon className={`size-4.5 shrink-0 ${isSelected ? "text-b-link" : "text-muted-foreground"}`} aria-hidden />}
            <span className="min-w-0 hyphens-auto wrap-anywhere">{option.label}</span>
          </button>
          {/* A sibling, not a child: a button cannot hold another button. */}
          {(option.tooltip || option.image) && (
            <InfoTooltip content={option.tooltip} image={option.image} title={option.label}
              className="absolute top-1/2 right-2 -translate-y-1/2 [&>button]:inline-flex [&>button]:size-8 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-md [&>button]:text-muted-foreground [&>button:hover]:bg-b-inset [&_svg]:size-4">
              {null}
            </InfoTooltip>
          )}
          </div>
        );
      })}
    </div>
  );
}
