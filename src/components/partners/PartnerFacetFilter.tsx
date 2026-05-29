"use client";

import {
  SlidersHorizontal,
  Home,
  Building2,
  Key,
  CalendarClock,
  CircleCheck,
  CircleDashed,
  CircleX,
  Star,
  type LucideIcon,
} from "lucide-react";
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
  { group: "score", titleKey: "facets.score", labelNs: "score.band" },
  { group: "housing", titleKey: "facets.housing", labelNs: "card.housing" },
  { group: "deadline", titleKey: "facets.deadline", labelNs: "card.deadline" },
  { group: "approval", titleKey: "facets.approval", labelNs: "card.approval" },
];

const MUTED = "text-muted-foreground";
const EMERALD = "text-emerald-600 dark:text-emerald-400";
const AMBER = "text-amber-600 dark:text-amber-400";
const BLUE = "text-blue-600 dark:text-blue-400";

const HOUSING_ICONS: Record<string, LucideIcon> = {
  owner: Home,
  "co-owner": Building2,
  tenant: Key,
};
const APPROVAL_ICONS: Record<string, LucideIcon> = {
  yes: CircleCheck,
  "in-progress": CircleDashed,
  no: CircleX,
};

const SCORE_ICONS: Record<string, { Icon: LucideIcon; tone: string }> = {
  hot: { Icon: Star, tone: EMERALD },
  warm: { Icon: Star, tone: AMBER },
  cold: { Icon: Star, tone: BLUE },
};

// Icons mirror the lead card; only the score band carries a colour now —
// other attributes (ownership, deadline, authorization) stay neutral so the
// score is the single visual signal of lead quality.
function iconFor(
  group: FacetGroup,
  value: string,
): { Icon: LucideIcon; tone: string } | null {
  if (group === "housing") {
    if (!(value in HOUSING_ICONS)) return null;
    return { Icon: HOUSING_ICONS[value], tone: MUTED };
  }
  if (group === "deadline") {
    return { Icon: CalendarClock, tone: MUTED };
  }
  if (group === "score") {
    return value in SCORE_ICONS ? SCORE_ICONS[value] : null;
  }
  if (value in APPROVAL_ICONS) {
    return { Icon: APPROVAL_ICONS[value], tone: MUTED };
  }
  return null;
}

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
                const meta = iconFor(group, value);
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
                    {meta && (
                      <meta.Icon
                        className={`h-3.5 w-3.5 shrink-0 ${meta.tone}`}
                        fill={group === "score" ? "currentColor" : "none"}
                        aria-hidden
                      />
                    )}
                    <span className={meta && meta.tone !== MUTED ? meta.tone : ""}>
                      {t(`${labelNs}.${value}`)}
                    </span>
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
