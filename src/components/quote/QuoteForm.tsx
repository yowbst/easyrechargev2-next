"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "./ProgressBar";
import { IconButtonGroup, type IconButtonOption } from "./IconButtonGroup";
import { SliderWithCheckbox } from "./SliderWithCheckbox";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import { SUPPORTED_COUNTRIES, validatePhone } from "@/lib/phone-utils";
import { getCantonCode } from "@shared/swiss-cantons";
import { APIProvider } from "@vis.gl/react-google-maps";
import { t } from "@/lib/i18n/dictionaries";
import {
  ChevronRight, ChevronLeft, Home, Building2, Warehouse, Car, Sun,
  BatteryCharging, Zap, HelpCircle, Key, Package, Clock, User, Users,
  MapPin, Plug, Cable, Mail, Phone as PhoneIcon, Gauge, CheckCircle, Loader2, Navigation,
} from "lucide-react";
import type { CountryCode } from "libphonenumber-js";

interface QuoteFormProps {
  lang: string;
  dictionary: Record<string, string>;
  quoteSlug?: string;
}

interface FormData {
  housingStatus: string;
  housingType: string;
  solarEquipment: string;
  homeBattery: string;
  neighborhoodEquipment: string;
  electricalBoardType: string;
  parkingSpotLocation: string;
  electricalLineDistance: number | "na" | null;
  electricalLineHoleCount: number | "na" | null;
  parkingSpotCount: string;
  ecpStatus: string;
  ecpBrand: string;
  ecpModel: string;
  ecpProvided: string;
  deadline: string;
  vehicleStatus: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleTripDistance: number | "na" | null;
  vehicleChargingHours: number | "na" | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  addressMode: "google" | "manual";
  address: string;
  streetName: string;
  streetNb: string;
  postalCode: string;
  locality: string;
  canton: string;
  country: string;
  approval: string;
  comment: string;
  acceptTerms: boolean;
}

