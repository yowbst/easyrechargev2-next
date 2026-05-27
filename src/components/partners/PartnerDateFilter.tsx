"use client";

import { CalendarRange, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import {
  usePartnerFilter,
  type DatePreset,
} from "./PartnerFilterContext";

const PRESETS: { key: DatePreset; labelKey: string }[] = [
  { key: "all", labelKey: "filter.all" },
  { key: "7d", labelKey: "filter.7d" },
  { key: "30d", labelKey: "filter.30d" },
  { key: "90d", labelKey: "filter.90d" },
];

export function PartnerDateFilter({ dictionary }: { dictionary: PartnerDict }) {
  const t = makePartnerT(dictionary);
  const { filter, setFilter, active } = usePartnerFilter();

  const triggerLabel =
    filter.preset === "all"
      ? t("filter.label")
      : filter.preset === "custom"
        ? t("filter.custom")
        : t(`filter.${filter.preset}`);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("filter.label")}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted ${
              active ? "border-primary text-primary" : "text-muted-foreground"
            }`}
          />
        }
      >
        <CalendarRange className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">{triggerLabel}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-3">
        <div className="flex flex-col gap-1">
          {PRESETS.map(({ key, labelKey }) => {
            const selected = filter.preset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setFilter({ preset: key, from: null, to: null })
                }
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

        <div className="border-t pt-2.5">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t("filter.custom")}
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{t("filter.from")}</span>
              <input
                type="date"
                value={filter.preset === "custom" ? (filter.from ?? "") : ""}
                max={filter.to ?? undefined}
                onChange={(e) =>
                  setFilter({
                    preset: "custom",
                    from: e.target.value || null,
                    to: filter.preset === "custom" ? filter.to : null,
                  })
                }
                className="rounded border bg-background px-2 py-1"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{t("filter.to")}</span>
              <input
                type="date"
                value={filter.preset === "custom" ? (filter.to ?? "") : ""}
                min={filter.from ?? undefined}
                onChange={(e) =>
                  setFilter({
                    preset: "custom",
                    from: filter.preset === "custom" ? filter.from : null,
                    to: e.target.value || null,
                  })
                }
                className="rounded border bg-background px-2 py-1"
              />
            </label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
