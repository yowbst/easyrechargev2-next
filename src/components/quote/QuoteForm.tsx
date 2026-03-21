"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronRight,
  ChevronLeft,
  Home,
  Car,
  Zap,
  User,
  CheckCircle,
  Loader2,
} from "lucide-react";

interface QuoteFormProps {
  lang: string;
  dictionary: Record<string, string>;
}

interface FormData {
  housingType: string;
  solarEquipment: string;
  homeBattery: string;
  neighborhoodEquipment: string;
  electricalBoardType: string;
  parkingSpotLocation: string;
  parkingSpotCount: string;
  ecpStatus: string;
  ecpBrand: string;
  ecpModel: string;
  ecpProvided: string;
  deadline: string;
  vehicleStatus: string;
  vehicleBrand: string;
  vehicleModel: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  streetName: string;
  streetNb: string;
  postalCode: string;
  locality: string;
  canton: string;
  country: string;
  comment: string;
  acceptTerms: boolean;
}

const STEPS = [
  { id: "housing", icon: Home, label: { fr: "Logement", de: "Wohnung" } },
  { id: "parking", icon: Car, label: { fr: "Parking", de: "Parkplatz" } },
  { id: "charger", icon: Zap, label: { fr: "Borne", de: "Ladestation" } },
  { id: "vehicle", icon: Car, label: { fr: "Véhicule", de: "Fahrzeug" } },
  { id: "contact", icon: User, label: { fr: "Coordonnées", de: "Kontakt" } },
  { id: "confirm", icon: CheckCircle, label: { fr: "Confirmation", de: "Bestätigung" } },
];

function RadioOption({
  value,
  selected,
  onSelect,
  label,
}: {
  value: string;
  selected: boolean;
  onSelect: (v: string) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`border rounded-lg p-3 text-sm text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5 text-primary font-medium"
          : "border-border hover:border-primary/50"
      }`}
    >
      {label}
    </button>
  );
}

