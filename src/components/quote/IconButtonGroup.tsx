"use client";

import type { LucideIcon } from "lucide-react";

export interface IconButtonOption {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface IconButtonGroupProps {
  options: IconButtonOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function IconButtonGroup({ options, value, onChange, className = "" }: IconButtonGroupProps) {
  return (
    <div
      className={`grid gap-3 ${className}`}
      style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, 1fr)` }}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            className={`flex flex-col items-center justify-center gap-2 h-16 rounded-lg border transition-all ${
              isSelected
                ? "border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30"
                : "border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 text-foreground"
            }`}
            onClick={() => onChange(option.value)}
          >
            <Icon className="h-5 w-5 text-primary" />
            <span className="font-medium text-sm text-center leading-tight">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
