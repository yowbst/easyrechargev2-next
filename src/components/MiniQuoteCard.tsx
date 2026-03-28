"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Home, Building2, Key, MapPin, ChevronRight } from "lucide-react";
import { t } from "@/lib/i18n/dictionaries";
import { LocalityAutocomplete } from "@/components/LocalityAutocomplete";
import { useFormTelemetry } from "@/hooks/use-form-telemetry";
import { usePostHog } from "posthog-js/react";
import type { LocalityResponse } from "@/lib/localities";
import type { PageRegistryEntry } from "@/lib/directus-queries";

interface MiniQuoteCardProps {
  className?: string;
  pageId?: string;
  dictionary: Record<string, string>;
  pageRegistry: PageRegistryEntry[];
  lang: string;
  interpolationValues?: Record<string, string>;
}

export function MiniQuoteCard({
  className = "",
  pageId,
  dictionary,
  pageRegistry,
  lang,
  interpolationValues = {},
}: MiniQuoteCardProps) {
  const router = useRouter();
  const ph = usePostHog();
  const telemetry = useFormTelemetry({ formType: "mini-quote-card", locale: lang });

  const mqp = `pages.${pageId || "default"}.blocks.mini-quote`;
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, { ...interpolationValues, ...vars });

  const containerRef = useRef<HTMLDivElement>(null);
  const hasTrackedView = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || hasTrackedView.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTrackedView.current) {
          hasTrackedView.current = true;
          ph?.capture("mini_quote_viewed", { form_type: "mini-quote-card", page_id: pageId, locale: lang });
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ph, pageId, lang]);

  const [housingStatus, setHousingStatus] = useState("");
  const [isEditingHousingStatus, setIsEditingHousingStatus] = useState(false);
  const [selectedLocality, setSelectedLocality] = useState<LocalityResponse | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [isEditingLocation, setIsEditingLocation] = useState(false);

  const getHousingTypeLabel = (type: string) => {
    const labelKey = type === "co-owner" ? "coOwner" : type;
    return d(`${mqp}.form.fields.housingStatus.options.${labelKey}`);
  };

  const quotePage = pageRegistry.find((p) => p.id === "quote");
  const submitLink = quotePage ? `/${lang}/${quotePage.slugs[lang]}` : `/${lang}`;

  const handleHousingStatusSelect = (status: string) => {
    telemetry.trackChange("housingStatus", status);
    setHousingStatus(status);
    setIsEditingHousingStatus(false);
  };

  const handleQuoteSubmit = () => {
    if (!housingStatus || !selectedLocality) return;
    telemetry.trackSubmit(true, { housingStatus, postalCode: selectedLocality.postalCode });
    ph?.capture("mini_quote_submitted", { form_type: "mini-quote-card", page_id: pageId, locale: lang, housing_status: housingStatus });

    // Submit to Directus (fire and forget — don't block navigation)
    fetch("/api/mini-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        housingStatus,
        postalCode: selectedLocality.postalCode,
        locality: selectedLocality.locality,
        canton: selectedLocality.canton,
        formType: "mini-quote-card",
        locale: lang,
        posthog: {
          phDistinctId: ph?.get_distinct_id?.() ?? null,
          phSessionId: ph?.get_session_id?.() ?? null,
        },
      }),
    }).catch(() => {});

    const params = new URLSearchParams({
      housingStatus,
      postalCode: selectedLocality.postalCode,
      locality: selectedLocality.locality,
      canton: selectedLocality.canton,
    });
    router.push(`${submitLink}?${params.toString()}`);
  };

  const currentStep = !housingStatus || isEditingHousingStatus ? 1 : !selectedLocality || isEditingLocation ? 2 : 3;

  return (
    <Card
      ref={containerRef}
      className={`group relative flex flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-md overflow-hidden transition-shadow duration-300 hover:shadow-lg ${className}`}
      data-testid="card-mini-quote"
    >
      <div className="h-1 w-full bg-gradient-to-r from-primary via-primary/70 to-primary/40" />

      <div className="p-6 pb-3 space-y-1.5">
        <h3 className="text-xl font-heading font-bold leading-tight text-foreground tracking-tight">
          {d(`${mqp}.title`)}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {d(`${mqp}.subtitle`)}
        </p>
      </div>

      <div className="px-6 pb-4">
        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                step <= currentStep ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="px-6 pb-4 flex-1 flex flex-col space-y-3 overflow-visible">
        <div className="space-y-2">
          {housingStatus && !isEditingHousingStatus ? (
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-primary/25 bg-primary/5 dark:bg-primary/10" data-testid="card-selected-status">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/15">
                  {housingStatus === "owner" && <Home className="h-4 w-4 text-primary" />}
                  {housingStatus === "co-owner" && <Building2 className="h-4 w-4 text-primary" />}
                  {housingStatus === "tenant" && <Key className="h-4 w-4 text-primary" />}
                </div>
                <span className="font-medium text-sm text-foreground">{getHousingTypeLabel(housingStatus)}</span>
              </div>
              <button onClick={() => setIsEditingHousingStatus(true)} className="text-primary text-xs font-medium hover:underline" data-testid="button-change-status">
                {d(`${mqp}.form.modify`)}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {["owner", "co-owner", "tenant"].map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`flex flex-row items-center justify-start gap-3 p-3 rounded-xl border transition-all duration-200 text-sm ${
                    housingStatus === status
                      ? "border-primary/50 bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-card hover:border-primary/30 hover:bg-accent/50 text-foreground"
                  }`}
                  onClick={() => handleHousingStatusSelect(status)}
                  data-testid={`card-${status}`}
                >
                  {status === "owner" && <Home className="h-4 w-4" />}
                  {status === "co-owner" && <Building2 className="h-4 w-4" />}
                  {status === "tenant" && <Key className="h-4 w-4" />}
                  <span className="font-medium">{getHousingTypeLabel(status)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {housingStatus && !isEditingHousingStatus && (
          <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
            {selectedLocality && !isEditingLocation ? (
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-primary/25 bg-primary/5 dark:bg-primary/10" data-testid="card-selected-location">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/15">
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-medium text-sm text-foreground">
                    {selectedLocality.postalCode} {selectedLocality.locality}
                  </span>
                </div>
                <button
                  onClick={() => { setIsEditingLocation(true); setSearchValue(`${selectedLocality.postalCode} ${selectedLocality.locality}`); setSelectedLocality(null); }}
                  className="text-primary text-xs font-medium hover:underline"
                  data-testid="button-change-location"
                >
                  {d(`${mqp}.form.modify`)}
                </button>
              </div>
            ) : (
              <LocalityAutocomplete
                value={searchValue}
                onValueChange={(v) => { setSearchValue(v); setSelectedLocality(null); }}
                onSelect={(item) => {
                  telemetry.trackChange("postalCode", item.postalCode);
                  setSelectedLocality(item);
                  setSearchValue(`${item.postalCode} ${item.locality}`);
                  setIsEditingLocation(false);
                }}
                placeholder={d(`${mqp}.form.fields.location.placeholder`)}
                limit={5}
                locale={lang === "de" ? "de-DE" : "fr-FR"}
                dataTestId="input-locality-search"
                inputClassName="h-11 pl-11 text-sm rounded-lg border-border focus:border-primary bg-background"
              />
            )}
          </div>
        )}
      </div>

      <div className="mt-auto px-6 pb-6 pt-3">
        <Button
          className="w-full h-11 font-semibold rounded-xl text-sm tracking-wide"
          disabled={!housingStatus || !selectedLocality}
          data-testid="button-submit-quote"
          onClick={handleQuoteSubmit}
        >
          {d(`${mqp}.form.submit.text`)}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </Card>
  );
}
