"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ChevronDown } from "lucide-react";

export function Field({
  label,
  value,
  tooltip,
  tooltipImage,
  multiline,
}: {
  label: string;
  value: React.ReactNode;
  tooltip?: string;
  tooltipImage?: string;
  multiline?: boolean;
}) {
  const display =
    value === null || value === undefined || value === ""
      ? "\u2014"
      : value;
  return (
    <div className="flex flex-col sm:flex-row sm:gap-2 gap-0.5 py-2 sm:py-1.5 print:py-0.5 border-b border-border/40 last:border-0 text-sm print:text-[8pt] print:leading-tight">
      <span className="text-muted-foreground sm:w-56 print:w-40 sm:shrink-0">
        {tooltip || tooltipImage ? (
          <InfoTooltip content={tooltip} image={tooltipImage}>
            {label}
          </InfoTooltip>
        ) : (
          label
        )}
      </span>
      <span
        className={`font-medium ${multiline ? "whitespace-pre-wrap" : "break-words"}`}
      >
        {display}
      </span>
    </div>
  );
}

export function Section({
  title,
  defaultOpen = true,
  printVisible = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  printVisible?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={!printVisible ? "print-exclude-section" : ""}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card className="print:shadow-none print:border-0 print:rounded-none">
          <CardHeader className="pb-2 print:p-0 print:pb-0">
            <CollapsibleTrigger className="w-full cursor-pointer select-none hover:bg-muted/50 transition-colors print:cursor-default text-left">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base print:text-[9pt] print:font-bold print:uppercase print:tracking-wide print:text-gray-500 print:pb-0.5 print:w-full print:border-b print:border-gray-300">
                  {title}
                </CardTitle>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 print:hidden ${open ? "rotate-180" : ""}`}
                />
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent className="print-section-content">
            <CardContent className="space-y-0 print:p-0">
              {children}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
