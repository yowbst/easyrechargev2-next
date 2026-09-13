"use client";

import { X } from "lucide-react";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import {
  usePartnerFilter,
  type FacetGroup,
  type Facets,
} from "./PartnerFilterContext";

/**
 * The facets currently narrowing the board, as removable chips.
 *
 * The Filtres popover tells you how many facets are on; it does not tell you
 * *which*, and a partner who left "Locataire" ticked last week reads an empty
 * column as "no leads this month". Surfacing each selection on the page — and
 * making it removable in one click — is the fix.
 *
 * Every label here is an existing dictionary key (the same ones the popover
 * uses), so this adds no new Directus strings to translate.
 */
const GROUPS: { group: FacetGroup; titleKey: string; labelNs: string }[] = [
  { group: "score", titleKey: "facets.score", labelNs: "score.band" },
  { group: "housing", titleKey: "facets.housing", labelNs: "card.housing" },
  { group: "deadline", titleKey: "facets.deadline", labelNs: "card.deadline" },
  { group: "approval", titleKey: "facets.approval", labelNs: "card.approval" },
];

// Score bands read as stars everywhere else in the partner space (lead card,
// cascade breakdown) — keep the chip consistent with the badge.
const BAND_GLYPH: Record<string, string> = {
  hot: "★★★",
  warm: "★★",
  cold: "★",
};

const BAND_TONE: Record<string, string> = {
  hot: "text-partner-hot",
  warm: "text-partner-warm",
  cold: "text-partner-cold",
};

export function ActiveFilterChips({
  options,
  dictionary,
}: {
  options: Facets;
  dictionary: PartnerDict;
}) {
  const t = makePartnerT(dictionary);
  const { facets, toggleFacet, clearFacets, facetCount } = usePartnerFilter();

  if (facetCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("facets.label")} :</span>
      {GROUPS.flatMap(({ group, titleKey, labelNs }) =>
        // Order by the option list, not by click order, so the chips don't
        // shuffle as the partner toggles things on and off.
        options[group]
          .filter((value) => facets[group].includes(value))
          .map((value) => {
            const label =
              group === "score"
                ? (BAND_GLYPH[value] ?? t(`${labelNs}.${value}`))
                : t(`${labelNs}.${value}`);
            return (
              <span
                key={`${group}:${value}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted pl-2.5 pr-1 font-medium"
              >
                <span className="text-muted-foreground">{t(titleKey)}</span>
                <span aria-hidden>·</span>
                <span
                  className={
                    group === "score" ? (BAND_TONE[value] ?? "") : undefined
                  }
                >
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() => toggleFacet(group, value)}
                  aria-label={`${t(titleKey)} · ${label} — ${t("facets.clear")}`}
                  className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            );
          }),
      )}
      <button
        type="button"
        onClick={clearFacets}
        className="font-semibold text-primary underline-offset-2 hover:underline"
      >
        {t("facets.clear")}
      </button>
    </div>
  );
}
