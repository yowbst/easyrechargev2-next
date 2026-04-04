"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronRight, ChevronLeft, Home, Building2, Warehouse, Car, Sun,
  BatteryCharging, Zap, HelpCircle, Key, Package, Clock, User, Users,
  Grid3x3, Tag, MapPin, Plug, Cable, Blocks, Mail, Phone as PhoneIcon,
  Navigation, Gauge, MessageSquare, CheckCircle, Loader2, Gift, ShieldCheck,
} from "lucide-react";
import { useFormTelemetry } from "@/hooks/use-form-telemetry";
import { ProgressBar } from "@/components/quote/ProgressBar";
import { IconButtonGroup, type IconButtonOption } from "@/components/quote/IconButtonGroup";
import { SliderWithCheckbox } from "@/components/quote/SliderWithCheckbox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SUPPORTED_COUNTRIES, validatePhone } from "@/lib/phone-utils";
import { APIProvider } from "@vis.gl/react-google-maps";
import { PlaceAutocomplete } from "@/components/quote/PlaceAutocomplete";
import { getCantonCode, CANTON_CODES } from "@shared/swiss-cantons";
import { usePostHog } from "posthog-js/react";
import { getAttributionCompact } from "@/lib/attribution";
import { t } from "@/lib/i18n/dictionaries";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import Image from "next/image";
import Link from "next/link";
import type { CountryCode } from "libphonenumber-js";
import type { PageRegistryEntry } from "@/lib/directus-queries";

interface QuoteFormProps {
  lang: string;
  dictionary: Record<string, string>;
  quoteSlug?: string;
  /** Directus page config (steps, field overrides, etc.) */
  pageConfig?: Record<string, unknown>;
  /** Hero image URL from Directus block_hero */
  heroImage?: string;
  /** Global config for stats/SLAs on welcome step */
  globalConfig?: {
    stats?: { installations?: number; requests?: number };
    trustpilot?: { score?: number };
    slas?: {
      first_contact?: { value?: number; unit?: string };
      quote_delivery_timeline?: { value?: number | string; unit?: string };
    };
  };
  /** Logo URLs from Directus layout (light / dark variants) */
  logoSrc?: string;
  logoDarkSrc?: string;
  /** Page registry for language switcher */
  pageRegistry?: PageRegistryEntry[];
}