/** Progressive-reveal wrapper with slide-down animation. */
function RevealField({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hasBeenVisible = useRef(false);

  useEffect(() => {
    if (visible && !hasBeenVisible.current) {
      hasBeenVisible.current = true;
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

// ── Shorthand helpers ────────────────────────────────────

const STEP_PREFIX = "pages.quote.steps";
const ICON_MAP: Record<string, typeof Home> = {
  owner: Key, "co-owner": Users, tenant: User,
  house: Home, apartment: Building2, other: Warehouse,
  exists: Sun, "in-progress": Sun, none: HelpCircle,
  yes: BatteryCharging, no: HelpCircle, unknown: HelpCircle,
  old: Zap, recent: Zap, na: HelpCircle,
  "garage-adjacent": Home, "garage-standalone": Warehouse,
  "exterior-adjacent": MapPin, "exterior-standalone": MapPin,
  "covered-adjacent": Home, "covered-standalone": Warehouse,
  underground: Building2,
  "1": Plug, "2": Plug, "3plus": Plug,
  "get-advice": HelpCircle,
  include: Package, exclude: Zap,
  asap: Clock, "2-3mo": Clock, "3-6mo": Clock, "6+mo": Clock,
  own: Car, ordered: Package, "want-to-order": Navigation,
};

function optionIcon(value: string) {
  return ICON_MAP[value] || HelpCircle;
}

export function QuoteForm({ lang, dictionary, quoteSlug }: QuoteFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  /** Resolve a key from the flattened page dictionary. */
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);

  /** Step field label */
  const fl = (stepId: string, field: string) => d(`${STEP_PREFIX}.${stepId}.fields.${field}.label`);

  /** Step field option */
  const fo = (stepId: string, field: string, option: string) =>
    d(`${STEP_PREFIX}.${stepId}.fields.${field}.options.${option}`);

  /** Step field tooltip */
  const ft = (stepId: string, field: string) => {
    const v = d(`${STEP_PREFIX}.${stepId}.fields.${field}.tooltip`);
    return v.startsWith("[") ? undefined : v;
  };

  /** Step field checkbox / na label */
  const fc = (stepId: string, field: string) => {
    const v = d(`${STEP_PREFIX}.${stepId}.fields.${field}.checkboxLabel`);
    return v.startsWith("[") ? d(`${STEP_PREFIX}.${stepId}.fields.${field}.na`) : v;
  };

  /** Build IconButtonOption[] from a set of option keys */
  const opts = (stepId: string, field: string, keys: string[]): IconButtonOption[] =>
    keys.map((k) => ({ value: k, label: fo(stepId, field, k), icon: optionIcon(k) }));

  const [form, setForm] = useState<FormData>({
    housingStatus: "", housingType: "", solarEquipment: "", homeBattery: "",
    neighborhoodEquipment: "", electricalBoardType: "",
    parkingSpotLocation: "", electricalLineDistance: null, electricalLineHoleCount: null,
    parkingSpotCount: "", ecpStatus: "get-advice", ecpBrand: "", ecpModel: "",
    ecpProvided: "", deadline: "",
    vehicleStatus: "", vehicleBrand: "", vehicleModel: "",
    vehicleTripDistance: null, vehicleChargingHours: null,
    firstName: "", lastName: "", email: "", phone: "", phoneCountry: "CH",
    addressMode: "google", address: "", streetName: "", streetNb: "",
    postalCode: "", locality: "", canton: "", country: "CH",
    approval: "", comment: "", acceptTerms: false,
  });

  const set = (field: keyof FormData, value: string | number | boolean | "na" | null) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    if (!place.address_components) return;
    let streetNb = "", streetName = "", postal = "", locality = "", canton = "", country = "";
    for (const c of place.address_components) {
      if (c.types.includes("street_number")) streetNb = c.long_name;
      if (c.types.includes("route")) streetName = c.long_name;
      if (c.types.includes("postal_code")) postal = c.long_name;
      if (c.types.includes("locality")) locality = c.long_name;
      if (c.types.includes("administrative_area_level_1")) canton = getCantonCode(c.long_name) || c.short_name;
      if (c.types.includes("country")) country = c.short_name;
    }
    setForm((prev) => ({ ...prev, streetName, streetNb, postalCode: postal, locality, canton, country }));
  };

  const countryFlag = (code: string) =>
    Array.from(code.toUpperCase()).map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))).join("");

  // Validation
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const isPhoneValid = form.phone ? validatePhone(form.phone, form.phoneCountry as CountryCode) : false;
  const isStep1Valid = form.housingType && form.solarEquipment && form.electricalBoardType;
  const isStep2Valid = form.parkingSpotLocation && form.electricalLineDistance !== null && form.electricalLineHoleCount !== null;
  const isStep3Valid = form.parkingSpotCount && form.ecpProvided && form.deadline;
  const isStep4Valid = form.vehicleStatus && form.vehicleTripDistance !== null && form.vehicleChargingHours !== null;
  const isStep5Valid = form.firstName.trim() && form.lastName.trim() && isEmailValid && isPhoneValid && form.postalCode && form.locality;
  const isStep6Valid = form.acceptTerms;
  const canProceed = [false, isStep1Valid, isStep2Valid, isStep3Valid, isStep4Valid, isStep5Valid, isStep6Valid][step];

  const goToStep = (n: number) => { setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const handleSubmit = async () => {
    if (!form.acceptTerms) return;
    setIsSubmitting(true);
    setSubmitError(false);
    try {
      const res = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await res.json();
      if (res.ok && result.success) {
        const confirmSegment = d("pages.quote.steps.finalize.fields.confirmation_segment");
        const seg = confirmSegment.startsWith("[") ? "confirmation" : confirmSegment;
        router.push(quoteSlug ? `/${lang}/${quoteSlug}/${seg}` : `/${lang}`);
      } else {
        setSubmitError(true);
      }
    } catch { setSubmitError(true); }
    finally { setIsSubmitting(false); }
  };

  // Welcome step
  if (step === 0) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center space-y-8">
        <h1 className="font-heading text-4xl md:text-5xl font-bold">
          {d("pages.quote.welcome.title")}
        </h1>
        <p className="text-lg text-muted-foreground max-w-lg mx-auto">
          {d("pages.quote.welcome.subtitle")}
        </p>
        <Button onClick={() => goToStep(1)} size="lg" className="px-8">
          {d("pages.quote.welcome.cta")}
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    );
  }

  return (
    <APIProvider apiKey={googleMapsApiKey} libraries={["places"]}>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <ProgressBar currentStep={step} totalSteps={6} onStepClick={(s) => s < step && goToStep(s)} className="mb-8" />

        <Card className="p-6 md:p-8">
          {/* ── Step 1: Housing ── */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <Home className="h-5 w-5 text-primary" />
                {d(`${STEP_PREFIX}.housing.title`)}
              </h2>
              <div>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("housing", "housingStatus")}</Label>
                <IconButtonGroup options={opts("housing", "housingStatus", ["owner", "co-owner", "tenant"])} value={form.housingStatus} onChange={(v) => set("housingStatus", v)} />
              </div>
              <RevealField visible={!!form.housingStatus}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("housing", "housingType")}</Label>
                <IconButtonGroup options={opts("housing", "housingType", ["house", "apartment", "other"])} value={form.housingType} onChange={(v) => set("housingType", v)} />
              </RevealField>
              <RevealField visible={!!form.housingType}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("housing", "solarEquipment")}</Label>
                <IconButtonGroup options={opts("housing", "solarEquipment", ["exists", "in-progress", "none"])} value={form.solarEquipment} onChange={(v) => set("solarEquipment", v)} />
              </RevealField>
              <RevealField visible={form.solarEquipment === "exists" || form.solarEquipment === "in-progress"}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("housing", "homeBattery")}</Label>
                <IconButtonGroup options={opts("housing", "homeBattery", ["exists", "in-progress", "none"])} value={form.homeBattery} onChange={(v) => set("homeBattery", v)} />
              </RevealField>
              <RevealField visible={!!form.solarEquipment}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("housing", "electricalBoardType")}</Label>
                <IconButtonGroup options={opts("housing", "electricalBoardType", ["old", "recent", "na"])} value={form.electricalBoardType} onChange={(v) => set("electricalBoardType", v)} />
              </RevealField>
              <RevealField visible={
                (form.housingStatus === "co-owner" && ["apartment", "house"].includes(form.housingType)) ||
                (form.housingStatus === "tenant" && form.housingType === "apartment")
              }>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("housing", "neighborhoodEquipment")}</Label>
                <IconButtonGroup options={opts("housing", "neighborhoodEquipment", ["exists", "in-progress", "none"])} value={form.neighborhoodEquipment} onChange={(v) => set("neighborhoodEquipment", v)} />
              </RevealField>
            </div>
          )}

          {/* ── Step 2: Parking ── */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <Car className="h-5 w-5 text-primary" />
                {d(`${STEP_PREFIX}.parking.title`)}
              </h2>
              <div>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("parking", "parkingSpotLocation")}</Label>
                <IconButtonGroup options={opts("parking", "parkingSpotLocation", ["garage-adjacent", "garage-standalone", "exterior-adjacent", "exterior-standalone", "covered-adjacent", "underground"])} value={form.parkingSpotLocation} onChange={(v) => set("parkingSpotLocation", v)} />
              </div>
              <RevealField visible={!!form.parkingSpotLocation}>
                <SliderWithCheckbox value={form.electricalLineDistance} onChange={(v) => set("electricalLineDistance", v)} min={5} max={50} step={5} label={fl("parking", "electricalLineDistance")} unit={d(`${STEP_PREFIX}.parking.fields.electricalLineDistance.unit`)} checkboxLabel={fc("parking", "electricalLineDistance")} icon={Cable} />
              </RevealField>
              <RevealField visible={form.electricalLineDistance !== null}>
                <SliderWithCheckbox value={form.electricalLineHoleCount} onChange={(v) => set("electricalLineHoleCount", v)} min={0} max={5} label={fl("parking", "electricalLineHoleCount")} unit={d(`${STEP_PREFIX}.parking.fields.electricalLineHoleCount.unit`)} checkboxLabel={fc("parking", "electricalLineHoleCount")} icon={Plug} />
              </RevealField>
            </div>
          )}

          {/* ── Step 3: Charger ── */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                {d(`${STEP_PREFIX}.charger.title`)}
              </h2>
              <div>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("charger", "parkingSpotCount")}</Label>
                <IconButtonGroup options={opts("charger", "parkingSpotCount", ["1", "2", "3plus"])} value={form.parkingSpotCount} onChange={(v) => set("parkingSpotCount", v)} />
              </div>
              <RevealField visible={!!form.parkingSpotCount}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("charger", "ecpStatus")}</Label>
                <IconButtonGroup options={opts("charger", "ecpStatus", ["get-advice"])} value={form.ecpStatus} onChange={(v) => set("ecpStatus", v)} />
                {ft("charger", "ecpStatus") && (
                  <p className="text-xs text-muted-foreground mt-2">{d(`${STEP_PREFIX}.charger.fields.ecpStatus.note`)}</p>
                )}
              </RevealField>
              <RevealField visible={!!form.ecpStatus}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("charger", "ecpProvided")}</Label>
                <IconButtonGroup options={opts("charger", "ecpProvided", ["include", "exclude"])} value={form.ecpProvided} onChange={(v) => set("ecpProvided", v)} />
              </RevealField>
              <RevealField visible={!!form.ecpProvided}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("charger", "deadline")}</Label>
                <IconButtonGroup options={opts("charger", "deadline", ["asap", "2-3mo", "3-6mo", "6+mo"])} value={form.deadline} onChange={(v) => set("deadline", v)} />
              </RevealField>
            </div>
          )}

          {/* ── Step 4: Vehicle ── */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <Car className="h-5 w-5 text-primary" />
                {d(`${STEP_PREFIX}.vehicle.title`)}
              </h2>
              <div>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">{fl("vehicle", "vehicleStatus")}</Label>
                <IconButtonGroup options={opts("vehicle", "vehicleStatus", ["own", "ordered", "want-to-order", "unknown"])} value={form.vehicleStatus} onChange={(v) => set("vehicleStatus", v)} />
              </div>
              <RevealField visible={form.vehicleStatus === "own" || form.vehicleStatus === "ordered"}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{fl("vehicle", "vehicleBrand")}</Label>
                    <Input value={form.vehicleBrand} onChange={(e) => set("vehicleBrand", e.target.value)} placeholder="Tesla, BMW, ..." />
                  </div>
                  <div className="space-y-2">
                    <Label>{fl("vehicle", "vehicleBrand")}</Label>
                    <Input value={form.vehicleModel} onChange={(e) => set("vehicleModel", e.target.value)} placeholder="Model 3, iX3, ..." />
                  </div>
                </div>
              </RevealField>
              <RevealField visible={!!form.vehicleStatus}>
                <SliderWithCheckbox value={form.vehicleTripDistance} onChange={(v) => set("vehicleTripDistance", v)} min={5} max={180} step={5} label={fl("vehicle", "vehicleTripDistance")} unit={d(`${STEP_PREFIX}.vehicle.fields.vehicleTripDistance.unit`)} checkboxLabel={fc("vehicle", "vehicleTripDistance")} icon={Gauge} />
              </RevealField>
              <RevealField visible={form.vehicleTripDistance !== null}>
                <SliderWithCheckbox value={form.vehicleChargingHours} onChange={(v) => set("vehicleChargingHours", v)} min={5} max={10} label={fl("vehicle", "vehicleChargingHours")} unit={d(`${STEP_PREFIX}.vehicle.fields.vehicleChargingHours.unit`)} checkboxLabel={fc("vehicle", "vehicleChargingHours")} icon={Clock} />
              </RevealField>
            </div>
          )}

          {/* ── Step 5: Contact ── */}
          {step === 5 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                {d(`${STEP_PREFIX}.contact.title`)}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label><User className="inline h-3.5 w-3.5 mr-1" />{fl("contact", "firstName")} *</Label>
                  <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label><Users className="inline h-3.5 w-3.5 mr-1" />{fl("contact", "lastName")} *</Label>
                  <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label><Mail className="inline h-3.5 w-3.5 mr-1" />{fl("contact", "email")} *</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                {form.email && !isEmailValid && <p className="text-xs text-destructive">{d(`${STEP_PREFIX}.contact.fields.email.error`)}</p>}
              </div>
              <div className="space-y-2">
                <Label><PhoneIcon className="inline h-3.5 w-3.5 mr-1" />{fl("contact", "phone")} *</Label>
                <div className="flex gap-2">
                  <select value={form.phoneCountry} onChange={(e) => set("phoneCountry", e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-sm">
                    {SUPPORTED_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{countryFlag(c.code)} {c.dialCode}</option>)}
                  </select>
                  <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="flex-1" />
                </div>
                {form.phone && !isPhoneValid && <p className="text-xs text-destructive">{d(`${STEP_PREFIX}.contact.fields.phone.error`)}</p>}
              </div>
              <div className="space-y-2">
                <Label><MapPin className="inline h-3.5 w-3.5 mr-1" />{fl("contact", "address")} *</Label>
                {form.addressMode === "google" && googleMapsApiKey ? (
                  <>
                    <PlaceAutocomplete value={form.address} onChange={(v) => set("address", v)} onPlaceSelect={handlePlaceSelect} placeholder={d(`${STEP_PREFIX}.contact.fields.address.placeholder`)} />
                    <button type="button" onClick={() => set("addressMode", "manual")} className="text-xs text-muted-foreground hover:text-foreground underline">{d(`${STEP_PREFIX}.contact.fields.address.toggleManual`)}</button>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <Input className="col-span-2" placeholder={d(`${STEP_PREFIX}.contact.fields.address.subfields.streetName`)} value={form.streetName} onChange={(e) => set("streetName", e.target.value)} />
                      <Input placeholder={d(`${STEP_PREFIX}.contact.fields.address.subfields.streetNb`)} value={form.streetNb} onChange={(e) => set("streetNb", e.target.value)} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input placeholder={d(`${STEP_PREFIX}.contact.fields.address.subfields.postalCode`)} value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
                      <Input className="col-span-2" placeholder={d(`${STEP_PREFIX}.contact.fields.address.subfields.locality`)} value={form.locality} onChange={(e) => set("locality", e.target.value)} />
                    </div>
                    {googleMapsApiKey && <button type="button" onClick={() => set("addressMode", "google")} className="text-xs text-muted-foreground hover:text-foreground underline">{d(`${STEP_PREFIX}.contact.fields.address.toggleGoogle`)}</button>}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Step 6: Finalize ── */}
          {step === 6 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                {d(`${STEP_PREFIX}.finalize.title`)}
              </h2>
              {/* Approval field — shown for tenants and co-owners */}
              {(form.housingStatus === "tenant" || form.housingStatus === "co-owner") && (
                <div>
                  <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                    {d(`${STEP_PREFIX}.finalize.fields.approval.${form.housingStatus === "tenant" ? "tenant" : "co-owner"}.label`)}
                  </Label>
                  <IconButtonGroup
                    options={opts("finalize", `approval.${form.housingStatus === "tenant" ? "tenant" : "co-owner"}`, ["yes", "in-progress", "no"])}
                    value={form.approval}
                    onChange={(v) => set("approval", v)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>{d(`${STEP_PREFIX}.finalize.fields.comment.label`)}</Label>
                <Textarea rows={4} value={form.comment} onChange={(e) => set("comment", e.target.value)} placeholder={d(`${STEP_PREFIX}.finalize.fields.comment.placeholder`)} />
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="terms" checked={form.acceptTerms} onCheckedChange={(v) => set("acceptTerms", v === true)} />
                <Label htmlFor="terms" className="text-sm leading-relaxed">{d(`${STEP_PREFIX}.finalize.fields.acceptTerms.label`)}</Label>
              </div>
              {submitError && <p className="text-sm text-destructive">{d("pages.quote.error", { defaultValue: "[pages.quote.error]" })}</p>}
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button variant="outline" onClick={() => goToStep(step - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {d("pages.quote.navigation.back")}
            </Button>
            {step < 6 ? (
              <Button onClick={() => goToStep(step + 1)} disabled={!canProceed}>
                {d("pages.quote.navigation.next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!isStep6Valid || isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />{d("pages.quote.navigation.next")}</>
                ) : (
                  <><CheckCircle className="h-4 w-4 mr-2" />{d(`${STEP_PREFIX}.finalize.submit`)}</>
                )}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </APIProvider>
  );
}
