"use client";

import type { LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";

/** The uppercase question label of the quote funnels, with optional tooltip. */
export function FieldLabel({ icon: Icon, label, tooltip, image, htmlFor }: {
  icon: LucideIcon;
  label: string;
  tooltip?: string;
  image?: string;
  htmlFor?: string;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 block">
      <InfoTooltip className="flex items-center gap-1.5" content={tooltip} image={image}>
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </InfoTooltip>
    </Label>
  );
}
