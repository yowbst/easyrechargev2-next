"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { t } from "@/lib/i18n/dictionaries";
import { Mail, Send, Loader2, User, Users, Building2, Phone as PhoneIcon } from "lucide-react";
import { SUPPORTED_COUNTRIES, validatePhone } from "@/lib/phone-utils";
import { cmsBgImage } from "@/lib/directusAssets";
import { useFormTelemetry } from "@/hooks/use-form-telemetry";
import { getAttributionCompact } from "@/lib/attribution";
import { usePostHog } from "posthog-js/react";
import { PlaceAutocomplete } from "@/components/quote/PlaceAutocomplete";
import { getCantonCode } from "@shared/swiss-cantons";
import { APIProvider } from "@vis.gl/react-google-maps";
import type { CountryCode } from "libphonenumber-js";

interface ContactFormProps {
  lang: string;
  dictionary: Record<string, string>;
  heroImage?: string;
}

const P = "pages.contact";

export function ContactForm({ lang, dictionary, heroImage }: ContactFormProps) {
  const hasHeroImage = !!heroImage;
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);
  const ph = usePostHog();
  const telemetry = useFormTelemetry({ formType: "contact", locale: lang });
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressMode, setAddressMode] = useState<"google" | "manual">(googleMapsApiKey ? "google" : "manual");

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "", phoneCountry: "CH",
    company: "", streetName: "", streetNb: "", postalCode: "", locality: "",
    canton: "", country: "CH", subject: "", message: "",
  });

  const handleChange = (field: string, value: string) => {
    telemetry.trackChange(field, value);
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

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
    setFormData((prev) => ({ ...prev, streetName, streetNb, postalCode: postal, locality, canton, country }));
  };

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
  const isFormValid =
    formData.firstName.trim() && formData.lastName.trim() &&
    formData.email && isEmailValid &&
    formData.subject.trim() && formData.message.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const attribution = getAttributionCompact();
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, attribution }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        telemetry.trackSubmit(true);
        ph?.capture("contact_form_submitted", { locale: lang, subject: formData.subject });
        ph?.identify(formData.email, { first_name: formData.firstName, last_name: formData.lastName, locale: lang });

        // Post to form-submissions (non-blocking)
        fetch("/api/form-submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionToken: telemetry.sessionToken,
            formType: "contact",
            locationPath: window.location.pathname,
            locationRoute: "contact",
            locale: lang,
            userAgent: navigator.userAgent,
            user: { email: formData.email, firstName: formData.firstName, lastName: formData.lastName, phone: formData.phone },
            data: formData,
            status: "success",
          }),
        }).catch(() => {});

        setSubmitted(true);
      } else {
        telemetry.trackSubmit(false, { error: result.message });
        ph?.capture("contact_form_error", { error_message: result.message });
        setError(d(`${P}.toasts.error.description`));
      }
    } catch {
      setError(d(`${P}.toasts.error.description`));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center space-y-4">
        <Mail className="h-12 w-12 text-primary mx-auto" />
        <h2 className="font-heading text-2xl font-bold">{d(`${P}.toasts.success.title`)}</h2>
        <p className="text-muted-foreground">{d(`${P}.toasts.success.description`)}</p>
      </div>
    );
  }

  const countryFlag = (code: string) =>
    Array.from(code.toUpperCase()).map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))).join("");

  const isPhoneValid = !formData.phone || validatePhone(formData.phone, formData.phoneCountry as CountryCode);

  return (
    <APIProvider apiKey={googleMapsApiKey} libraries={["places"]}>
    <div>
      {/* Hero Section */}
      <section
        className="relative py-16 md:py-24 overflow-hidden"
        style={hasHeroImage ? { backgroundImage: `url(${cmsBgImage(heroImage!)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {hasHeroImage && <div className="absolute inset-0 bg-slate-900/75" />}
        {!hasHeroImage && <div className="absolute inset-0 bg-muted/50" />}
        <div className="relative container mx-auto px-4 text-center">
          <h1 className={`font-heading text-3xl md:text-4xl font-bold mb-3 ${hasHeroImage ? "text-white" : ""}`}>
            {d(`${P}.hero.title`)}
          </h1>
          <p className={`text-lg max-w-2xl mx-auto ${hasHeroImage ? "text-white/85" : "text-muted-foreground"}`}>
            {d(`${P}.hero.subtitle`)}
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 py-12 max-w-2xl -mt-8 relative z-10">

      <Card className="p-6 md:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName"><User className="inline h-3.5 w-3.5 mr-1" />{d(`${P}.form.firstName`)} *</Label>
              <Input id="firstName" value={formData.firstName} onChange={(e) => handleChange("firstName", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName"><Users className="inline h-3.5 w-3.5 mr-1" />{d(`${P}.form.lastName`)} *</Label>
              <Input id="lastName" value={formData.lastName} onChange={(e) => handleChange("lastName", e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email"><Mail className="inline h-3.5 w-3.5 mr-1" />{d(`${P}.form.email`)} *</Label>
              <Input id="email" type="email" value={formData.email} onChange={(e) => handleChange("email", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone"><PhoneIcon className="inline h-3.5 w-3.5 mr-1" />{d(`${P}.form.phone`)}</Label>
              <div className="flex gap-2">
                <select
                  value={formData.phoneCountry}
                  onChange={(e) => handleChange("phoneCountry", e.target.value)}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                >
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {countryFlag(c.code)} {c.dialCode}
                    </option>
                  ))}
                </select>
                <Input id="phone" type="tel" value={formData.phone} onChange={(e) => handleChange("phone", e.target.value)} className="flex-1" />
              </div>
              {formData.phone && !isPhoneValid && (
                <p className="text-xs text-destructive">{d(`${P}.form.phone`)}: invalid</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company"><Building2 className="inline h-3.5 w-3.5 mr-1" />{d(`${P}.form.company`)}</Label>
            <Input id="company" value={formData.company} onChange={(e) => handleChange("company", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{d(`${P}.form.address`)}</Label>
            {addressMode === "google" && googleMapsApiKey ? (
              <>
                <PlaceAutocomplete
                  value={formData.streetName ? `${formData.streetName} ${formData.streetNb}, ${formData.postalCode} ${formData.locality}`.trim() : ""}
                  onChange={(v) => handleChange("address", v)}
                  onPlaceSelect={handlePlaceSelect}
                  placeholder={d(`${P}.form.address`)}
                />
                <button type="button" onClick={() => setAddressMode("manual")} className="text-xs text-muted-foreground hover:text-foreground underline">
                  {d(`${P}.form.addressManual`) || "Saisie manuelle"}
                </button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Input className="col-span-2" placeholder={d(`${P}.form.address`)} value={formData.streetName} onChange={(e) => handleChange("streetName", e.target.value)} />
                  <Input placeholder="N°" value={formData.streetNb} onChange={(e) => handleChange("streetNb", e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder={d(`${P}.form.postalCode`)} value={formData.postalCode} onChange={(e) => handleChange("postalCode", e.target.value)} />
                  <Input className="col-span-2" placeholder={d(`${P}.form.locality`)} value={formData.locality} onChange={(e) => handleChange("locality", e.target.value)} />
                </div>
                {googleMapsApiKey && (
                  <button type="button" onClick={() => setAddressMode("google")} className="text-xs text-muted-foreground hover:text-foreground underline">
                    {d(`${P}.form.addressGoogle`) || "Recherche automatique"}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4" style={{ display: "none" }}>
            {/* Hidden — kept for backward compat with existing form data shape */}
            <div className="space-y-2">
              <Label htmlFor="postalCode">{d(`${P}.form.postalCode`)}</Label>
              <Input id="postalCode" value={formData.postalCode} onChange={(e) => handleChange("postalCode", e.target.value)} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="locality">{d(`${P}.form.locality`)}</Label>
              <Input id="locality" value={formData.locality} onChange={(e) => handleChange("locality", e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">{d(`${P}.form.subject`)} *</Label>
            <Input id="subject" value={formData.subject} onChange={(e) => handleChange("subject", e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">{d(`${P}.form.message`)} *</Label>
            <Textarea id="message" rows={5} value={formData.message} onChange={(e) => handleChange("message", e.target.value)} required />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={!isFormValid || isSubmitting} className="w-full">
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />{d(`${P}.form.submitting`)}</>
            ) : (
              <><Send className="h-4 w-4 mr-2" />{d(`${P}.form.submit`)}</>
            )}
          </Button>
        </form>
      </Card>
      </div>
    </div>
    </APIProvider>
  );
}
