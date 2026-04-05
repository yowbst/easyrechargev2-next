"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Building2, Key, MapPin } from "lucide-react";

const HOUSING_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Building2, Key,
};
import { Button } from "@/components/ui/button";
import { LocalityAutocomplete } from "@/components/LocalityAutocomplete";
import { t } from "@/lib/i18n/dictionaries";
import type { LocalityResponse } from "@/lib/localities";
import type { PageRegistryEntry } from "@/lib/directus-queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface MiniQuoteFormProps {
  miniQuoteContent?: AnyRecord;
  className?: string;
  pageId?: string;
  dictionary: Record<string, string>;
  pageRegistry: PageRegistryEntry[];
  lang: string;
  tOptions?: Record<string, string | number>;
}

export function MiniQuoteForm({
  miniQuoteContent,
  className = "",
  pageId,
  dictionary,
  pageRegistry,
  lang,
  tOptions,
}: MiniQuoteFormProps) {
  const pathname = usePathname();
  const router = useRouter();

  const bp = `pages.${pageId || "default"}.blocks.mini-quote`;

  // Config from CMS
  const miniQuoteConfig = miniQuoteContent?.config || {};
  const housingStatusField = miniQuoteConfig.form?.fields?.find?.(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (f: any) => f.key === "housingStatus",
  );

  const housingStatusValues = housingStatusField?.apiValues ||
    miniQuoteConfig.housingStatus?.values ||
    miniQuoteConfig.housingStatusValues || {
      owner: "owner",
      coOwner: "co-owner",
      tenant: "tenant",
    };

  const getHousingStatusValue = (key: string): string =>
    housingStatusValues[key as keyof typeof housingStatusValues] || key;

  const getHousingStatusIcon = (key: string): React.ReactNode => {
    const iconName = housingStatusField?.icons?.[key];
    const IconComponent = (iconName ? HOUSING_ICONS[iconName] : null) || Home;
    return <IconComponent className="h-5 w-5 text-white" />;
  };

  const subtitleKey = `${bp}.subtitle`;
  const subtitleRaw = t(dictionary, subtitleKey, tOptions);
  const subtitle = (subtitleRaw && subtitleRaw !== subtitleKey && !subtitleRaw.startsWith("[")) ? subtitleRaw : "";
  const getHousingTypeLabel = (type: string) =>
    t(dictionary, `${bp}.form.fields.housingStatus.options.${type}`);
  const locationPlaceholder = t(dictionary, `${bp}.form.fields.location.placeholder`);
  const modifyLabel = t(dictionary, `${bp}.form.modify`);
  const submitButtonText = t(dictionary, `${bp}.form.submit.text`);

  // Quote page link
  const submitButtonLink = useMemo(() => {
    const quotePage = pageRegistry.find((p) => p.id === "quote");
    return quotePage ? `/${lang}/${quotePage.slugs[lang]}` : `/${lang}`;
  }, [lang, pageRegistry]);

  const [housingStatus, setHousingStatus] = useState("");
  const [isEditingHousingStatus, setIsEditingHousingStatus] = useState(false);
  const [selectedLocality, setSelectedLocality] = useState<LocalityResponse | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [isEditingLocation, setIsEditingLocation] = useState(false);

  const currentStep = !housingStatus || isEditingHousingStatus ? 1 : !selectedLocality || isEditingLocation ? 2 : 3;

  useEffect(() => {
    if (!housingStatus) {
      setSelectedLocality(null);
      setSearchValue("");
      setIsEditingLocation(false);
      setIsEditingHousingStatus(false);
    }
  }, [housingStatus]);

  const handleHousingStatusSelect = (status: string) => {
    setHousingStatus(status);
    setIsEditingHousingStatus(false);
  };

  const handleSelectLocality = (item: LocalityResponse) => {
    setSelectedLocality(item);
    setSearchValue(`${item.postalCode} ${item.locality}`);
    setIsEditingLocation(false);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const handleQuoteClick = async () => {
    if (!housingStatus || !selectedLocality || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(false);

    const params = new URLSearchParams({
      postalCode: selectedLocality.postalCode,
      locality: selectedLocality.locality,
      housingStatus: getHousingStatusValue(housingStatus),
    });

    // Submit to Directus and pass session token to quote page for linking
    try {
      const res = await fetch("/api/mini-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          housingStatus: getHousingStatusValue(housingStatus),
          postalCode: selectedLocality.postalCode,
          locality: selectedLocality.locality,
          canton: selectedLocality.canton,
          formType: "mini-quote-form",
          pageId: pageId ?? null,
          locale: lang,
        }),
      });
      if (!res.ok) {
        console.error("[MiniQuoteForm] API error:", res.status, await res.text().catch(() => ""));
        setSubmitError(true);
        setIsSubmitting(false);
        return;
      }
      const data = await res.json();
      if (data.sessionToken) params.set("sessionToken", data.sessionToken);
    } catch (err) {
      console.error("[MiniQuoteForm] Submission failed:", err);
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    router.push(`${submitButtonLink}?${params.toString()}`);
  };

  return (
    <div
      className={`bg-white/10 backdrop-blur-md border border-white/25 rounded-2xl p-6 flex flex-col space-y-4 shadow-lg ${className}`}
      data-testid="mini-quote-form"
    >
      {subtitle && (
        <p className="text-sm text-white/80 leading-snug">{subtitle}</p>
      )}

      {/* Step progress */}
      <div className="flex items-center gap-1.5">
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              step <= currentStep ? "bg-white" : "bg-white/25"
            }`}
          />
        ))}
      </div>

      {/* Housing Status Selection */}
      <div className="space-y-3">
        {housingStatus && !isEditingHousingStatus ? (
          <div
            className="flex items-center justify-between gap-3 h-20 px-4 rounded-lg border border-white bg-white/20 backdrop-blur"
            data-testid="card-selected-status"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-white/20">
                {getHousingStatusIcon(housingStatus)}
              </div>
              <span className="font-medium text-sm text-white">
                {getHousingTypeLabel(housingStatus)}
              </span>
            </div>
            <button
              onClick={() => setIsEditingHousingStatus(true)}
              data-testid="button-change-status"
              className="text-white text-sm font-medium hover:underline transition-all"
              type="button"
            >
              {modifyLabel}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {["owner", "coOwner", "tenant"].map((status) => (
              <button
                key={status}
                type="button"
                className="flex flex-col items-center justify-center gap-2 h-20 rounded-lg border border-white/30 bg-white/10 hover:bg-white/20 hover:border-white/50 transition-all"
                onClick={() => handleHousingStatusSelect(status)}
                data-testid={`card-${status}`}
              >
                {getHousingStatusIcon(status)}
                <span className="font-medium text-sm text-white">
                  {getHousingTypeLabel(status)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Locality Field */}
      {housingStatus && !isEditingHousingStatus && (
        <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
          {selectedLocality && !isEditingLocation ? (
            <div
              className="flex items-center justify-between gap-3 h-20 px-4 rounded-lg border border-white bg-white/20 backdrop-blur"
              data-testid="card-selected-location"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/20">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <span className="font-medium text-sm text-white">
                  {selectedLocality.postalCode} {selectedLocality.locality}
                </span>
              </div>
              <button
                onClick={() => {
                  setIsEditingLocation(true);
                  setSearchValue(`${selectedLocality.postalCode} ${selectedLocality.locality}`);
                  setSelectedLocality(null);
                }}
                data-testid="button-change-location"
                className="text-white text-sm font-medium hover:underline transition-all"
                type="button"
              >
                {modifyLabel}
              </button>
            </div>
          ) : (
            <LocalityAutocomplete
              value={searchValue}
              onValueChange={(v) => {
                setSearchValue(v);
                setSelectedLocality(null);
              }}
              onSelect={handleSelectLocality}
              placeholder={locationPlaceholder.startsWith("[") ? "NPA ou localité" : locationPlaceholder}
              limit={8}
              locale={lang === "de" ? "de-DE" : "fr-FR"}
              dataTestId="input-postal-code"
              iconClassName="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/70 z-10 pointer-events-none"
              inputClassName="h-12 pl-12 text-base rounded-md bg-white/10 border-white/30 focus:border-white hover:border-white/50 text-white placeholder:text-white/60"
              dropdownClassName="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-[200px] overflow-auto"
            />
          )}
        </div>
      )}

      {/* Submit */}
      <div className="pt-2 space-y-2">
        {submitError && (
          <p className="text-sm text-red-300 text-center">
            {lang === "de" ? "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut." : "Une erreur est survenue. Veuillez réessayer."}
          </p>
        )}
        <Button
          className="w-full h-12 font-semibold rounded-lg text-[14px]"
          disabled={!housingStatus || !selectedLocality || isSubmitting}
          data-testid="button-mini-quote"
          onClick={handleQuoteClick}
        >
          {submitButtonText.startsWith("[") ? "Obtenir un devis" : submitButtonText}
        </Button>
      </div>
    </div>
  );
}