export function QuoteForm({ lang, dictionary }: QuoteFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const l = lang as "fr" | "de";

  const [form, setForm] = useState<FormData>({
    housingType: "",
    solarEquipment: "",
    homeBattery: "",
    neighborhoodEquipment: "",
    electricalBoardType: "",
    parkingSpotLocation: "",
    parkingSpotCount: "",
    ecpStatus: "",
    ecpBrand: "",
    ecpModel: "",
    ecpProvided: "",
    deadline: "",
    vehicleStatus: "",
    vehicleBrand: "",
    vehicleModel: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    phoneCountry: "CH",
    streetName: "",
    streetNb: "",
    postalCode: "",
    locality: "",
    canton: "",
    country: "CH",
    comment: "",
    acceptTerms: false,
  });

  const set = (field: keyof FormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const title = dictionary["pages.quote.blocks.hero.title"] ||
    (l === "de" ? "Offerteanfrage" : "Demande de devis");

  const next = () => setStep((s) => Math.min(s + 1, 5));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!form.acceptTerms || !form.firstName || !form.lastName || !form.email) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        const successPath = l === "de"
          ? `/${lang}/offertenanfrage/bestaetigung`
          : `/${lang}/demande-devis/confirmation`;
        router.push(successPath);
      } else {
        setError(result.message || "Error");
      }
    } catch {
      setError(l === "de" ? "Netzwerkfehler" : "Erreur réseau");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="font-heading text-3xl font-bold text-center mb-8">{title}</h1>

      {/* Progress */}
      <div className="flex gap-1 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`flex-1 h-1.5 rounded-full transition-colors ${
              i <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <Card className="p-6 md:p-8">
        <div className="flex items-center gap-2 mb-6">
          {(() => { const Icon = STEPS[step].icon; return <Icon className="h-5 w-5 text-primary" />; })()}
          <h2 className="font-semibold text-lg">
            {STEPS[step].label[l] || STEPS[step].label.fr}
          </h2>
          <span className="text-sm text-muted-foreground ml-auto">{step + 1}/6</span>
        </div>

        {/* Step 1: Housing */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">{l === "de" ? "Gebäudetyp" : "Type de logement"}</Label>
              <div className="grid grid-cols-3 gap-2">
                <RadioOption value="house" selected={form.housingType === "house"} onSelect={(v) => set("housingType", v)} label={l === "de" ? "Haus" : "Maison"} />
                <RadioOption value="apartment" selected={form.housingType === "apartment"} onSelect={(v) => set("housingType", v)} label={l === "de" ? "Wohnung" : "Appartement"} />
                <RadioOption value="other" selected={form.housingType === "other"} onSelect={(v) => set("housingType", v)} label={l === "de" ? "Andere" : "Autre"} />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">{l === "de" ? "Solaranlage" : "Panneaux solaires"}</Label>
              <div className="grid grid-cols-3 gap-2">
                <RadioOption value="yes" selected={form.solarEquipment === "yes"} onSelect={(v) => set("solarEquipment", v)} label={l === "de" ? "Ja" : "Oui"} />
                <RadioOption value="no" selected={form.solarEquipment === "no"} onSelect={(v) => set("solarEquipment", v)} label={l === "de" ? "Nein" : "Non"} />
                <RadioOption value="unknown" selected={form.solarEquipment === "unknown"} onSelect={(v) => set("solarEquipment", v)} label={l === "de" ? "Weiss nicht" : "Je ne sais pas"} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Parking */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">{l === "de" ? "Standort des Parkplatzes" : "Emplacement du parking"}</Label>
              <div className="grid grid-cols-2 gap-2">
                <RadioOption value="garage" selected={form.parkingSpotLocation === "garage"} onSelect={(v) => set("parkingSpotLocation", v)} label="Garage" />
                <RadioOption value="outdoor" selected={form.parkingSpotLocation === "outdoor"} onSelect={(v) => set("parkingSpotLocation", v)} label={l === "de" ? "Draussen" : "Extérieur"} />
                <RadioOption value="underground" selected={form.parkingSpotLocation === "underground"} onSelect={(v) => set("parkingSpotLocation", v)} label={l === "de" ? "Tiefgarage" : "Souterrain"} />
                <RadioOption value="carport" selected={form.parkingSpotLocation === "carport"} onSelect={(v) => set("parkingSpotLocation", v)} label="Carport" />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">{l === "de" ? "Anzahl Parkplätze" : "Nombre de places"}</Label>
              <div className="grid grid-cols-3 gap-2">
                <RadioOption value="1" selected={form.parkingSpotCount === "1"} onSelect={(v) => set("parkingSpotCount", v)} label="1" />
                <RadioOption value="2" selected={form.parkingSpotCount === "2"} onSelect={(v) => set("parkingSpotCount", v)} label="2" />
                <RadioOption value="3+" selected={form.parkingSpotCount === "3+"} onSelect={(v) => set("parkingSpotCount", v)} label="3+" />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Charging station */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">{l === "de" ? "Haben Sie schon eine Ladestation gewählt?" : "Avez-vous déjà choisi une borne ?"}</Label>
              <div className="grid grid-cols-2 gap-2">
                <RadioOption value="get-advice" selected={form.ecpStatus === "get-advice"} onSelect={(v) => set("ecpStatus", v)} label={l === "de" ? "Ich möchte Beratung" : "Je souhaite être conseillé"} />
                <RadioOption value="choice-done" selected={form.ecpStatus === "choice-done"} onSelect={(v) => set("ecpStatus", v)} label={l === "de" ? "Ja, bereits gewählt" : "Oui, choix fait"} />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">{l === "de" ? "Frist" : "Délai souhaité"}</Label>
              <div className="grid grid-cols-2 gap-2">
                <RadioOption value="asap" selected={form.deadline === "asap"} onSelect={(v) => set("deadline", v)} label={l === "de" ? "So schnell wie möglich" : "Dès que possible"} />
                <RadioOption value="1-2mo" selected={form.deadline === "1-2mo"} onSelect={(v) => set("deadline", v)} label={l === "de" ? "1-2 Monate" : "1-2 mois"} />
                <RadioOption value="3-6mo" selected={form.deadline === "3-6mo"} onSelect={(v) => set("deadline", v)} label={l === "de" ? "3-6 Monate" : "3-6 mois"} />
                <RadioOption value="6+mo" selected={form.deadline === "6+mo"} onSelect={(v) => set("deadline", v)} label={l === "de" ? "6+ Monate" : "6+ mois"} />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Vehicle */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">{l === "de" ? "Fahrzeugstatus" : "Statut du véhicule"}</Label>
              <div className="grid grid-cols-2 gap-2">
                <RadioOption value="own" selected={form.vehicleStatus === "own"} onSelect={(v) => set("vehicleStatus", v)} label={l === "de" ? "Ich besitze eines" : "J'en possède un"} />
                <RadioOption value="ordered" selected={form.vehicleStatus === "ordered"} onSelect={(v) => set("vehicleStatus", v)} label={l === "de" ? "Bestellt" : "Commandé"} />
                <RadioOption value="want-to-order" selected={form.vehicleStatus === "want-to-order"} onSelect={(v) => set("vehicleStatus", v)} label={l === "de" ? "Möchte bestellen" : "Je souhaite commander"} />
                <RadioOption value="unknown" selected={form.vehicleStatus === "unknown"} onSelect={(v) => set("vehicleStatus", v)} label={l === "de" ? "Weiss nicht" : "Je ne sais pas"} />
              </div>
            </div>
            {(form.vehicleStatus === "own" || form.vehicleStatus === "ordered") && (
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
            )}
          </div>
        )}

        {/* Step 5: Contact details */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{l === "de" ? "Vorname" : "Prénom"} *</Label>
                <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{l === "de" ? "Nachname" : "Nom"} *</Label>
                <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{l === "de" ? "Telefon" : "Téléphone"} *</Label>
                <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>{l === "de" ? "Strasse" : "Rue"} *</Label>
                <Input value={form.streetName} onChange={(e) => set("streetName", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>N°</Label>
                <Input value={form.streetNb} onChange={(e) => set("streetNb", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{l === "de" ? "PLZ" : "NPA"} *</Label>
                <Input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} required />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>{l === "de" ? "Ort" : "Localité"} *</Label>
                <Input value={form.locality} onChange={(e) => set("locality", e.target.value)} required />
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Confirmation */}
        {step === 5 && (
          <div className="space-y-4">
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
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <Button variant="outline" onClick={prev}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {l === "de" ? "Zurück" : "Retour"}
            </Button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <Button onClick={next}>
              {l === "de" ? "Weiter" : "Suivant"}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!form.acceptTerms || !form.firstName || !form.email || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {l === "de" ? "Senden..." : "Envoi..."}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {l === "de" ? "Offerte anfragen" : "Envoyer ma demande"}
                </>
              )}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
