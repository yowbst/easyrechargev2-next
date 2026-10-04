"use client";

import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";

/**
 * Question label of the quote funnels (design 15 v2): the question in
 * 15 px semibold, then — on the same line when it fits — why we ask it.
 */
export function FieldLabel({ label, help, tooltip, image, htmlFor }: {
  label: string;
  /** Short reason for asking (`steps.<step>.fields.<field>.why`). */
  help?: string;
  tooltip?: string;
  image?: string;
  htmlFor?: string;
}) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <Label htmlFor={htmlFor} className="text-[15px] font-semibold leading-snug text-foreground">
        <InfoTooltip className="flex items-center gap-1.5" content={tooltip} image={image}>
          {label}
        </InfoTooltip>
      </Label>
      {help && <span className="text-[13px] text-muted-foreground">{help}</span>}
    </div>
  );
}
