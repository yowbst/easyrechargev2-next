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
import {
  ChevronRight,
  ChevronLeft,
  Home,
  Building2,
  Warehouse,
  Car,
  Sun,
  BatteryCharging,
  Zap,
  HelpCircle,
  Key,
  Package,
  Clock,
  User,
  Users,
  MapPin,
  Plug,
  Cable,
  Mail,
  Phone as PhoneIcon,
  Gauge,
  CheckCircle,
  Loader2,
  Navigation,
} from "lucide-react";
import type { CountryCode } from "libphonenumber-js";

interface QuoteFormProps {
  lang: string;
  dictionary: Record<string, string>;
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
      const t = setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 150);
      return () => clearTimeout(t);
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

export function QuoteForm({ lang, dictionary }: QuoteFormProps) {
  const router = useRouter();
  const l = lang as "fr" | "de";
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const tq = (key: string) => {
    const v = dictionary[`pages.quote.${key}`];
    return v && !v.startsWith("[") ? v : undefined;
  };

  const [form, setForm] = useState<FormData>({
    housingStatus: "",
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
    streetName: "",
    streetNb: "",
    postalCode: "",
    locality: "",
    canton: "",
    country: "CH",
    comment: "",
    acceptTerms: false,
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
      if (c.types.includes("administrative_area_level_1")) {
        canton = getCantonCode(c.long_name) || c.short_name;
      }
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
  const isStep5Valid =
    form.firstName.trim() && form.lastName.trim() && isEmailValid && isPhoneValid &&
    form.postalCode && form.locality;
  const isStep6Valid = form.acceptTerms;

  const canProceed = [false, isStep1Valid, isStep2Valid, isStep3Valid, isStep4Valid, isStep5Valid, isStep6Valid][step];

  const goToStep = (nextStep: number) => {
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    if (!form.acceptTerms) return;
    setIsSubmitting(true);
    setSubmitError(false);

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        router.push(
          l === "de" ? `/${lang}/offertenanfrage/bestaetigung` : `/${lang}/demande-devis/confirmation`,
        );
      } else {
        setSubmitError(true);
      }
    } catch {
      setSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = tq("blocks.hero.title") || (l === "de" ? "Offerteanfrage" : "Demande de devis");
  const subtitle = tq("blocks.hero.subtitle") || (l === "de"
    ? "Erhalten Sie in wenigen Minuten ein Angebot für Ihre Ladestation."
    : "Recevez en quelques minutes un devis pour votre borne de recharge.");

  // Welcome step (step 0)
  if (step === 0) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center space-y-8">
        <h1 className="font-heading text-4xl md:text-5xl font-bold">{title}</h1>
        <p className="text-lg text-muted-foreground max-w-lg mx-auto">{subtitle}</p>
        <Button onClick={() => goToStep(1)} size="lg" className="px-8">
          {l === "de" ? "Jetzt starten" : "Commencer"}
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    );
  }

  return (
    <APIProvider apiKey={googleMapsApiKey} libraries={["places"]}>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <ProgressBar
          currentStep={step}
          totalSteps={6}
          onStepClick={(s) => s < step && goToStep(s)}
          className="mb-8"
        />

        <Card className="p-6 md:p-8">
          {/* Step 1: Housing */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <Home className="h-5 w-5 text-primary" />
                {l === "de" ? "Ihr Zuhause" : "Votre logement"}
              </h2>

              <div>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                  {l === "de" ? "Ihr Status" : "Votre statut"}
                </Label>
                <IconButtonGroup
                  options={[
                    { value: "owner", label: l === "de" ? "Eigentümer" : "Propriétaire", icon: Key },
                    { value: "co-owner", label: l === "de" ? "Miteigentümer" : "Copropriétaire", icon: Users },
                    { value: "tenant", label: l === "de" ? "Mieter" : "Locataire", icon: User },
                  ]}
                  value={form.housingStatus}
                  onChange={(v) => set("housingStatus", v)}
                />
              </div>

              <RevealField visible={!!form.housingStatus}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                  {l === "de" ? "Gebäudetyp" : "Type de logement"}
                </Label>
                <IconButtonGroup
                  options={[
                    { value: "house", label: l === "de" ? "Haus" : "Maison", icon: Home },
                    { value: "apartment", label: l === "de" ? "Wohnung" : "Appartement", icon: Building2 },
                    { value: "other", label: l === "de" ? "Andere" : "Autre", icon: Warehouse },
                  ]}
                  value={form.housingType}
                  onChange={(v) => set("housingType", v)}
                />
              </RevealField>

              <RevealField visible={!!form.housingType}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                  {l === "de" ? "Solaranlage" : "Panneaux solaires"}
                </Label>
                <IconButtonGroup
                  options={[
                    { value: "yes", label: l === "de" ? "Ja" : "Oui", icon: Sun },
                    { value: "no", label: l === "de" ? "Nein" : "Non", icon: HelpCircle },
                    { value: "unknown", label: l === "de" ? "Weiss nicht" : "Je ne sais pas", icon: HelpCircle },
                  ]}
                  value={form.solarEquipment}
                  onChange={(v) => set("solarEquipment", v)}
                />
              </RevealField>

              <RevealField visible={form.solarEquipment === "yes"}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                  {l === "de" ? "Hausbatterie" : "Batterie domestique"}
                </Label>
                <IconButtonGroup
                  options={[
                    { value: "yes", label: l === "de" ? "Ja" : "Oui", icon: BatteryCharging },
                    { value: "no", label: l === "de" ? "Nein" : "Non", icon: HelpCircle },
                    { value: "unknown", label: l === "de" ? "Weiss nicht" : "Je ne sais pas", icon: HelpCircle },
                  ]}
                  value={form.homeBattery}
                  onChange={(v) => set("homeBattery", v)}
                />
              </RevealField>

              <RevealField visible={!!form.solarEquipment}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                  {l === "de" ? "Elektrische Anlage" : "Tableau électrique"}
                </Label>
                <IconButtonGroup
                  options={[
                    { value: "easy", label: l === "de" ? "Einfach" : "Facile", icon: Zap },
                    { value: "medium", label: l === "de" ? "Mittel" : "Moyen", icon: Zap },
                    { value: "difficult", label: l === "de" ? "Schwierig" : "Difficile", icon: Zap },
                    { value: "unknown", label: l === "de" ? "Weiss nicht" : "Je ne sais pas", icon: HelpCircle },
                  ]}
                  value={form.electricalBoardType}
                  onChange={(v) => set("electricalBoardType", v)}
                />
              </RevealField>
            </div>
          )}

          {/* Step 2: Parking */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <Car className="h-5 w-5 text-primary" />
                {l === "de" ? "Ihr Parkplatz" : "Votre place de parc"}
              </h2>

              <div>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                  {l === "de" ? "Standort" : "Emplacement"}
                </Label>
                <IconButtonGroup
                  options={[
                    { value: "garage-adjacent", label: l === "de" ? "Garage (anliegend)" : "Garage (attenant)", icon: Home },
                    { value: "garage-standalone", label: l === "de" ? "Garage (freistehend)" : "Garage (séparé)", icon: Warehouse },
                    { value: "exterior-adjacent", label: l === "de" ? "Draussen (anliegend)" : "Extérieur (attenant)", icon: MapPin },
                    { value: "exterior-standalone", label: l === "de" ? "Draussen (freistehend)" : "Extérieur (séparé)", icon: MapPin },
                    { value: "covered-adjacent", label: l === "de" ? "Carport (anliegend)" : "Couvert (attenant)", icon: Home },
                    { value: "underground", label: l === "de" ? "Tiefgarage" : "Souterrain", icon: Building2 },
                  ]}
                  value={form.parkingSpotLocation}
                  onChange={(v) => set("parkingSpotLocation", v)}
                />
              </div>

              <RevealField visible={!!form.parkingSpotLocation}>
                <SliderWithCheckbox
                  value={form.electricalLineDistance}
                  onChange={(v) => set("electricalLineDistance", v)}
                  min={5}
                  max={50}
                  step={5}
                  label={l === "de" ? "Entfernung zum Zähler" : "Distance au compteur"}
                  unit="m"
                  checkboxLabel={l === "de" ? "Weiss ich nicht" : "Je ne sais pas"}
                  icon={Cable}
                />
              </RevealField>

              <RevealField visible={form.electricalLineDistance !== null}>
                <SliderWithCheckbox
                  value={form.electricalLineHoleCount}
                  onChange={(v) => set("electricalLineHoleCount", v)}
                  min={0}
                  max={5}
                  label={l === "de" ? "Wanddurchbrüche" : "Passages de murs"}
                  checkboxLabel={l === "de" ? "Weiss ich nicht" : "Je ne sais pas"}
                  icon={Plug}
                />
              </RevealField>
            </div>
          )}

          {/* Step 3: Charger */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                {l === "de" ? "Ihre Ladestation" : "Votre borne de recharge"}
              </h2>

              <div>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                  {l === "de" ? "Anzahl Ladepunkte" : "Nombre de points de charge"}
                </Label>
                <IconButtonGroup
                  options={[
                    { value: "1", label: "1", icon: Plug },
                    { value: "2", label: "2", icon: Plug },
                    { value: "3+", label: "3+", icon: Plug },
                  ]}
                  value={form.parkingSpotCount}
                  onChange={(v) => set("parkingSpotCount", v)}
                />
              </div>

              <RevealField visible={!!form.parkingSpotCount}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                  {l === "de" ? "Borne im Angebot?" : "Borne incluse dans l'offre ?"}
                </Label>
                <IconButtonGroup
                  options={[
                    { value: "include", label: l === "de" ? "Ja, einschliessen" : "Oui, inclure", icon: Package },
                    { value: "exclude", label: l === "de" ? "Nein, nur Installation" : "Non, installation seule", icon: Zap },
                  ]}
                  value={form.ecpProvided}
                  onChange={(v) => set("ecpProvided", v)}
                />
              </RevealField>

              <RevealField visible={!!form.ecpProvided}>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                  {l === "de" ? "Gewünschter Zeitraum" : "Délai souhaité"}
                </Label>
                <IconButtonGroup
                  options={[
                    { value: "asap", label: l === "de" ? "ASAP" : "Dès que possible", icon: Clock },
                    { value: "1-2mo", label: "1-2 mois", icon: Clock },
                    { value: "3-6mo", label: "3-6 mois", icon: Clock },
                    { value: "6+mo", label: "6+ mois", icon: Clock },
                  ]}
                  value={form.deadline}
                  onChange={(v) => set("deadline", v)}
                />
              </RevealField>
            </div>
          )}

          {/* Step 4: Vehicle */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <Car className="h-5 w-5 text-primary" />
                {l === "de" ? "Ihr Elektrofahrzeug" : "Votre véhicule électrique"}
              </h2>

              <div>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                  {l === "de" ? "Status" : "Statut"}
                </Label>
                <IconButtonGroup
                  options={[
                    { value: "own", label: l === "de" ? "Besitze eines" : "J'en possède un", icon: Car },
                    { value: "ordered", label: l === "de" ? "Bestellt" : "Commandé", icon: Package },
                    { value: "want-to-order", label: l === "de" ? "Möchte bestellen" : "Je souhaite commander", icon: Navigation },
                    { value: "unknown", label: l === "de" ? "Weiss nicht" : "Je ne sais pas", icon: HelpCircle },
                  ]}
                  value={form.vehicleStatus}
                  onChange={(v) => set("vehicleStatus", v)}
                />
              </div>

              <RevealField visible={form.vehicleStatus === "own" || form.vehicleStatus === "ordered"}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{l === "de" ? "Marke" : "Marque"}</Label>
                    <Input value={form.vehicleBrand} onChange={(e) => set("vehicleBrand", e.target.value)} placeholder="Tesla, BMW, ..." />
                  </div>
                  <div className="space-y-2">
                    <Label>{l === "de" ? "Modell" : "Modèle"}</Label>
                    <Input value={form.vehicleModel} onChange={(e) => set("vehicleModel", e.target.value)} placeholder="Model 3, iX3, ..." />
                  </div>
                </div>
              </RevealField>

              <RevealField visible={!!form.vehicleStatus}>
                <SliderWithCheckbox
                  value={form.vehicleTripDistance}
                  onChange={(v) => set("vehicleTripDistance", v)}
                  min={5}
                  max={180}
                  step={5}
                  label={l === "de" ? "Tägliche Strecke" : "Distance quotidienne"}
                  unit=" km"
                  checkboxLabel={l === "de" ? "Weiss ich nicht" : "Je ne sais pas"}
                  icon={Gauge}
                />
              </RevealField>

              <RevealField visible={form.vehicleTripDistance !== null}>
                <SliderWithCheckbox
                  value={form.vehicleChargingHours}
                  onChange={(v) => set("vehicleChargingHours", v)}
                  min={5}
                  max={10}
                  label={l === "de" ? "Ladezeit (Stunden zu Hause)" : "Heures de charge à domicile"}
                  unit="h"
                  checkboxLabel={l === "de" ? "Weiss ich nicht" : "Je ne sais pas"}
                  icon={Clock}
                />
              </RevealField>
            </div>
          )}

          {/* Step 5: Contact details */}
          {step === 5 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                {l === "de" ? "Ihre Kontaktdaten" : "Vos coordonnées"}
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label><User className="inline h-3.5 w-3.5 mr-1" />{l === "de" ? "Vorname" : "Prénom"} *</Label>
                  <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label><Users className="inline h-3.5 w-3.5 mr-1" />{l === "de" ? "Nachname" : "Nom"} *</Label>
                  <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label><Mail className="inline h-3.5 w-3.5 mr-1" />Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label><PhoneIcon className="inline h-3.5 w-3.5 mr-1" />{l === "de" ? "Telefon" : "Téléphone"} *</Label>
                <div className="flex gap-2">
                  <select
                    value={form.phoneCountry}
                    onChange={(e) => set("phoneCountry", e.target.value)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {countryFlag(c.code)} {c.dialCode}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    className="flex-1"
                  />
                </div>
                {form.phone && !isPhoneValid && (
                  <p className="text-xs text-destructive">{l === "de" ? "Ungültige Telefonnummer" : "Numéro de téléphone invalide"}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label><MapPin className="inline h-3.5 w-3.5 mr-1" />{l === "de" ? "Adresse" : "Adresse"} *</Label>
                {form.addressMode === "google" && googleMapsApiKey ? (
                  <>
                    <PlaceAutocomplete
                      value={form.address}
                      onChange={(v) => set("address", v)}
                      onPlaceSelect={handlePlaceSelect}
                      placeholder={l === "de" ? "Strasse, PLZ Ort" : "Rue, NPA Localité"}
                    />
                    <button
                      type="button"
                      onClick={() => set("addressMode", "manual")}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      {l === "de" ? "Adresse manuell eingeben" : "Saisir l'adresse manuellement"}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <Input className="col-span-2" placeholder={l === "de" ? "Strasse" : "Rue"} value={form.streetName} onChange={(e) => set("streetName", e.target.value)} />
                      <Input placeholder="N°" value={form.streetNb} onChange={(e) => set("streetNb", e.target.value)} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input placeholder={l === "de" ? "PLZ" : "NPA"} value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
                      <Input className="col-span-2" placeholder={l === "de" ? "Ort" : "Localité"} value={form.locality} onChange={(e) => set("locality", e.target.value)} />
                    </div>
                    {googleMapsApiKey && (
                      <button
                        type="button"
                        onClick={() => set("addressMode", "google")}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        {l === "de" ? "Google-Suche verwenden" : "Utiliser la recherche Google"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 6: Confirmation */}
          {step === 6 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                {l === "de" ? "Bestätigung" : "Confirmation"}
              </h2>

              <div className="space-y-2">
                <Label>{l === "de" ? "Kommentar (optional)" : "Commentaire (optionnel)"}</Label>
                <Textarea rows={4} value={form.comment} onChange={(e) => set("comment", e.target.value)} />
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="terms"
                  checked={form.acceptTerms}
                  onCheckedChange={(v) => set("acceptTerms", v === true)}
                />
                <Label htmlFor="terms" className="text-sm leading-relaxed">
                  {l === "de"
                    ? "Ich akzeptiere die allgemeinen Geschäftsbedingungen und die Datenschutzrichtlinie."
                    : "J'accepte les conditions générales et la politique de confidentialité."}
                </Label>
              </div>

              {submitError && (
                <p className="text-sm text-destructive">
                  {l === "de" ? "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut." : "Une erreur est survenue. Veuillez réessayer."}
                </p>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button variant="outline" onClick={() => goToStep(step - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {l === "de" ? "Zurück" : "Retour"}
            </Button>

            {step < 6 ? (
              <Button onClick={() => goToStep(step + 1)} disabled={!canProceed}>
                {l === "de" ? "Weiter" : "Suivant"}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!isStep6Valid || isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />{l === "de" ? "Senden..." : "Envoi..."}</>
                ) : (
                  <><CheckCircle className="h-4 w-4 mr-2" />{l === "de" ? "Offerte anfragen" : "Envoyer ma demande"}</>
                )}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </APIProvider>
  );
}
