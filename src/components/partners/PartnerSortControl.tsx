"use client";

import { ArrowDownUp, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import { usePartnerFilter, type SortKey } from "./PartnerFilterContext";

const OPTIONS: { key: SortKey; labelKey: string }[] = [
  { key: "score", labelKey: "sort.score" },
  { key: "recent", labelKey: "sort.recent" },
  { key: "oldest", labelKey: "sort.oldest" },
  { key: "name", labelKey: "sort.name" },
  { key: "stage_age", labelKey: "sort.stage_age" },
];

export function PartnerSortControl({ dictionary }: { dictionary: PartnerDict }) {
  const t = makePartnerT(dictionary);
  const { sort, setSort } = usePartnerFilter();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("sort.label")}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted ${
              sort !== "recent"
                ? "border-primary text-primary"
                : "text-muted-foreground"
            }`}
          />
        }
      >
        <ArrowDownUp className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">{t(`sort.${sort}`)}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <div className="flex flex-col gap-1">
          {OPTIONS.map(({ key, labelKey }) => {
            const selected = sort === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                className={`flex items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                  selected ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                <span>{t(labelKey)}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
