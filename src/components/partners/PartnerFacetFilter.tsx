"use client";

import { SlidersHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import {
  usePartnerFilter,
  type Facets,
  type FacetGroup,
} from "./PartnerFilterContext";

// Which dictionary namespace holds the value labels for each facet group.
const GROUPS: { group: FacetGroup; titleKey: string; labelNs: string }[] = [
  { group: "housing", titleKey: "facets.housing", labelNs: "card.housing" },
  { group: "deadline", titleKey: "facets.deadline", labelNs: "card.deadline" },
  { group: "approval", titleKey: "facets.approval", labelNs: "card.approval" },
];

export function PartnerFacetFilter({
  options,
  dictionary,
}: {
  options: Facets;
  dictionary: PartnerDict;
}) {
  const t = makePartnerT(dictionary);
  const { facets, toggleFacet, clearFacets, facetCount } = usePartnerFilter();

  const visibleGroups = GROUPS.filter((g) => options[g.group].length > 0);
  if (visibleGroups.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("facets.label")}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted ${
              facetCount > 0 ? "border-primary text-primary" : "text-muted-foreground"
            }`}
          />
        }
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">{t("facets.label")}</span>
        {facetCount > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
            {facetCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {visibleGroups.map(({ group, titleKey, labelNs }) => (
            <div key={group} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {t(titleKey)}
              </p>
              {options[group].map((value) => {
                const checked = facets[group].includes(value);
                return (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFacet(group, value)}
                      className="shrink-0"
                    />
                    <span className="capitalize">{t(`${labelNs}.${value}`)}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        {facetCount > 0 && (
          <button
            type="button"
            onClick={clearFacets}
            className="mt-1 w-full rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            {t("facets.clear")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