/** Progressive-reveal wrapper: renders children hidden until `visible` is true, with a slide-down animation. */
function RevealField({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hasBeenVisible = useRef(false);

  // Once visible, scroll into view
  useEffect(() => {
    if (visible && !hasBeenVisible.current) {
      hasBeenVisible.current = true;
      // Small delay so the transition starts before scrolling
      const timer = setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 150);
      return () => clearTimeout(timer);
    }
    if (!visible) hasBeenVisible.current = false;
  }, [visible]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-300 ease-out ${
        visible
          ? "opacity-100 max-h-[2000px] translate-y-0"
          : "opacity-0 max-h-0 overflow-hidden translate-y-2 pointer-events-none"
      }`}
    >
      {children}
    </div>
  );
}

interface FormData {
  // From hero form
  housingStatus?: string;

  // Section 1: Logement
  housingType: string;
  solarEquipment: string;
  homeBattery: string;
  neighborhoodEquipment: string;
  electricalBoardType: string;

  // Section 2: Place de parc
  parkingSpotLocation: string;
  electricalLineDistance: number | "na" | null;
  electricalLineHoleCount: number | "na" | null;

  // Section 3: Borne de recharge
  parkingSpotCount: string;
  ecpStatus: string;
  ecpBrand: string;
  ecpModel: string;
  ecpProvided: string;
  deadline: string;

  // Section 4: Vehicule electrique
  vehicleStatus: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleTripDistance: number | "na" | null;
  vehicleChargingHours: number | "na" | null;

  // Section 5: Coordonnees
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  addressMode: "google" | "manual";
  address: string;
  streetName?: string;
  streetNb?: string;
  postalCode?: string;
  locality?: string;
  canton?: string;
  country?: string;

  // Section 6: Finalisation
  approval: string;
  comment: string;
  acceptTerms: boolean;
}

export function QuoteForm({ lang, dictionary, quoteSlug, pageConfig = {}, heroImage, globalConfig: gc = {}, logoSrc, logoDarkSrc, pageRegistry }: QuoteFormProps) {
  const tq = (key: string, vars?: Record<string, string | number>) =>
    t(dictionary, `pages.quote.${key}`, vars);
  // Returns undefined when the translation key is missing or not yet filled in Directus
  const tqOpt = (key: string) => {
    const fullKey = `pages.quote.${key}`;
    const v = t(dictionary, fullKey);
    // t() returns the raw key when missing — detect both that and [bracket] placeholders
    return (v === fullKey || v.startsWith("[")) ? undefined : v;
  };

  const [step, setStep] = useState(0);
  const ph = usePostHog();

  // Sync initial step from URL after hydration (avoids server/client mismatch)
  useEffect(() => {
    const s = parseInt(new URLSearchParams(window.location.search).get("step") ?? "0", 10);
    if (!isNaN(s) && s >= 0 && s <= 6 && s !== 0) setStep(s);
  }, []);

  const tooltipImage = (stepId: string, field: string) => {
    const fc = getFieldConfig(stepId, field);
    const uuid = fc.tooltipImage ?? (Array.isArray(fc.tooltipImages) ? fc.tooltipImages[0] : undefined);
    return uuid ? `/api/cms/assets/${uuid}` : undefined;
  };
  const optionTooltipImage = (stepId: string, fieldKey: string, optionValue: string) => {
    const images = getFieldConfig(stepId, fieldKey).tooltipImages;
    if (!images || typeof images !== "object" || Array.isArray(images)) return undefined;
    const uuid = (images as Record<string, string>)[optionValue];
    return uuid ? `/api/cms/assets/${uuid}` : undefined;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getStepConfig = (stepId: string) =>
    (pageConfig.steps as any[] | undefined)?.find((s: any) => s.id === stepId) ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getFieldConfig = (stepId: string, fieldKey: string): Record<string, any> => {
    const stepsConf: any[] = (pageConfig.steps as any[]) || [];
    const s = stepsConf.find((x: any) => x.id === stepId) || {};
    return (s.fields || []).find((f: any) => f.key === fieldKey) || {};
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    housingType: "",
    solarEquipment: "",
    homeBattery: "",
    neighborhoodEquipment: "",
    electricalBoardType: "",
    parkingSpotLocation: "",
    electricalLineDistance: null,
    electricalLineHoleCount: null,
    parkingSpotCount: "",
    ecpStatus: "get-advice",
    ecpBrand: "",
    ecpModel: "",
    ecpProvided: "",
    deadline: "",
    vehicleStatus: "",
    vehicleBrand: "",
    vehicleModel: "",
    vehicleTripDistance: null,
    vehicleChargingHours: null,
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    phoneCountry: "CH",
    addressMode: "google",
    address: "",
    approval: "",
    comment: "",
    acceptTerms: false,
  });

  // Pre-fill from hero form if coming from home page
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const locality = params.get("locality");
    const postalCode = params.get("postalCode");
    const housingStatus = params.get("housingStatus");

    if (locality || postalCode || housingStatus) {
      setFormData((prev) => ({
        ...prev,
        ...(locality && { locality }),
        ...(postalCode && { postalCode }),
        ...(housingStatus && { housingStatus }),
      }));
    }
  }, []);

  // Apply page-config defaults for fields with configurable defaults
  useEffect(() => {
    const ecpProvidedDefault = getFieldConfig("charger", "ecpProvided").default as string | undefined;
    setFormData((prev) => ({
      ...prev,
      ecpProvided: prev.ecpProvided || ecpProvidedDefault || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageConfig]);

  const telemetry = useFormTelemetry({
    formType: "quote",
    locale: lang,
  });

  const handleFieldChange = (fieldName: keyof FormData, value: string | number | boolean | "na" | null) => {
    telemetry.trackChange(fieldName, String(value));

    // Auto-clear dependent fields when they become invalid
    const updates: Partial<FormData> = { [fieldName]: value };

    // If changing to owner status, clear apartment selection
    if (fieldName === "housingStatus" && value === "owner" && formData.housingType === "apartment") {
      updates.housingType = "";
    }

    // If changing solar equipment to none, clear battery
    if (fieldName === "solarEquipment" && value === "none" && formData.homeBattery) {
      updates.homeBattery = "";
    }

    // Clear neighborhood equipment if conditions no longer apply
    if (fieldName === "housingStatus" || fieldName === "housingType") {
      const newStatus = fieldName === "housingStatus" ? (value as string) : formData.housingStatus;
      const newType = fieldName === "housingType" ? (value as string) : formData.housingType;

      const shouldShow =
        (newStatus === "co-owner" && ["apartment", "house"].includes(newType)) ||
        (newStatus === "tenant" && newType === "apartment");

      if (!shouldShow && formData.neighborhoodEquipment) {
        updates.neighborhoodEquipment = "";
      }
    }

    // If changing ECP status to "get-advice", clear brand and model
    if (fieldName === "ecpStatus" && value === "get-advice") {
      updates.ecpBrand = "";
      updates.ecpModel = "";
    }

    // If changing ECP brand, clear model
    if (fieldName === "ecpBrand") {
      updates.ecpModel = "";
    }

    setFormData({ ...formData, ...updates });
  };

  const totalSteps = 6;

  // Check if neighborhood equipment field should be shown
  const shouldShowNeighborhoodEquipment =
    (formData.housingStatus === "co-owner" && ["apartment", "house"].includes(formData.housingType)) ||
    (formData.housingStatus === "tenant" && formData.housingType === "apartment");

  // Validation for each step
  const isStep1Valid =
    formData.housingStatus &&
    formData.housingType &&
    formData.solarEquipment &&
    formData.electricalBoardType &&
    (!shouldShowNeighborhoodEquipment || formData.neighborhoodEquipment) &&
    (["exists", "in-progress"].includes(formData.solarEquipment) ? formData.homeBattery : true);

  // Valid final parking spot locations (sub-options or underground)
  const validParkingLocations = [
    "exterior-adjacent", "exterior-standalone",
    "garage-adjacent", "garage-standalone",
    "covered-adjacent", "covered-standalone",
    "underground",
  ];

  const isStep2Valid =
    formData.parkingSpotLocation &&
    validParkingLocations.includes(formData.parkingSpotLocation) &&
    formData.electricalLineDistance !== null &&
    formData.electricalLineHoleCount !== null;

  const isStep3Valid =
    formData.parkingSpotCount &&
    formData.ecpProvided &&
    formData.deadline;

  const isStep4Valid =
    formData.vehicleStatus &&
    formData.vehicleTripDistance !== null &&
    formData.vehicleChargingHours !== null;

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);

  const isStep6Valid = formData.acceptTerms;
  const isPhoneValid = formData.phone && validatePhone(formData.phone, formData.phoneCountry as CountryCode);

  const isStep5Valid =
    formData.firstName.trim() &&
    formData.lastName.trim() &&
    isEmailValid &&
    isPhoneValid &&
    (formData.addressMode === "google"
      ? (formData.address && formData.postalCode && formData.locality)
      : (formData.postalCode && formData.locality && formData.streetName && formData.streetNb));

  const canProceed = step === 1 ? isStep1Valid : step === 2 ? isStep2Valid : step === 3 ? isStep3Valid : step === 4 ? isStep4Valid : step === 5 ? isStep5Valid : step === 6 ? isStep6Valid : false;

  // Sync step with URL param; handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const s = parseInt(new URLSearchParams(window.location.search).get("step") ?? "0", 10);
      setStep(isNaN(s) || s < 0 || s > 6 ? 0 : s);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const stepNames = ["welcome", "housing", "parking", "charger", "vehicle", "contact", "finalize"] as const;

  // Helper function to navigate to next step with scroll to top
  const goToStep = (nextStep: number) => {
    if (nextStep > step) {
      ph?.capture("quote_step_completed", { step, step_name: stepNames[step] });
    }
    ph?.capture("quote_step_viewed", { step: nextStep, step_name: stepNames[nextStep] });

    const url = new URL(window.location.href);
    url.searchParams.set("step", String(nextStep));
    history.pushState({}, "", url.toString());
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Handle place selection from Google Places Autocomplete
  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    if (!place.address_components) return;

    let streetNb = "";
    let streetName = "";
    let postal = "";
    let locality = "";
    let canton = "";
    let country = "";

    for (const component of place.address_components) {
      const types = component.types;

      if (types.includes("street_number")) {
        streetNb = component.long_name;
      }
      if (types.includes("route")) {
        streetName = component.long_name;
      }
      if (types.includes("postal_code")) {
        postal = component.long_name;
      }
      if (types.includes("locality")) {
        locality = component.long_name;
      }
      if (types.includes("administrative_area_level_1")) {
        const cantonCode = getCantonCode(component.long_name);
        canton = cantonCode || component.short_name;
      }
      if (types.includes("country")) {
        country = component.short_name;
      }
    }

    setFormData((prev) => ({
      ...prev,
      streetName,
      streetNb,
      postalCode: postal,
      locality,
      canton,
      country,
    }));
  };

  // Toggle between Google Places and manual entry
  const toggleAddressMode = () => {
    setFormData((prev) => ({
      ...prev,
      addressMode: prev.addressMode === "google" ? "manual" : "google",
      // Reset address fields when switching modes
      address: "",
      streetName: "",
      streetNb: "",
      postalCode: "",
      locality: "",
      canton: "",
      country: "",
    }));
  };

  // Housing status options
  const housingStatusOptions: IconButtonOption[] = [
    { value: "owner", label: tq("steps.housing.fields.housingStatus.options.owner"), icon: Home },
    { value: "co-owner", label: tq("steps.housing.fields.housingStatus.options.co-owner"), icon: Building2 },
    { value: "tenant", label: tq("steps.housing.fields.housingStatus.options.tenant"), icon: Key },
  ];

  // Housing type options
  const housingTypeOptions: IconButtonOption[] = [
    { value: "house", label: tq("steps.housing.fields.housingType.options.house"), icon: Home },
    { value: "apartment", label: tq("steps.housing.fields.housingType.options.apartment"), icon: Building2 },
    { value: "other", label: tq("steps.housing.fields.housingType.options.other"), icon: Warehouse },
  ];

  // Parking spot location hierarchy
  const parkingMainOptions = [
    { value: "exterior", label: tq("steps.parking.fields.parkingSpotLocation.options.exterior") },
    { value: "garage", label: tq("steps.parking.fields.parkingSpotLocation.options.garage") },
    { value: "covered", label: tq("steps.parking.fields.parkingSpotLocation.options.covered") },
    { value: "underground", label: tq("steps.parking.fields.parkingSpotLocation.options.underground") },
  ];

  const parkingSubOptions: Record<string, { value: string; label: string }[]> = {
    exterior: [
      { value: "exterior-adjacent", label: tq("steps.parking.fields.parkingSpotLocation.options.exterior-adjacent") },
      { value: "exterior-standalone", label: tq("steps.parking.fields.parkingSpotLocation.options.exterior-standalone") },
    ],
    garage: [
      { value: "garage-adjacent", label: tq("steps.parking.fields.parkingSpotLocation.options.garage-adjacent") },
      { value: "garage-standalone", label: tq("steps.parking.fields.parkingSpotLocation.options.garage-standalone") },
    ],
    covered: [
      { value: "covered-adjacent", label: tq("steps.parking.fields.parkingSpotLocation.options.covered-adjacent") },
      { value: "covered-standalone", label: tq("steps.parking.fields.parkingSpotLocation.options.covered-standalone") },
    ],
  };

  const countryFlag = (code: string) =>
    Array.from(code.toUpperCase()).map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))).join("");

  const getParkingMainValue = () => {
    if (!formData.parkingSpotLocation) return "";
    if (["exterior-adjacent", "exterior-standalone"].includes(formData.parkingSpotLocation)) return "exterior";
    if (["garage-adjacent", "garage-standalone"].includes(formData.parkingSpotLocation)) return "garage";
    if (["covered-adjacent", "covered-standalone"].includes(formData.parkingSpotLocation)) return "covered";
    return formData.parkingSpotLocation;
  };

  const phoneCountries = useMemo(() => {
    const configured = getFieldConfig("contact", "phone").countries as string[] | undefined;
    if (!configured?.length) return SUPPORTED_COUNTRIES;
    return SUPPORTED_COUNTRIES.filter((c) => configured.includes(c.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageConfig]);

  const APPROVAL_DEFAULTS: Record<string, { label: string; options: { value: string; label: string }[] }> = {
    tenant: {
      label: "steps.finalize.fields.approval.tenant.label",
      options: [
        { value: "yes", label: "steps.finalize.fields.approval.tenant.options.yes" },
        { value: "in-progress", label: "steps.finalize.fields.approval.tenant.options.in-progress" },
        { value: "no", label: "steps.finalize.fields.approval.tenant.options.no" },
      ],
    },
    "co-owner": {
      label: "steps.finalize.fields.approval.co-owner.label",
      options: [
        { value: "yes", label: "steps.finalize.fields.approval.co-owner.options.yes" },
        { value: "in-progress", label: "steps.finalize.fields.approval.co-owner.options.in-progress" },
        { value: "no", label: "steps.finalize.fields.approval.co-owner.options.no" },
      ],
    },
  };

  const approvalConfig = useMemo(() => {
    const caseKey = formData.housingStatus;
    if (!caseKey) return null;
    const fieldConf = getFieldConfig("finalize", "approval");
    const cases = (fieldConf.conditional?.cases as Record<string, { label: string; options: { value: string; label: string }[] }> | undefined) ?? APPROVAL_DEFAULTS;
    return cases[caseKey] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageConfig, formData.housingStatus]);

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  return (
    <div className="min-h-screen flex flex-col bg-muted/30" data-hide-layout>
      {/* Focused Header: logo centered, controls on right */}
      <div className="py-4 md:py-6 bg-background">
        <div className="container mx-auto px-4 flex justify-between items-center md:grid md:grid-cols-3">
          <div className="hidden md:block" />
          <div className="flex md:justify-center">
            <Link href={`/${lang}`} data-testid="link-logo-home">
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoSrc || "/logo-color.svg"}
                  alt="easyRecharge"
                  className="h-8 md:h-10 w-auto dark:hidden"
                  data-testid="img-logo-quote"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoDarkSrc || "/logo-white.svg"}
                  alt="easyRecharge"
                  className="h-8 md:h-10 w-auto hidden dark:block"
                  data-testid="img-logo-quote-dark"
                />
              </>
            </Link>
          </div>
          <div className="flex justify-end items-center gap-2">
            <LanguageSwitcher pageRegistry={pageRegistry} />
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="flex-1 py-4 md:py-6 pb-28">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {/* Progress Bar at Top */}
            {step > 0 && (
              <ProgressBar
                currentStep={step}
                totalSteps={totalSteps}
                onStepClick={goToStep}
                className="mb-4"
              />
            )}

            {/* Main Form Card */}
            <Card className={`rounded-2xl border border-border/80 shadow-sm ${step === 0 ? "overflow-hidden" : "p-6"}`}>
              {/* Step 0: Welcome */}
              {step === 0 && (
                <div>
                  {/* Hero image with overlay headline */}
                  {heroImage ? (
                    <div className="relative h-56 overflow-hidden">
                      <Image src={heroImage} alt="" priority fill sizes="(max-width: 768px) 100vw, 672px" quality={75} className="object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-slate-900/10" />
                      <div className="absolute inset-0 flex flex-col justify-end p-6">
                        <h1 className="text-2xl font-heading font-bold text-white leading-tight">
                          {tq("welcome.title")}
                        </h1>
                        <p className="text-sm text-white/80 mt-1">
                          {tq("welcome.subtitle", { first_contact: gc.slas?.first_contact?.value ?? 48 })}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 pt-6">
                      <h1 className="text-2xl font-heading font-bold">
                        {tq("welcome.title")}
                      </h1>
                      <p className="text-sm text-muted-foreground mt-1">
                        {tq("welcome.subtitle", { first_contact: gc.slas?.first_contact?.value ?? 48 })}
                      </p>
                    </div>
                  )}

                  {/* Stats row — values from Directus global_config */}
                  {(() => {
                    const instCount = gc.stats?.installations;
                    const tpScore = gc.trustpilot?.score;
                    const stats = [
                      {
                        value: instCount != null ? `${instCount}+` : "650+",
                        label: tq("welcome.stats.installations.label"),
                      },
                      {
                        value: tpScore != null ? `${tpScore} ★` : "4.8 ★",
                        label: tq("welcome.stats.rating.label"),
                      },
                    ];
                    return (
                      <div className="grid grid-cols-2 border-b border-border/60 bg-primary/5">
                        {stats.map((stat, i, arr) => (
                          <div key={stat.label} className={`py-4 px-3 text-center ${i < arr.length - 1 ? "border-r border-border/60" : ""}`}>
                            <div className="text-xl font-bold text-primary">{stat.value}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{stat.label}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* USPs */}
                  <div className="px-6 py-5 space-y-3">
                    {[
                      { icon: CheckCircle, text: tq("welcome.usps.certified") },
                      { icon: Clock, text: tq("welcome.usps.fast", { quote_delivery_timeline: gc.slas?.quote_delivery_timeline?.value ?? "3-5" }) },
                      { icon: Tag, text: tq("welcome.usps.transparent") },
                    ].map(({ icon: Icon, text }) => (
                      <div key={text} className="flex items-center gap-3">
                        <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium">{text}</span>
                      </div>
                    ))}
                  </div>

                  {/* Offer banner (conditional on welcome step config.offer.active) */}
                  {(() => {
                    const offer = getStepConfig("welcome").offer;
                    if (!offer || offer.active === false) return null;
                    return (
                      <div className="mx-6 mb-6 pt-5 border-t border-primary/20">
                        <div className="flex items-start gap-3">
                          <Gift className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="font-heading font-semibold text-sm text-foreground mb-1">
                              {tq("welcome.offer.title")}
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {tq("welcome.offer.description", {
                                currency: offer.currency || "CHF",
                                amount: offer.amount || 50,
                                network: offer.network || "Shell",
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Section 1: Logement */}
              {step === 1 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <Home className="h-6 w-6 text-primary flex-shrink-0" />
                    <h2 className="text-2xl font-heading font-bold">{tq("steps.housing.title")}</h2>
                  </div>

                  {/* Housing Status — always visible (first question) */}
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                      <User className="h-4 w-4 text-primary" />
                      {tq("steps.housing.fields.housingStatus.label")}
                    </Label>
                    <IconButtonGroup
                      options={housingStatusOptions}
                      value={formData.housingStatus || ""}
                      onChange={(value) => handleFieldChange("housingStatus", value)}
                    />
                  </div>

                  {/* Housing Type */}
                  <RevealField visible={!!formData.housingStatus}>
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                        <Home className="h-4 w-4 text-primary" />
                        {tq("steps.housing.fields.housingType.label")}
                      </Label>
                      <IconButtonGroup
                        options={housingTypeOptions}
                        value={formData.housingType}
                        onChange={(value) => handleFieldChange("housingType", value)}
                        disabledValues={formData.housingStatus === "owner" ? ["apartment"] : []}
                      />
                    </div>
                  </RevealField>

                  {/* Solar Equipment */}
                  <RevealField visible={!!formData.housingStatus && !!formData.housingType}>
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 block">
                        <InfoTooltip className="flex items-center gap-1.5" content={tqOpt("steps.housing.fields.solarEquipment.tooltip")} image={tooltipImage("housing", "solarEquipment")}>
                          <Sun className="h-4 w-4 text-primary" />
                          {tq("steps.housing.fields.solarEquipment.label")}
                        </InfoTooltip>
                      </Label>
                      <RadioGroup
                        value={formData.solarEquipment}
                        onValueChange={(value) => handleFieldChange("solarEquipment", value)}
                        className="space-y-0.5"
                      >
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="exists" id="solar-exists" data-testid="radio-solar-exists" />
                          <Label htmlFor="solar-exists" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.solarEquipment.options.exists")}</Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="in-progress" id="solar-progress" data-testid="radio-solar-progress" />
                          <Label htmlFor="solar-progress" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.solarEquipment.options.in-progress")}</Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="none" id="solar-none" data-testid="radio-solar-none" />
                          <Label htmlFor="solar-none" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.solarEquipment.options.none")}</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </RevealField>

                  {/* Home Battery (conditional on solar) */}
                  <RevealField visible={["exists", "in-progress"].includes(formData.solarEquipment)}>
                    <div className="pl-4 border-l-2 border-primary/20">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 block">
                        <InfoTooltip className="flex items-center gap-1.5" content={tqOpt("steps.housing.fields.homeBattery.tooltip")} image={tooltipImage("housing", "homeBattery")}>
                          <BatteryCharging className="h-4 w-4 text-primary" />
                          {tq("steps.housing.fields.homeBattery.label")}
                        </InfoTooltip>
                      </Label>
                      <RadioGroup
                        value={formData.homeBattery}
                        onValueChange={(value) => handleFieldChange("homeBattery", value)}
                        className="space-y-0.5"
                      >
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="exists" id="battery-exists" data-testid="radio-battery-exists" />
                          <Label htmlFor="battery-exists" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.homeBattery.options.exists")}</Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="in-progress" id="battery-progress" data-testid="radio-battery-progress" />
                          <Label htmlFor="battery-progress" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.homeBattery.options.in-progress")}</Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="none" id="battery-none" data-testid="radio-battery-none" />
                          <Label htmlFor="battery-none" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.homeBattery.options.none")}</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </RevealField>

                  {/* Neighborhood Equipment (conditional on status + type) */}
                  <RevealField visible={shouldShowNeighborhoodEquipment && !!formData.solarEquipment}>
                    <div className="pl-4 border-l-2 border-primary/20">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 block">
                        <InfoTooltip className="flex items-center gap-1.5" content={tqOpt("steps.housing.fields.neighborhoodEquipment.tooltip")} image={tooltipImage("housing", "neighborhoodEquipment")}>
                          <Users className="h-4 w-4 text-primary" />
                          {tq("steps.housing.fields.neighborhoodEquipment.label")}
                        </InfoTooltip>
                      </Label>
                      <RadioGroup
                        value={formData.neighborhoodEquipment}
                        onValueChange={(value) => handleFieldChange("neighborhoodEquipment", value)}
                        className="space-y-0.5"
                      >
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="exists" id="neighbor-exists" data-testid="radio-neighbor-exists" />
                          <Label htmlFor="neighbor-exists" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.neighborhoodEquipment.options.exists")}</Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="in-progress" id="neighbor-progress" data-testid="radio-neighbor-progress" />
                          <Label htmlFor="neighbor-progress" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.neighborhoodEquipment.options.in-progress")}</Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="none" id="neighbor-none" data-testid="radio-neighbor-none" />
                          <Label htmlFor="neighbor-none" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.neighborhoodEquipment.options.none")}</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </RevealField>

                  {/* Electrical Board Type */}
                  <RevealField visible={!!formData.solarEquipment}>
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 block">
                        <InfoTooltip className="flex items-center gap-1.5" content={tqOpt("steps.housing.fields.electricalBoardType.tooltip")} image={tooltipImage("housing", "electricalBoardType")}>
                          <Plug className="h-4 w-4 text-primary" />
                          {tq("steps.housing.fields.electricalBoardType.label")}
                        </InfoTooltip>
                      </Label>
                      <RadioGroup
                        value={formData.electricalBoardType}
                        onValueChange={(value) => handleFieldChange("electricalBoardType", value)}
                        className="space-y-0.5"
                      >
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="old" id="board-old" data-testid="radio-board-old" />
                          <Label htmlFor="board-old" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.electricalBoardType.options.old")}</Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="recent" id="board-recent" data-testid="radio-board-recent" />
                          <Label htmlFor="board-recent" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.electricalBoardType.options.recent")}</Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="na" id="board-na" data-testid="radio-board-na" />
                          <Label htmlFor="board-na" className="cursor-pointer flex-1 text-sm">{tq("steps.housing.fields.electricalBoardType.options.na")}</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </RevealField>
                </div>
              )}

              {/* Section 2: Place de parc */}
              {step === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <Car className="h-6 w-6 text-primary flex-shrink-0" />
                    <h2 className="text-2xl font-heading font-bold">{tq("steps.parking.title")}</h2>
                  </div>

                  {/* Parking Spot Location (Hierarchical) */}
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-primary" />
                      {tq("steps.parking.fields.parkingSpotLocation.label")}
                    </Label>
                    <RadioGroup
                      value={formData.parkingSpotLocation}
                      onValueChange={(value) => handleFieldChange("parkingSpotLocation", value)}
                      className="space-y-0.5"
                    >
                      {parkingMainOptions.map((option) => (
                        <div key={option.value}>
                          <div
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                              getParkingMainValue() === option.value
                                ? "border-primary/40 bg-primary/5"
                                : "border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5"
                            }`}
                            onClick={() => handleFieldChange("parkingSpotLocation", option.value)}
                            data-testid={`radio-parking-${option.value}`}
                          >
                            <div className={`h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                              getParkingMainValue() === option.value ? "border-primary" : "border-input"
                            }`}>
                              {getParkingMainValue() === option.value && (
                                <div className="h-2 w-2 rounded-full bg-primary" />
                              )}
                            </div>
                            <span className="flex-1 flex items-center gap-2">
                              <InfoTooltip
                                content={tqOpt(`steps.parking.fields.parkingSpotLocation.optionTooltips.${option.value}`)}
                                image={optionTooltipImage("parking", "parkingSpotLocation", option.value)}
                              >
                                <span className="text-sm">{option.label}</span>
                              </InfoTooltip>
                              {parkingSubOptions[option.value] && (
                                <span className="text-xs text-muted-foreground font-normal normal-case tracking-normal">
                                  {tq("steps.parking.fields.parkingSpotLocation.variantsHint", { count: parkingSubOptions[option.value].length })}
                                </span>
                              )}
                            </span>
                          </div>

                          {/* Sub-options */}
                          {parkingSubOptions[option.value] && getParkingMainValue() === option.value && (
                            <div className="ml-8 mt-2 space-y-2 pl-4 border-l-2 border-primary/20">
                              {parkingSubOptions[option.value].map((subOption) => (
                                <div key={subOption.value} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                                  <RadioGroupItem
                                    value={subOption.value}
                                    id={`parking-${subOption.value}`}
                                    data-testid={`radio-parking-${subOption.value}`}
                                  />
                                  <Label htmlFor={`parking-${subOption.value}`} className="cursor-pointer flex-1 text-sm">
                                    <InfoTooltip
                                      content={tqOpt(`steps.parking.fields.parkingSpotLocation.optionTooltips.${subOption.value}`)}
                                      image={optionTooltipImage("parking", "parkingSpotLocation", subOption.value)}
                                    >
                                      {subOption.label}
                                    </InfoTooltip>
                                  </Label>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Electrical Line Distance */}
                  <RevealField visible={validParkingLocations.includes(formData.parkingSpotLocation)}>
                    <SliderWithCheckbox
                      value={formData.electricalLineDistance}
                      onChange={(value) => handleFieldChange("electricalLineDistance", value)}
                      min={getFieldConfig("parking", "electricalLineDistance").min ?? 5}
                      max={getFieldConfig("parking", "electricalLineDistance").max ?? 50}
                      step={getFieldConfig("parking", "electricalLineDistance").step ?? 5}
                      label={tq("steps.parking.fields.electricalLineDistance.label")}
                      unit={tq("steps.parking.fields.electricalLineDistance.unit")}
                      checkboxLabel={tq("steps.parking.fields.electricalLineDistance.checkboxLabel")}
                      icon={Cable}
                      tooltip={tqOpt("steps.parking.fields.electricalLineDistance.tooltip")}
                      tooltipImage={tooltipImage("parking", "electricalLineDistance")}
                    />
                  </RevealField>

                  {/* Walls to Cross */}
                  <RevealField visible={validParkingLocations.includes(formData.parkingSpotLocation) && formData.electricalLineDistance !== null}>
                    <SliderWithCheckbox
                      value={formData.electricalLineHoleCount}
                      onChange={(value) => handleFieldChange("electricalLineHoleCount", value)}
                      min={getFieldConfig("parking", "electricalLineHoleCount").min ?? 0}
                      max={getFieldConfig("parking", "electricalLineHoleCount").max ?? 5}
                      step={getFieldConfig("parking", "electricalLineHoleCount").step ?? 1}
                      label={tq("steps.parking.fields.electricalLineHoleCount.label")}
                      unit={` ${tq("steps.parking.fields.electricalLineHoleCount.unit")}`}
                      checkboxLabel={tq("steps.parking.fields.electricalLineHoleCount.checkboxLabel")}
                      icon={Blocks}
                      tooltip={tqOpt("steps.parking.fields.electricalLineHoleCount.tooltip")}
                      tooltipImage={tooltipImage("parking", "electricalLineHoleCount")}
                    />
                  </RevealField>
                </div>
              )}

              {/* Section 3: Borne de recharge */}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <Zap className="h-6 w-6 text-primary flex-shrink-0" />
                    <h2 className="text-2xl font-heading font-bold">{tq("steps.charger.title")}</h2>
                  </div>

                  {/* Parking Spot Count */}
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                      <Grid3x3 className="h-4 w-4 text-primary" />
                      {tq("steps.charger.fields.parkingSpotCount.label")}
                    </Label>
                    <div className="grid grid-cols-3 gap-3">
                      {(["1", "2", "3+"] as const).map((count) => {
                        const optionKey = count === "3+" ? "3plus" : count;
                        const isSelected = formData.parkingSpotCount === count;
                        return (
                          <button
                            key={count}
                            type="button"
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-lg border transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30"
                                : "border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 text-foreground"
                            }`}
                            onClick={() => handleFieldChange("parkingSpotCount", count)}
                            data-testid={`button-parking-count-${count}`}
                          >
                            <span className="text-base font-bold">{count}</span>
                            <span className="text-xs font-normal opacity-80 leading-tight text-center">
                              {tq(`steps.charger.fields.parkingSpotCount.options.${optionKey}`)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ECP Status — hidden: only one default value ("get-advice") */}

                  {/* ECP Provided (Supplies) */}
                  <RevealField visible={!!formData.parkingSpotCount}>
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 block">
                        <InfoTooltip className="flex items-center gap-1.5" content={tqOpt("steps.charger.fields.ecpProvided.tooltip")} image={tooltipImage("charger", "ecpProvided")}>
                          <Package className="h-4 w-4 text-primary" />
                          {tq("steps.charger.fields.ecpProvided.label")}
                        </InfoTooltip>
                      </Label>
                      <RadioGroup
                        value={formData.ecpProvided}
                        onValueChange={(value) => handleFieldChange("ecpProvided", value)}
                        className="space-y-0.5"
                      >
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="include" id="provided-include" data-testid="radio-provided-include" />
                          <Label htmlFor="provided-include" className="cursor-pointer flex-1 text-sm">
                            {tq("steps.charger.fields.ecpProvided.options.include")}
                          </Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="exclude" id="provided-exclude" data-testid="radio-provided-exclude" />
                          <Label htmlFor="provided-exclude" className="cursor-pointer flex-1 text-sm">
                            {tq("steps.charger.fields.ecpProvided.options.exclude")}
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </RevealField>

                  {/* Deadline (Timeline) */}
                  <RevealField visible={!!formData.parkingSpotCount && !!formData.ecpProvided}>
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 block">
                        <InfoTooltip className="flex items-center gap-1.5" content={tqOpt("steps.charger.fields.deadline.tooltip")} image={tooltipImage("charger", "deadline")}>
                          <Clock className="h-4 w-4 text-primary" />
                          {tq("steps.charger.fields.deadline.label")}
                        </InfoTooltip>
                      </Label>
                      <RadioGroup
                        value={formData.deadline}
                        onValueChange={(value) => handleFieldChange("deadline", value)}
                        className="space-y-0.5"
                      >
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="asap" id="deadline-asap" data-testid="radio-deadline-asap" />
                          <Label htmlFor="deadline-asap" className="cursor-pointer flex-1 text-sm">
                            {tq("steps.charger.fields.deadline.options.asap")}
                          </Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="2-3mo" id="deadline-2-3mo" data-testid="radio-deadline-2-3mo" />
                          <Label htmlFor="deadline-2-3mo" className="cursor-pointer flex-1 text-sm">
                            {tq("steps.charger.fields.deadline.options.2-3mo")}
                          </Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="3-6mo" id="deadline-3-6mo" data-testid="radio-deadline-3-6mo" />
                          <Label htmlFor="deadline-3-6mo" className="cursor-pointer flex-1 text-sm">
                            {tq("steps.charger.fields.deadline.options.3-6mo")}
                          </Label>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                          <RadioGroupItem value="6+mo" id="deadline-6+mo" data-testid="radio-deadline-6+mo" />
                          <Label htmlFor="deadline-6+mo" className="cursor-pointer flex-1 text-sm">
                            {tq("steps.charger.fields.deadline.options.6+mo")}
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </RevealField>
                </div>
              )}

              {/* Section 4: Vehicule electrique */}
              {step === 4 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <Car className="h-6 w-6 text-primary flex-shrink-0" />
                    <h2 className="text-2xl font-heading font-bold">{tq("steps.vehicle.title")}</h2>
                  </div>

                  {/* Vehicle Status */}
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                      <Key className="h-4 w-4 text-primary" />
                      {tq("steps.vehicle.fields.vehicleStatus.label")}
                    </Label>
                    <RadioGroup
                      value={formData.vehicleStatus}
                      onValueChange={(value) => handleFieldChange("vehicleStatus", value)}
                      className="grid gap-2 pl-1"
                    >
                      <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                        <RadioGroupItem value="own" id="vehicle-own" data-testid="radio-vehicle-own" />
                        <Label htmlFor="vehicle-own" className="cursor-pointer flex-1 text-sm">
                          {tq("steps.vehicle.fields.vehicleStatus.options.own")}
                        </Label>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                        <RadioGroupItem value="ordered" id="vehicle-ordered" data-testid="radio-vehicle-ordered" />
                        <Label htmlFor="vehicle-ordered" className="cursor-pointer flex-1 text-sm">
                          {tq("steps.vehicle.fields.vehicleStatus.options.ordered")}
                        </Label>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                        <RadioGroupItem value="want-to-order" id="vehicle-want" data-testid="radio-vehicle-want" />
                        <Label htmlFor="vehicle-want" className="cursor-pointer flex-1 text-sm">
                          {tq("steps.vehicle.fields.vehicleStatus.options.want-to-order")}
                        </Label>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                        <RadioGroupItem value="unknown" id="vehicle-unknown" data-testid="radio-vehicle-unknown" />
                        <Label htmlFor="vehicle-unknown" className="cursor-pointer flex-1 text-sm">
                          {tq("steps.vehicle.fields.vehicleStatus.options.unknown")}
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Vehicle Brand & Model — hidden: not actionable yet */}

                  {/* Trip Distance Slider */}
                  <RevealField visible={!!formData.vehicleStatus}>
                    <SliderWithCheckbox
                      value={formData.vehicleTripDistance}
                      onChange={(value) => handleFieldChange("vehicleTripDistance", value)}
                      min={getFieldConfig("vehicle", "vehicleTripDistance").min ?? 5}
                      max={getFieldConfig("vehicle", "vehicleTripDistance").max ?? 180}
                      step={getFieldConfig("vehicle", "vehicleTripDistance").step ?? 5}
                      label={tq("steps.vehicle.fields.vehicleTripDistance.label")}
                      unit={tq("steps.vehicle.fields.vehicleTripDistance.unit")}
                      checkboxLabel={tq("steps.vehicle.fields.vehicleTripDistance.na")}
                      showEdgeLabels={true}
                      icon={Navigation}
                      tickInterval={getFieldConfig("vehicle", "vehicleTripDistance").tickInterval ?? 25}
                      tooltip={tqOpt("steps.vehicle.fields.vehicleTripDistance.tooltip")}
                      tooltipImage={tooltipImage("vehicle", "vehicleTripDistance")}
                    />
                  </RevealField>

                  {/* Charging Hours Slider */}
                  <RevealField visible={!!formData.vehicleStatus && formData.vehicleTripDistance !== null}>
                    <SliderWithCheckbox
                      value={formData.vehicleChargingHours}
                      onChange={(value) => handleFieldChange("vehicleChargingHours", value)}
                      min={getFieldConfig("vehicle", "vehicleChargingHours").min ?? 5}
                      max={getFieldConfig("vehicle", "vehicleChargingHours").max ?? 10}
                      step={getFieldConfig("vehicle", "vehicleChargingHours").step ?? 1}
                      label={tq("steps.vehicle.fields.vehicleChargingHours.label")}
                      unit={tq("steps.vehicle.fields.vehicleChargingHours.unit")}
                      checkboxLabel={tq("steps.vehicle.fields.vehicleChargingHours.na")}
                      showEdgeLabels={true}
                      icon={Gauge}
                      tooltip={tqOpt("steps.vehicle.fields.vehicleChargingHours.tooltip")}
                      tooltipImage={tooltipImage("vehicle", "vehicleChargingHours")}
                    />
                  </RevealField>
                </div>
              )}

              {/* Section 5: Coordonnees */}
              {step === 5 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <User className="h-6 w-6 text-primary flex-shrink-0" />
                    <h2 className="text-2xl font-heading font-bold">{tq("steps.contact.title")}</h2>
                  </div>

                  {/* First Name & Last Name */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="firstName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                        <User className="h-4 w-4 text-primary" />
                        {tq("steps.contact.fields.firstName.label")}
                      </Label>
                      <Input
                        id="firstName"
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => handleFieldChange("firstName", e.target.value)}
                        data-testid="input-firstName"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-primary" />
                        {tq("steps.contact.fields.lastName.label")}
                      </Label>
                      <Input
                        id="lastName"
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => handleFieldChange("lastName", e.target.value)}
                        data-testid="input-lastName"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                      <Mail className="h-4 w-4 text-primary" />
                      {tq("steps.contact.fields.email.label")}
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleFieldChange("email", e.target.value)}
                      data-testid="input-email"
                    />
                    {formData.email && !isEmailValid && (
                      <p className="text-xs text-destructive mt-1">{tq("steps.contact.fields.email.error")}</p>
                    )}
                  </div>

                  {/* Phone with Country Selector */}
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                      <PhoneIcon className="h-4 w-4 text-primary" />
                      {tq("steps.contact.fields.phone.label")}
                    </Label>
                    <div className="flex">
                      <Select
                        value={formData.phoneCountry}
                        onValueChange={(value) => handleFieldChange("phoneCountry", value)}
                      >
                        <SelectTrigger className="w-28 rounded-r-none border-r-0 text-sm font-normal" data-testid="select-phoneCountry">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {phoneCountries.map((country) => (
                            <SelectItem key={country.code} value={country.code}>
                              <span className="flex items-center gap-2">
                                <span>{countryFlag(country.code)}</span>
                                <span>{country.dialCode}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => {
                          const dialCode = phoneCountries.find((c) => c.code === formData.phoneCountry)?.dialCode ?? "";
                          let phone = e.target.value.trim();
                          const compact = phone.replace(/[\s\-]/g, "");
                          if (compact.startsWith(dialCode)) {
                            phone = compact.slice(dialCode.length).trimStart();
                          } else if (compact.startsWith("00" + dialCode.slice(1))) {
                            phone = compact.slice(2 + dialCode.length - 1).trimStart();
                          }
                          handleFieldChange("phone", phone);
                        }}
                        className="flex-1 rounded-l-none text-sm"
                        data-testid="input-phone"
                      />
                    </div>
                    {formData.phone && !isPhoneValid && (
                      <p className="text-xs text-destructive mt-1">{tq("steps.contact.fields.phone.error")}</p>
                    )}
                  </div>

                  {/* Address */}
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-primary" />
                      {tq("steps.contact.fields.address.label")}
                    </Label>

                    {formData.addressMode === "google" ? (
                      <>
                        {/* Only hide search after a place is actually selected (which populates streetName) */}
                        <div className={formData.streetName ? "hidden" : ""}>
                          <APIProvider apiKey={googleMapsApiKey} libraries={["places"]}>
                            <PlaceAutocomplete
                              id="address"
                              value={formData.address}
                              onChange={(value) => handleFieldChange("address", value)}
                              onPlaceSelect={handlePlaceSelect}
                              placeholder={tq("steps.contact.fields.address.placeholder") || undefined}
                            />
                          </APIProvider>
                        </div>

                        {/* Display editable address component fields */}
                        {(formData.streetName || formData.locality) && (
                          <div className="space-y-3">
                            {/* Street Name and Number */}
                            <div className="grid grid-cols-4 gap-2">
                              <div className="col-span-3">
                                <Label htmlFor="streetName-google" className="text-xs text-muted-foreground mb-1">
                                  {tq("steps.contact.fields.address.subfields.streetName")} <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                  id="streetName-google"
                                  type="text"
                                  value={formData.streetName || ""}
                                  onChange={(e) => handleFieldChange("streetName", e.target.value)}
                                  placeholder=""
                                  data-testid="input-streetName-google"
                                />
                              </div>
                              <div className="col-span-1">
                                <Label htmlFor="streetNb-google" className="text-xs text-muted-foreground mb-1">
                                  {tq("steps.contact.fields.address.subfields.streetNb")} <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                  id="streetNb-google"
                                  type="text"
                                  value={formData.streetNb || ""}
                                  onChange={(e) => handleFieldChange("streetNb", e.target.value)}
                                  placeholder=""
                                  data-testid="input-streetNb-google"
                                />
                              </div>
                            </div>

                            {/* Postal Code and Locality */}
                            <div className="grid grid-cols-4 gap-2">
                              <div className="col-span-1">
                                <Label htmlFor="postalCode-google" className="text-xs text-muted-foreground mb-1">
                                  {tq("steps.contact.fields.address.subfields.postalCode")} <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                  id="postalCode-google"
                                  type="text"
                                  value={formData.postalCode || ""}
                                  onChange={(e) => handleFieldChange("postalCode", e.target.value)}
                                  placeholder=""
                                  data-testid="input-postalCode-google"
                                />
                              </div>
                              <div className="col-span-3">
                                <Label htmlFor="locality-google" className="text-xs text-muted-foreground mb-1">
                                  {tq("steps.contact.fields.address.subfields.locality")} <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                  id="locality-google"
                                  type="text"
                                  value={formData.locality || ""}
                                  onChange={(e) => handleFieldChange("locality", e.target.value)}
                                  placeholder=""
                                  data-testid="input-locality-google"
                                />
                              </div>
                            </div>

                            {/* Canton and Country */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label htmlFor="canton-google" className="text-xs text-muted-foreground mb-1">
                                  {tq("steps.contact.fields.address.subfields.canton")}
                                </Label>
                                <Select value={formData.canton || ""} onValueChange={(value) => handleFieldChange("canton", value)}>
                                  <SelectTrigger id="canton-google" data-testid="input-canton-google">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CANTON_CODES.map((code) => (
                                      <SelectItem key={code} value={code}>{code}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label htmlFor="country-google" className="text-xs text-muted-foreground mb-1">
                                  {tq("steps.contact.fields.address.subfields.country")}
                                </Label>
                                <Input
                                  id="country-google"
                                  type="text"
                                  value={formData.country || "CH"}
                                  disabled
                                  data-testid="input-country-google"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={toggleAddressMode}
                          className="text-sm text-primary hover:underline mt-2"
                          data-testid="button-toggle-manual-mode"
                        >
                          {tq("steps.contact.fields.address.toggleManual")}
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Manual Entry Mode */}
                        <div className="space-y-3">
                          {/* Street Name and Number */}
                          <div className="grid grid-cols-4 gap-2">
                            <div className="col-span-3">
                              <Label htmlFor="streetName" className="text-xs text-muted-foreground mb-1">
                                {tq("steps.contact.fields.address.subfields.streetName")} <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="streetName"
                                type="text"
                                value={formData.streetName || ""}
                                onChange={(e) => handleFieldChange("streetName", e.target.value)}
                                placeholder=""
                                data-testid="input-streetName"
                              />
                            </div>
                            <div className="col-span-1">
                              <Label htmlFor="streetNb" className="text-xs text-muted-foreground mb-1">
                                {tq("steps.contact.fields.address.subfields.streetNb")} <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="streetNb"
                                type="text"
                                value={formData.streetNb || ""}
                                onChange={(e) => handleFieldChange("streetNb", e.target.value)}
                                placeholder=""
                                data-testid="input-streetNb"
                              />
                            </div>
                          </div>

                          {/* Postal Code and Locality */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-1">
                              <Label htmlFor="postalCode-manual" className="text-xs text-muted-foreground mb-1">
                                {tq("steps.contact.fields.address.subfields.postalCode")} <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="postalCode-manual"
                                type="text"
                                value={formData.postalCode || ""}
                                onChange={(e) => handleFieldChange("postalCode", e.target.value)}
                                placeholder=""
                                data-testid="input-postalCode-manual"
                              />
                            </div>
                            <div className="col-span-2">
                              <Label htmlFor="locality-manual" className="text-xs text-muted-foreground mb-1">
                                {tq("steps.contact.fields.address.subfields.locality")} <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="locality-manual"
                                type="text"
                                value={formData.locality || ""}
                                onChange={(e) => handleFieldChange("locality", e.target.value)}
                                placeholder=""
                                data-testid="input-locality-manual"
                              />
                            </div>
                          </div>

                          {/* Canton and Country */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label htmlFor="canton-manual" className="text-xs text-muted-foreground mb-1">
                                {tq("steps.contact.fields.address.subfields.canton")}
                              </Label>
                              <Select value={formData.canton || ""} onValueChange={(value) => handleFieldChange("canton", value)}>
                                <SelectTrigger id="canton-manual" data-testid="input-canton-manual">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CANTON_CODES.map((code) => (
                                    <SelectItem key={code} value={code}>{code}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor="country-manual" className="text-xs text-muted-foreground mb-1">
                                {tq("steps.contact.fields.address.subfields.country")}
                              </Label>
                              <Input
                                id="country-manual"
                                type="text"
                                value={formData.country || "CH"}
                                disabled
                                data-testid="input-country-manual"
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={toggleAddressMode}
                          className="text-sm text-primary hover:underline mt-2"
                          data-testid="button-toggle-google-mode"
                        >
                          {tq("steps.contact.fields.address.toggleGoogle")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Section 6: Finalisation */}
              {step === 6 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <CheckCircle className="h-6 w-6 text-primary flex-shrink-0" />
                    <h2 className="text-2xl font-heading font-bold">{tq("steps.finalize.title")}</h2>
                  </div>

                  {/* Approval (conditional on tenant / co-owner) */}
                  {approvalConfig && (
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 block">
                        <InfoTooltip className="flex items-center gap-1.5" content={tqOpt(`steps.finalize.fields.approval.${formData.housingStatus}.tooltip`)} image={tooltipImage("finalize", "approval")}>
                          <ShieldCheck className="h-4 w-4 text-primary" />
                          {tq(approvalConfig.label)}
                        </InfoTooltip>
                      </Label>
                      <RadioGroup
                        value={formData.approval}
                        onValueChange={(value) => handleFieldChange("approval", value)}
                        className="space-y-0.5"
                      >
                        {approvalConfig.options.map((opt) => (
                          <div key={opt.value} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                            <RadioGroupItem value={opt.value} id={`approval-${opt.value}`} data-testid={`radio-approval-${opt.value}`} />
                            <Label htmlFor={`approval-${opt.value}`} className="cursor-pointer flex-1 text-sm">
                              {tq(opt.label)}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  )}

                  {/* Comment */}
                  <div>
                    <Label htmlFor="comment" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      {tq("steps.finalize.fields.comment.label")}
                    </Label>
                    <Textarea
                      id="comment"
                      placeholder={tq("steps.finalize.fields.comment.placeholder")}
                      value={formData.comment}
                      onChange={(e) => handleFieldChange("comment", e.target.value)}
                      rows={4}
                      className="resize-none"
                      data-testid="textarea-comment"
                    />
                  </div>

                  {/* Terms and Conditions */}
                  <div className="space-y-2">
                    <label
                      htmlFor="acceptTerms"
                      className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                        formData.acceptTerms
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/60 bg-muted/40 hover:border-primary/30 hover:bg-muted/60"
                      }`}
                    >
                      <Checkbox
                        id="acceptTerms"
                        checked={formData.acceptTerms}
                        onCheckedChange={(checked) => handleFieldChange("acceptTerms", !!checked)}
                        className="shrink-0"
                        data-testid="checkbox-accept-terms"
                      />
                      <p className="text-sm leading-relaxed">
                        {tq("steps.finalize.fields.acceptTerms.label")}
                      </p>
                    </label>
                    <p className="text-xs text-muted-foreground px-1">
                      {tq("steps.finalize.fields.acceptTerms.privacyNote").split("{privacyLink}")[0]}
                      <a href={`/${lang}/privacy`} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                        {tq("steps.finalize.fields.acceptTerms.privacyLink")}
                      </a>
                      {tq("steps.finalize.fields.acceptTerms.privacyNote").split("{privacyLink}")[1]}
                    </p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Fixed Navigation Buttons - Always Visible at Bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border/60 shadow-lg z-50 py-3">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto">
              {step === 0 && (
                <Button
                  onClick={() => goToStep(1)}
                  className="w-full h-10 text-sm font-semibold rounded-lg"
                  data-testid="button-start-quote"
                >
                  {tq("welcome.cta")}
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              )}

              {step === 1 && (
                <Button
                  onClick={() => goToStep(2)}
                  className="w-full h-10 text-sm font-semibold rounded-lg"
                  disabled={!isStep1Valid}
                  data-testid="button-next-step-1"
                >
                  {tq("navigation.next")}
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              )}

              {step === 2 && (
                <div className="flex gap-3">
                  <Button
                    onClick={() => goToStep(1)}
                    variant="outline"
                    className="h-10 text-sm font-semibold rounded-lg"
                    data-testid="button-back-step-2"
                  >
                    <ChevronLeft className="mr-2 h-5 w-5" />
                    {tq("navigation.back")}
                  </Button>
                  <Button
                    onClick={() => goToStep(3)}
                    className="flex-1 h-10 text-sm font-semibold rounded-lg"
                    disabled={!isStep2Valid}
                    data-testid="button-next-step-2"
                  >
                    {tq("navigation.next")}
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              )}

              {step === 3 && (
                <div className="flex gap-3">
                  <Button
                    onClick={() => goToStep(2)}
                    variant="outline"
                    className="h-10 text-sm font-semibold rounded-lg"
                    data-testid="button-back-step-3"
                  >
                    <ChevronLeft className="mr-2 h-5 w-5" />
                    {tq("navigation.back")}
                  </Button>
                  <Button
                    onClick={() => goToStep(4)}
                    className="flex-1 h-10 text-sm font-semibold rounded-lg"
                    disabled={!isStep3Valid}
                    data-testid="button-next-step-3"
                  >
                    {tq("navigation.next")}
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              )}

              {step === 4 && (
                <div className="flex gap-3">
                  <Button
                    onClick={() => goToStep(3)}
                    variant="outline"
                    className="h-10 text-sm font-semibold rounded-lg"
                    data-testid="button-back-step-4"
                  >
                    <ChevronLeft className="mr-2 h-5 w-5" />
                    {tq("navigation.back")}
                  </Button>
                  <Button
                    onClick={() => goToStep(5)}
                    className="flex-1 h-10 text-sm font-semibold rounded-lg"
                    disabled={!isStep4Valid}
                    data-testid="button-next-step-4"
                  >
                    {tq("navigation.next")}
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              )}

              {step === 5 && (
                <div className="flex gap-3">
                  <Button
                    onClick={() => goToStep(4)}
                    variant="outline"
                    className="h-10 text-sm font-semibold rounded-lg"
                    data-testid="button-back-step-5"
                  >
                    <ChevronLeft className="mr-2 h-5 w-5" />
                    {tq("navigation.back")}
                  </Button>
                  <Button
                    onClick={() => goToStep(6)}
                    className="flex-1 h-10 text-sm font-semibold rounded-lg"
                    disabled={!isStep5Valid}
                    data-testid="button-next-step-5"
                  >
                    {tq("navigation.next")}
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              )}

              {step === 6 && (
                <div className="flex gap-3">
                  <Button
                    onClick={() => goToStep(5)}
                    variant="outline"
                    className="h-10 text-sm font-semibold rounded-lg"
                    data-testid="button-back-step-6"
                  >
                    <ChevronLeft className="mr-2 h-5 w-5" />
                    {tq("navigation.back")}
                  </Button>
                  <Button
                    onClick={async () => {
                      setIsSubmitting(true);
                      setSubmitError(false);
                      try {
                        const attribution = getAttributionCompact();
                        const phIds = {
                          phDistinctId: ph?.get_distinct_id?.() ?? null,
                          phSessionId: ph?.get_session_id?.() ?? null,
                        };
                        const res = await fetch("/api/quote", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ...formData, attribution, posthog: phIds }),
                        });
                        if (!res.ok) throw new Error("Submit failed");
                        const result = await res.json();
                        telemetry.trackSubmit(true, { submissionId: result.submissionId });
                        try { ph?.capture("quote_submitted", { form_type: "quote", locale: lang }); } catch { /* noop */ }
                        try { ph?.identify(formData.email, { first_name: formData.firstName, last_name: formData.lastName, locale: lang }); } catch { /* noop */ }

                        // Post to form-submissions for session tracking (non-blocking)
                        fetch("/api/form-submissions", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            sessionToken: telemetry.sessionToken,
                            formType: "quote",
                            locationPath: window.location.pathname,
                            locationParams: window.location.search.slice(1) || null,
                            locationRoute: "quote",
                            locale: lang,
                            userAgent: navigator.userAgent,
                            user: { email: formData.email, firstName: formData.firstName, lastName: formData.lastName, phone: formData.phone },
                            data: formData,
                            status: "success",
                            posthog: phIds,
                          }),
                        }).catch(() => {});

                        const confirmSegment = tq("steps.finalize.fields.confirmation_segment");
                        const seg = confirmSegment.startsWith("[") ? "confirmation" : confirmSegment;
                        const successPath = quoteSlug ? `/${lang}/${quoteSlug}/${seg}` : `/${lang}`;
                        const qs = new URLSearchParams();
                        const name = formData.firstName.trim();
                        if (name) qs.set("firstName", name);
                        if (result.submissionId) qs.set("submissionId", result.submissionId);
                        const qsStr = qs.toString();
                        window.location.href = `${successPath}${qsStr ? `?${qsStr}` : ""}`;
                      } catch (err) {
                        telemetry.trackSubmit(false, { error: String(err) });
                        ph?.capture("quote_form_error", { error_message: String(err) });
                        setSubmitError(true);
                        setIsSubmitting(false);
                      }
                    }}
                    className="flex-1 h-10 text-sm font-semibold rounded-lg"
                    disabled={!isStep6Valid || isSubmitting}
                    data-testid="button-submit"
                  >
                    {isSubmitting
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : tq("steps.finalize.submit")}
                  </Button>
                  {submitError && (
                    <p className="text-xs text-destructive text-center w-full mt-1">
                      {tq("steps.finalize.submitError")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
