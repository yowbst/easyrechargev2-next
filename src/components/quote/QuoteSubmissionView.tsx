"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Loader2,
  ChevronDown,
  CircleCheck,
  Settings2,
  Printer,
} from "lucide-react";
import { parsePhoneNumber } from "libphonenumber-js";
import type { FormSubmission, FormUser, FormSession } from "@shared/types";

// ---------- Types ----------

interface SubmissionData {
  submission: FormSubmission;
  user: FormUser | null;
  session: FormSession | null;
}

interface QuoteSubmissionViewProps {
  lang: string;
  submissionId: string;
  dictionary: Record<string, string>;
  quoteConfig: Record<string, any>;
  logoColorUrl?: string;
  logoWhiteUrl?: string;
  directusUrl: string;
}

// ---------- Helpers ----------

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "\u2014";
  try {
    const parsed = parsePhoneNumber(raw, "CH");
    if (parsed?.isValid()) return parsed.formatInternational();
  } catch {
    /* fall through */
  }
  return raw;
}

function formatDate(
  d: Date | string | null | undefined,
  locale: string,
): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleString(locale === "de" ? "de-CH" : "fr-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatUrlParams(
  params: string | Record<string, string> | null | undefined,
): React.ReactNode {
  if (!params) return "\u2014";
  const entries: [string, string][] =
    typeof params === "string"
      ? params
          .split("&")
          .filter(Boolean)
          .map((p) => {
            const [k, ...r] = p.split("=");
            return [
              decodeURIComponent(k),
              decodeURIComponent(r.join("=") || ""),
            ];
          })
      : Object.entries(params);
  if (entries.length === 0) return "\u2014";
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5">
      {entries.map(([k, v], i) => (
        <code
          key={i}
          className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded"
        >
          <span className="text-muted-foreground">{k}</span>={v}
        </code>
      ))}
    </span>
  );
}

// ---------- Sub-components ----------

function Field({
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

function Section({
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

// ---------- Main Component ----------

export function QuoteSubmissionView({
  lang,
  submissionId,
  dictionary,
  quoteConfig,
  logoColorUrl,
  logoWhiteUrl,
  directusUrl,
}: QuoteSubmissionViewProps) {
  // --- Translation helpers ---
  const tq = (key: string) => {
    const full = `pages.quote.${key}`;
    return dictionary[full] ?? "";
  };

  const tqOpt = (key: string) => {
    const v = tq(key);
    return v && !v.startsWith("[") ? v : undefined;
  };

  const tv = (key: string) => {
    const full = `pages.quote-view.${key}`;
    const v = dictionary[full] ?? "";
    return v || undefined;
  };

  const tCommon = (key: string, fallback: string) => {
    return dictionary[`common.${key}`] ?? fallback;
  };

  // --- Config helpers ---
  const getFieldConfig = (stepId: string, fieldKey: string) => {
    const steps: any[] = quoteConfig.steps || [];
    const s = steps.find((x: any) => x.id === stepId) || {};
    return (s.fields || []).find((f: any) => f.key === fieldKey) || {};
  };

  const tooltipImage = (stepId: string, field: string) => {
    const fc = getFieldConfig(stepId, field);
    const uuid =
      fc.tooltipImage ??
      (Array.isArray(fc.tooltipImages) ? fc.tooltipImages[0] : undefined);
    return uuid ? `${directusUrl}/assets/${uuid}` : undefined;
  };

  const optionTooltipImage = (
    stepId: string,
    fieldKey: string,
    optionValue: string,
  ) => {
    const images = getFieldConfig(stepId, fieldKey).tooltipImages;
    if (!images || typeof images !== "object" || Array.isArray(images))
      return undefined;
    const uuid = (images as Record<string, string>)[optionValue];
    return uuid ? `${directusUrl}/assets/${uuid}` : undefined;
  };

  const resolveOption = (fieldPath: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "\u2014";
    if (value === true) return tCommon("yes", "Oui");
    if (value === false) return tCommon("no", "Non");
    if (value === "na") {
      if (fieldPath) {
        const fieldNa = tq(`${fieldPath}.na`) || tq(`${fieldPath}.options.na`);
        if (fieldNa) return fieldNa;
      }
      return tq("common.dontKnow") || tCommon("dontKnow", "Je ne sais pas");
    }
    const translated = tq(`${fieldPath}.options.${value}`);
    return translated || String(value);
  };

  // --- State ---
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [isPrinting, setIsPrinting] = useState(false);
  useEffect(() => {
    const onBefore = () => setIsPrinting(true);
    const onAfter = () => setIsPrinting(false);
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, []);

  const sectionIds = [
    "metadata",
    "contact",
    "housing",
    "parking",
    "charger",
    "vehicle",
    "finalize",
  ] as const;
  const [printSections, setPrintSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sectionIds.map((id) => [id, true])),
  );
  const togglePrintSection = (id: string) =>
    setPrintSections((prev) => ({ ...prev, [id]: !prev[id] }));

  // --- Data fetching ---
  const [data, setData] = useState<SubmissionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    fetch(`/api/form-submissions/${submissionId}`)
      .then((r) => {
        if (!r.ok) throw new Error("not_found");
        return r.json();
      })
      .then((json) => {
        if (json.success) {
          setData(json.data);
        } else {
          setIsError(true);
        }
      })
      .catch(() => setIsError(true))
      .finally(() => setIsLoading(false));
  }, [submissionId]);

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // --- Error state ---
  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col" data-hide-layout>
        <div className="py-4 md:py-6 bg-background">
          <div className="container mx-auto px-4 flex justify-between items-center md:grid md:grid-cols-3">
            <div className="hidden md:block" />
            <div className="flex md:justify-center">
              <Link href={`/${lang}`}>
                <img
                  src={(isDark ? logoWhiteUrl : logoColorUrl) || ""}
                  alt="easyRecharge"
                  width={160}
                  height={40}
                  className="h-8 md:h-10 w-auto"
                />
              </Link>
            </div>
            <div className="flex justify-end items-center gap-2" />
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <p className="text-2xl font-semibold">
            {tv("notFound.title") || "Demande introuvable"}
          </p>
          <p className="text-muted-foreground text-sm">
            {tv("notFound.subtitle") || "Identifiant"} :{" "}
            <code className="font-mono">{submissionId}</code>
          </p>
        </div>
      </div>
    );
  }

  const { submission, user, session } = data;
  const fd = (submission.data ?? {}) as Record<string, unknown>;

  return (
    <div
      className="min-h-screen flex flex-col bg-muted/30 print:bg-white"
      data-hide-layout
    >
      {/* Focused header */}
      <div className="py-4 md:py-6 bg-background print:hidden">
        <div className="container mx-auto px-4 flex justify-between items-center md:grid md:grid-cols-3">
          <div className="hidden md:block" />
          <div className="flex md:justify-center">
            <Link href={`/${lang}`}>
              <img
                src={(isDark ? logoWhiteUrl : logoColorUrl) || ""}
                alt="easyRecharge"
                width={160}
                height={40}
                className="h-8 md:h-10 w-auto"
              />
            </Link>
          </div>
          <div className="flex justify-end items-center gap-2" />
        </div>
      </div>

      <div className="flex-1 py-4 md:py-6 print:py-0">
        <div className="max-w-4xl mx-auto px-4 space-y-4 print:max-w-none print-grid">
          {/* Top bar — hidden in print */}
          <div className="print:hidden print-span-all">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-lg font-semibold truncate">
                {tv("header.title") || "Demande de devis"}
              </h1>
              <div className="flex items-center gap-1 shrink-0">
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "rounded-r-none border-r-0 gap-1.5",
                    )}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {tv("actions.printSettings") || "Sections \u00e0 imprimer"}
                    </p>
                    <div className="space-y-2">
                      {sectionIds.map((id) => {
                        const labels: Record<string, string> = {
                          metadata:
                            tv("sections.metadata.title") || "M\u00e9tadonn\u00e9es",
                          contact:
                            tq("steps.contact.title") || "Demandeur",
                          housing:
                            tq("steps.housing.title") || "Logement",
                          parking:
                            tq("steps.parking.title") || "Parking",
                          charger:
                            tq("steps.charger.title") || "Borne",
                          vehicle:
                            tq("steps.vehicle.title") || "V\u00e9hicule",
                          finalize:
                            tq("steps.finalize.title") || "Finalisation",
                        };
                        return (
                          <label
                            key={id}
                            className="flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span className="text-sm">{labels[id]}</span>
                            <Switch
                              checked={printSections[id]}
                              onCheckedChange={() => togglePrintSection(id)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-l-none gap-1.5"
                  onClick={() => window.print()}
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {tv("actions.print") || "Imprimer / PDF"}
                  </span>
                </Button>
              </div>
            </div>
            <Badge variant="secondary" className="font-mono text-xs mt-1">
              {submission.id}
            </Badge>
          </div>

          {/* Print-only header */}
          <div className="hidden print:flex print:items-center print:justify-between print:pb-1 print:border-b print:border-gray-300 print-span-all">
            <div>
              <h1 className="text-sm font-bold">
                {tv("header.printTitle") ||
                  "Demande de devis \u2014 easyRecharge"}
              </h1>
              <p className="text-[7pt] text-gray-500">
                ID : {submission.id} &bull;{" "}
                {tv("sections.metadata.submittedAt") || "Soumis le"}{" "}
                {formatDate(submission.date_created, lang)}
                {session?.locale ? ` \u2022 ${session.locale}` : ""}
                {submission.status ? ` \u2022 ${submission.status}` : ""}
              </p>
            </div>
            <img
              src={logoColorUrl || ""}
              alt="easyRecharge"
              width={80}
              height={20}
              className="h-5"
            />
          </div>

          {/* 1. Metadata */}
          <Section
            title={tv("sections.metadata.title") || "M\u00e9tadonn\u00e9es"}
            printVisible={printSections.metadata}
          >
            <Field
              label={tv("sections.metadata.formType") || "Type de formulaire"}
              value={
                submission.form_type ? (
                  <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                    {submission.form_type}
                  </code>
                ) : (
                  "\u2014"
                )
              }
            />
            <Field
              label={tv("sections.metadata.submittedAt") || "Soumis le"}
              value={formatDate(submission.date_created, lang)}
            />
            <Field
              label={tv("sections.metadata.status") || "Statut"}
              value={
                submission.status === "success" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                    <CircleCheck className="h-3 w-3" />
                    {submission.status}
                  </span>
                ) : (
                  submission.status
                )
              }
            />
            <Field
              label={tv("sections.metadata.locale") || "Locale"}
              value={session?.locale}
            />
            <Field
              label={
                tv("sections.metadata.page") || "Page de soumission"
              }
              value={
                submission.location_path ? (
                  <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                    {submission.location_path}
                  </code>
                ) : (
                  "\u2014"
                )
              }
            />
            {submission.location_params && (
              <Field
                label={tv("sections.metadata.params") || "Param\u00e8tres"}
                value={formatUrlParams(submission.location_params)}
              />
            )}
          </Section>

          {/* 2. Requester */}
          <Section
            title={
              tq("steps.contact.title") ||
              tv("sections.requester.title") ||
              "Demandeur"
            }
            printVisible={printSections.contact}
          >
            <Field
              label={
                tq("steps.contact.fields.firstName.label") || "Pr\u00e9nom"
              }
              value={user?.first_name ?? (fd.firstName as string)}
            />
            <Field
              label={tq("steps.contact.fields.lastName.label") || "Nom"}
              value={user?.last_name ?? (fd.lastName as string)}
            />
            <Field
              label={tq("steps.contact.fields.email.label") || "Email"}
              value={user?.email ?? (fd.email as string)}
            />
            <Field
              label={
                tq("steps.contact.fields.phone.label") || "T\u00e9l\u00e9phone"
              }
              value={formatPhone(
                user?.phone ?? (fd.phone as string),
              )}
            />
            <Field
              label={
                tq("steps.contact.fields.address.subfields.streetName") ||
                "Rue"
              }
              value={fd.streetName as string}
            />
            <Field
              label={
                tq("steps.contact.fields.address.subfields.streetNb") ||
                "Num\u00e9ro"
              }
              value={fd.streetNb as string}
            />
            <Field
              label={
                tq("steps.contact.fields.address.subfields.postalCode") ||
                "Code postal"
              }
              value={fd.postalCode as string}
            />
            <Field
              label={
                tq("steps.contact.fields.address.subfields.locality") ||
                "Localit\u00e9"
              }
              value={fd.locality as string}
            />
            <Field
              label={
                tq("steps.contact.fields.address.subfields.canton") ||
                "Canton"
              }
              value={fd.canton as string}
            />
          </Section>

          {/* 3. Housing */}
          <Section
            title={tq("steps.housing.title") || "Logement"}
            printVisible={printSections.housing}
          >
            <Field
              label={
                tq("steps.housing.fields.housingStatus.label") || "Statut"
              }
              value={resolveOption(
                "steps.housing.fields.housingStatus",
                fd.housingStatus,
              )}
            />
            <Field
              label={
                tq("steps.housing.fields.housingType.label") ||
                "Type de logement"
              }
              value={resolveOption(
                "steps.housing.fields.housingType",
                fd.housingType,
              )}
            />
            <Field
              label={
                tq("steps.housing.fields.solarEquipment.label") ||
                "\u00c9quipement solaire"
              }
              value={resolveOption(
                "steps.housing.fields.solarEquipment",
                fd.solarEquipment,
              )}
              tooltip={tqOpt("steps.housing.fields.solarEquipment.tooltip")}
              tooltipImage={tooltipImage("housing", "solarEquipment")}
            />
            <Field
              label={
                tq("steps.housing.fields.homeBattery.label") ||
                "Batterie domicile"
              }
              value={resolveOption(
                "steps.housing.fields.homeBattery",
                fd.homeBattery,
              )}
              tooltip={tqOpt("steps.housing.fields.homeBattery.tooltip")}
              tooltipImage={tooltipImage("housing", "homeBattery")}
            />
            <Field
              label={
                tq("steps.housing.fields.neighborhoodEquipment.label") ||
                "\u00c9quipement copropri\u00e9t\u00e9"
              }
              value={resolveOption(
                "steps.housing.fields.neighborhoodEquipment",
                fd.neighborhoodEquipment,
              )}
              tooltip={tqOpt(
                "steps.housing.fields.neighborhoodEquipment.tooltip",
              )}
              tooltipImage={tooltipImage("housing", "neighborhoodEquipment")}
            />
            <Field
              label={
                tq("steps.housing.fields.electricalBoardType.label") ||
                "Tableau \u00e9lectrique"
              }
              value={resolveOption(
                "steps.housing.fields.electricalBoardType",
                fd.electricalBoardType,
              )}
              tooltip={tqOpt(
                "steps.housing.fields.electricalBoardType.tooltip",
              )}
              tooltipImage={tooltipImage("housing", "electricalBoardType")}
            />
          </Section>

          {/* 4. Parking */}
          <Section
            title={tq("steps.parking.title") || "Parking"}
            printVisible={printSections.parking}
          >
            <Field
              label={
                tq("steps.parking.fields.parkingSpotLocation.label") ||
                "Emplacement"
              }
              value={(() => {
                const raw = fd.parkingSpotLocation as string | undefined;
                if (!raw) return "\u2014";
                const parentMap: Record<string, string> = {
                  "exterior-adjacent": "exterior",
                  "exterior-standalone": "exterior",
                  "garage-adjacent": "garage",
                  "garage-standalone": "garage",
                  "covered-adjacent": "covered",
                  "covered-standalone": "covered",
                };
                const parent = parentMap[raw];
                if (parent) {
                  const parentLabel = tq(
                    `steps.parking.fields.parkingSpotLocation.options.${parent}`,
                  );
                  const subLabel = tq(
                    `steps.parking.fields.parkingSpotLocation.options.${raw}`,
                  );
                  return `${parentLabel || parent} \u203a ${subLabel || raw}`;
                }
                return resolveOption(
                  "steps.parking.fields.parkingSpotLocation",
                  raw,
                );
              })()}
              tooltip={tqOpt(
                `steps.parking.fields.parkingSpotLocation.optionTooltips.${fd.parkingSpotLocation}`,
              )}
              tooltipImage={optionTooltipImage(
                "parking",
                "parkingSpotLocation",
                (fd.parkingSpotLocation as string) || "",
              )}
            />
            <Field
              label={
                tq("steps.parking.fields.electricalLineDistance.label") ||
                "Distance ligne \u00e9lectrique (m)"
              }
              value={resolveOption(
                "steps.parking.fields.electricalLineDistance",
                fd.electricalLineDistance,
              )}
              tooltip={tqOpt(
                "steps.parking.fields.electricalLineDistance.tooltip",
              )}
              tooltipImage={tooltipImage("parking", "electricalLineDistance")}
            />
            <Field
              label={
                tq("steps.parking.fields.electricalLineHoleCount.label") ||
                "Nb. per\u00e7ages"
              }
              value={resolveOption(
                "steps.parking.fields.electricalLineHoleCount",
                fd.electricalLineHoleCount,
              )}
              tooltip={tqOpt(
                "steps.parking.fields.electricalLineHoleCount.tooltip",
              )}
              tooltipImage={tooltipImage("parking", "electricalLineHoleCount")}
            />
          </Section>

          {/* 5. Charger */}
          <Section
            title={tq("steps.charger.title") || "Borne de recharge"}
            printVisible={printSections.charger}
          >
            <Field
              label={
                tq("steps.charger.fields.parkingSpotCount.label") ||
                "Nb. emplacements"
              }
              value={(() => {
                const raw = fd.parkingSpotCount as string | undefined;
                if (!raw) return "\u2014";
                const optKey = raw === "3+" ? "3plus" : raw;
                const suffix = tq(
                  `steps.charger.fields.parkingSpotCount.options.${optKey}`,
                );
                return suffix ? `${raw} ${suffix}` : raw;
              })()}
            />
            <Field
              label={
                tq("steps.charger.fields.ecpStatus.label") ||
                "Statut choix borne"
              }
              value={resolveOption(
                "steps.charger.fields.ecpStatus",
                fd.ecpStatus,
              )}
              tooltip={tqOpt("steps.charger.fields.ecpStatus.tooltip")}
              tooltipImage={tooltipImage("charger", "ecpStatus")}
            />
            {!!(fd.ecpBrand || fd.ecpModel) && (
              <Field
                label={tq("steps.charger.fields.ecpStatus.label") || "Borne"}
                value={[fd.ecpBrand as string, fd.ecpModel as string]
                  .filter(Boolean)
                  .join(" \u00b7 ")}
              />
            )}
            <Field
              label={
                tq("steps.charger.fields.ecpProvided.label") || "Fournie par"
              }
              value={resolveOption(
                "steps.charger.fields.ecpProvided",
                fd.ecpProvided,
              )}
              tooltip={tqOpt("steps.charger.fields.ecpProvided.tooltip")}
              tooltipImage={tooltipImage("charger", "ecpProvided")}
            />
            <Field
              label={
                tq("steps.charger.fields.deadline.label") ||
                "D\u00e9lai souhait\u00e9"
              }
              value={resolveOption(
                "steps.charger.fields.deadline",
                fd.deadline,
              )}
              tooltip={tqOpt("steps.charger.fields.deadline.tooltip")}
              tooltipImage={tooltipImage("charger", "deadline")}
            />
          </Section>

          {/* 6. Vehicle */}
          <Section
            title={tq("steps.vehicle.title") || "V\u00e9hicule \u00e9lectrique"}
            printVisible={printSections.vehicle}
          >
            <Field
              label={
                tq("steps.vehicle.fields.vehicleStatus.label") ||
                "Statut v\u00e9hicule"
              }
              value={resolveOption(
                "steps.vehicle.fields.vehicleStatus",
                fd.vehicleStatus,
              )}
            />
            {!!(fd.vehicleBrand || fd.vehicleModel) && (
              <Field
                label={
                  tq("steps.vehicle.fields.vehicleBrand.label") || "Marque"
                }
                value={[fd.vehicleBrand as string, fd.vehicleModel as string]
                  .filter(Boolean)
                  .join(" \u00b7 ")}
              />
            )}
            <Field
              label={
                tq("steps.vehicle.fields.vehicleTripDistance.label") ||
                "Distance trajet typique (km)"
              }
              value={
                fd.vehicleTripDistance === "na"
                  ? resolveOption(
                      "steps.vehicle.fields.vehicleTripDistance",
                      "na",
                    )
                  : fd.vehicleTripDistance != null
                    ? `${fd.vehicleTripDistance} ${tq("steps.vehicle.fields.vehicleTripDistance.unit") || "km"}`
                    : "\u2014"
              }
              tooltip={tqOpt(
                "steps.vehicle.fields.vehicleTripDistance.tooltip",
              )}
              tooltipImage={tooltipImage("vehicle", "vehicleTripDistance")}
            />
            <Field
              label={
                tq("steps.vehicle.fields.vehicleChargingHours.label") ||
                "Heures de recharge disponibles"
              }
              value={
                fd.vehicleChargingHours === "na"
                  ? resolveOption(
                      "steps.vehicle.fields.vehicleChargingHours",
                      "na",
                    )
                  : fd.vehicleChargingHours != null
                    ? `${fd.vehicleChargingHours} ${tq("steps.vehicle.fields.vehicleChargingHours.unit") || "h"}`
                    : "\u2014"
              }
              tooltip={tqOpt(
                "steps.vehicle.fields.vehicleChargingHours.tooltip",
              )}
              tooltipImage={tooltipImage("vehicle", "vehicleChargingHours")}
            />
          </Section>

          {/* 7. Finalization */}
          <Section
            title={tq("steps.finalize.title") || "Finalisation"}
            printVisible={printSections.finalize}
          >
            {(fd.housingStatus === "tenant" ||
              fd.housingStatus === "co-owner") && (
              <Field
                label={
                  tq(
                    `steps.finalize.fields.approval.${fd.housingStatus}.label`,
                  ) || "Approbation"
                }
                value={resolveOption(
                  `steps.finalize.fields.approval.${fd.housingStatus}`,
                  fd.approval,
                )}
                tooltip={tqOpt(
                  `steps.finalize.fields.approval.${fd.housingStatus}.tooltip`,
                )}
                tooltipImage={tooltipImage("finalize", "approval")}
              />
            )}
            <Field
              label={
                tq("steps.finalize.fields.comment.label") || "Commentaire"
              }
              value={fd.comment as string}
              multiline
            />
            <Field
              label={
                tv("sections.finalize.fields.acceptTerms") ||
                tq("steps.finalize.fields.acceptTerms.label") ||
                "CGU accept\u00e9es"
              }
              value={resolveOption("", fd.acceptTerms)}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
