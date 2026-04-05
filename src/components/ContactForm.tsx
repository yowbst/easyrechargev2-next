"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { t } from "@/lib/i18n/dictionaries";
import {
  Mail, Send, Loader2, MapPin, Phone as PhoneIcon,
  User, Users, Building2,
} from "lucide-react";
import { SUPPORTED_COUNTRIES, validatePhone } from "@/lib/phone-utils";
import { cmsBgImage } from "@/lib/directusAssets";
import { useFormTelemetry } from "@/hooks/use-form-telemetry";
import { getAttributionCompact } from "@/lib/attribution";
import { usePostHog } from "@/components/PostHogProvider";
import { APIProvider } from "@vis.gl/react-google-maps";
import { PlaceAutocomplete } from "@/components/quote/PlaceAutocomplete";
import { getCantonCode, CANTON_CODES } from "@shared/swiss-cantons";
import { GetQuote } from "@/components/GetQuote";
import { toast } from "sonner";
import type { CountryCode } from "libphonenumber-js";
import type { PageRegistryEntry } from "@/lib/directus-queries";

interface GetQuoteBlockData {
  variant?: string;
  image?: string;
}

interface ContactFormProps {
  lang: string;
  dictionary: Record<string, string>;
  heroImage?: string;
  getQuoteBlock?: GetQuoteBlockData;
  pageRegistry?: PageRegistryEntry[];
}

const P = "pages.contact";

export function ContactForm({ lang, dictionary, heroImage, getQuoteBlock, pageRegistry }: ContactFormProps) {
  const hasHeroImage = !!heroImage;
  /** Translate with optional interpolation vars or a plain-string default. */
  const d = (key: string, varsOrDefault?: Record<string, string | number> | string) => {
    if (typeof varsOrDefault === "string") return dictionary[key] ?? varsOrDefault;
    return t(dictionary, key, varsOrDefault);
  };
  const ph = usePostHog();
  const telemetry = useFormTelemetry({ formType: "contact", locale: lang });
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    phoneCountry: "CH",
    addressMode: "google" as "google" | "manual",
    address: "",
    streetName: "",
    streetNb: "",
    company: "",
    postalCode: "",
    locality: "",
    canton: "",
    country: "",
    subject: "",
    message: "",
  });

  // Hero spotlight effect
  const heroRef = useRef<HTMLElement>(null);
  const [spotlight, setSpotlight] = useState<{ x: number; y: number } | null>(null);

  const handleHeroMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = heroRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSpotlight({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleHeroMouseLeave = useCallback(() => setSpotlight(null), []);

  const handleFieldChange = (field: string, value: string) => {
    telemetry.trackChange(field, value);
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    if (!place.address_components) return;
    let streetNb = "", streetName = "", postal = "", locality = "", canton = "", country = "";
    for (const component of place.address_components) {
      const types = component.types;
      if (types.includes("street_number")) streetNb = component.long_name;
      if (types.includes("route")) streetName = component.long_name;
      if (types.includes("postal_code")) postal = component.long_name;
      if (types.includes("locality")) locality = component.long_name;
      if (types.includes("administrative_area_level_1")) {
        const cantonCode = getCantonCode(component.long_name);
        canton = cantonCode || component.short_name;
      }
      if (types.includes("country")) country = component.short_name;
    }
    setFormData((prev) => ({ ...prev, streetName, streetNb, postalCode: postal, locality, canton, country }));
  };

  const toggleAddressMode = () => {
    setFormData((prev) => ({
      ...prev,
      addressMode: prev.addressMode === "google" ? "manual" : "google",
      address: "", streetName: "", streetNb: "", postalCode: "", locality: "", canton: "", country: "",
    }));
  };

  const countryFlag = (code: string) =>
    Array.from(code.toUpperCase()).map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))).join("");

  const phoneCountries = SUPPORTED_COUNTRIES;

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
  const isPhoneValid = !formData.phone || validatePhone(formData.phone, formData.phoneCountry as CountryCode);

  const isFormValid =
    formData.firstName.trim() &&
    formData.lastName.trim() &&
    formData.email &&
    isEmailValid &&
    formData.subject.trim() &&
    formData.message.trim() &&
    isPhoneValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setIsSubmitting(true);

    try {
      const attribution = getAttributionCompact();
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, attribution }),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        telemetry.trackSubmit(true, { emailId: result.emailId });
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
            locationParams: window.location.search.slice(1) || null,
            locationRoute: "contact",
            locale: lang,
            userAgent: navigator.userAgent,
            colorScheme: window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
            user: {
              email: formData.email,
              firstName: formData.firstName,
              lastName: formData.lastName,
              phone: formData.phone,
            },
            data: formData,
            status: "success",
          }),
        }).catch(() => {});

        toast.success(d(`${P}.toasts.success.title`), {
          description: d(`${P}.toasts.success.description`),
        });

        setFormData({
          firstName: "", lastName: "", email: "", phone: "", phoneCountry: "CH",
          addressMode: "google", address: "", streetName: "", streetNb: "",
          company: "", postalCode: "", locality: "", canton: "", country: "",
          subject: "", message: "",
        });
      } else {
        throw new Error(result.message || "Une erreur est survenue");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      telemetry.trackSubmit(false, { error: errorMsg });
      ph?.capture("contact_form_error", { error_message: errorMsg });

      toast.error(d(`${P}.toasts.error.title`), {
        description: d(`${P}.toasts.error.description`),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // GetQuote CTA
  const getQuoteVariant = useMemo(() => {
    const variant = getQuoteBlock?.variant;
    if (variant === "grey") return "muted" as const;
    if (variant === "green") return "primary" as const;
    return "muted" as const;
  }, [getQuoteBlock]);

  const quoteHref = useMemo(() => {
    if (!pageRegistry) return `/${lang}/demande-devis`;
    const quoteEntry = pageRegistry.find((p) => p.id === "quote");
    const slug = quoteEntry?.slugs?.[lang];
    return slug ? `/${lang}/${slug}` : `/${lang}/demande-devis`;
  }, [pageRegistry, lang]);

  return (
    <APIProvider apiKey={googleMapsApiKey} libraries={["places"]}>
    <div>
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative py-20 md:py-28 overflow-hidden"
        style={hasHeroImage ? { backgroundImage: `url(${cmsBgImage(heroImage!)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        onMouseMove={hasHeroImage ? handleHeroMouseMove : undefined}
        onMouseLeave={hasHeroImage ? handleHeroMouseLeave : undefined}
      >
        {hasHeroImage ? (
          <div
            className="absolute inset-0 transition-all duration-200"
            style={{
              background: spotlight
                ? `radial-gradient(circle 280px at ${spotlight.x}px ${spotlight.y}px, rgba(15,23,42,0.35) 0%, rgba(15,23,42,0.78) 100%)`
                : "rgba(15,23,42,0.75)",
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-muted/30" />
        )}
        <div className="relative z-10 container mx-auto px-4 text-center">
          <Mail className={`h-12 w-12 mx-auto mb-4 ${hasHeroImage ? "text-white" : "text-primary"}`} />
          <h1 className={`text-3xl md:text-4xl font-heading font-bold mb-4 ${hasHeroImage ? "text-white" : ""}`}>
            {d(`${P}.hero.title`)}
          </h1>
          <p className={`text-lg max-w-2xl mx-auto ${hasHeroImage ? "text-white/80" : "text-muted-foreground"}`}>
            {d(`${P}.hero.subtitle`)}
          </p>
        </div>
      </section>

      <div className="bg-muted/30">
      <div className="container mx-auto px-4 py-16 pb-20">
        <div className="max-w-3xl mx-auto">
          <Card className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">

  {/* First Name & Last Name */}
  <div className="grid grid-cols-2 gap-3">
    <div>
      <Label htmlFor="firstName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <User className="h-4 w-4 text-primary" />
        {d(`${P}.form.firstName`)}
      </Label>
      <Input
        id="firstName"
        value={formData.firstName}
        onChange={(e) => handleFieldChange("firstName", e.target.value)}
        onFocus={() => telemetry.trackFocus("firstName")}
        onBlur={() => telemetry.trackBlur("firstName")}
        required
        data-testid="input-first-name"
      />
    </div>
    <div>
      <Label htmlFor="lastName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <Users className="h-4 w-4 text-primary" />
        {d(`${P}.form.lastName`)}
      </Label>
      <Input
        id="lastName"
        value={formData.lastName}
        onChange={(e) => handleFieldChange("lastName", e.target.value)}
        onFocus={() => telemetry.trackFocus("lastName")}
        onBlur={() => telemetry.trackBlur("lastName")}
        required
        data-testid="input-last-name"
      />
    </div>
  </div>

  {/* Company (optional) */}
  <div>
    <Label htmlFor="company" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
      <Building2 className="h-4 w-4 text-primary" />
      {d(`${P}.form.company`)}
    </Label>
    <Input
      id="company"
      value={formData.company}
      onChange={(e) => handleFieldChange("company", e.target.value)}
      onFocus={() => telemetry.trackFocus("company")}
      onBlur={() => telemetry.trackBlur("company")}
      data-testid="input-company"
    />
  </div>

  {/* Email */}
  <div>
    <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
      <Mail className="h-4 w-4 text-primary" />
      {d(`${P}.form.email`)}
    </Label>
    <Input
      id="email"
      type="email"
      value={formData.email}
      onChange={(e) => handleFieldChange("email", e.target.value)}
      onFocus={() => telemetry.trackFocus("email")}
      onBlur={() => telemetry.trackBlur("email")}
      required
      data-testid="input-email"
    />
    {formData.email && !isEmailValid && (
      <p className="text-xs text-destructive mt-1">
        {d(`${P}.form.emailError`, "Adresse email invalide")}
      </p>
    )}
  </div>

  {/* Phone with country selector */}
  <div>
    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
      <PhoneIcon className="h-4 w-4 text-primary" />
      {d(`${P}.form.phone`)}
    </Label>
    <div className="flex">
      <Select
        value={formData.phoneCountry}
        onValueChange={(value) => handleFieldChange("phoneCountry", value ?? "CH")}
      >
        <SelectTrigger className="w-24 rounded-r-none border-r-0 text-sm font-normal shrink-0" data-testid="select-phone-country">
          <span className="flex items-center gap-1">
            <span>{countryFlag(formData.phoneCountry)}</span>
            <span>{phoneCountries.find((c) => c.code === formData.phoneCountry)?.dialCode}</span>
          </span>
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
        onFocus={() => telemetry.trackFocus("phone")}
        onBlur={() => telemetry.trackBlur("phone")}
        className="flex-1 rounded-l-none text-sm"
        data-testid="input-phone"
      />
    </div>
    {formData.phone && !isPhoneValid && (
      <p className="text-xs text-destructive mt-1">
        {d(`${P}.form.phoneError`, "Numéro de téléphone invalide")}
      </p>
    )}
  </div>

  {/* Address — Google Places or manual */}
  <div>
    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
      <MapPin className="h-4 w-4 text-primary" />
      {d(`${P}.form.address`)}
    </Label>

    {formData.addressMode === "google" ? (
      <>
        <div className={formData.streetName ? "hidden" : ""}>
          <PlaceAutocomplete
            id="address"
            value={formData.address}
            onChange={(value) => handleFieldChange("address", value)}
            onPlaceSelect={handlePlaceSelect}
            placeholder={d(`${P}.form.addressPlaceholder`, "Rue et numéro, NPA Localité")}
          />
        </div>

        {(formData.streetName || formData.locality) && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-3">
                <Label htmlFor="streetName-google" className="text-xs text-muted-foreground mb-1">
                  {d(`${P}.form.streetName`, "Rue")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="streetName-google"
                  value={formData.streetName}
                  onChange={(e) => handleFieldChange("streetName", e.target.value)}
                  data-testid="input-streetName-google"
                />
              </div>
              <div className="col-span-1">
                <Label htmlFor="streetNb-google" className="text-xs text-muted-foreground mb-1">
                  {d(`${P}.form.streetNb`, "N°")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="streetNb-google"
                  value={formData.streetNb}
                  onChange={(e) => handleFieldChange("streetNb", e.target.value)}
                  data-testid="input-streetNb-google"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-1">
                <Label htmlFor="postalCode-google" className="text-xs text-muted-foreground mb-1">
                  {d(`${P}.form.postalCode`)} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="postalCode-google"
                  value={formData.postalCode}
                  onChange={(e) => handleFieldChange("postalCode", e.target.value)}
                  data-testid="input-postalCode-google"
                />
              </div>
              <div className="col-span-3">
                <Label htmlFor="locality-google" className="text-xs text-muted-foreground mb-1">
                  {d(`${P}.form.locality`)} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="locality-google"
                  value={formData.locality}
                  onChange={(e) => handleFieldChange("locality", e.target.value)}
                  data-testid="input-locality-google"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="canton-google" className="text-xs text-muted-foreground mb-1">
                  {d(`${P}.form.canton`)}
                </Label>
                <Select value={formData.canton || ""} onValueChange={(value) => handleFieldChange("canton", value ?? "")}>
                  <SelectTrigger id="canton-google" className="w-full" data-testid="input-canton-google">
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
                  {d(`${P}.form.country`)}
                </Label>
                <Input
                  id="country-google"
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
          {d(`${P}.form.addressManual`, "Saisir l'adresse manuellement")}
        </button>
      </>
    ) : (
      <>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-3">
              <Label htmlFor="streetName" className="text-xs text-muted-foreground mb-1">
                {d(`${P}.form.streetName`, "Rue")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="streetName"
                value={formData.streetName}
                onChange={(e) => handleFieldChange("streetName", e.target.value)}
                data-testid="input-streetName"
              />
            </div>
            <div className="col-span-1">
              <Label htmlFor="streetNb" className="text-xs text-muted-foreground mb-1">
                {d(`${P}.form.streetNb`, "N°")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="streetNb"
                value={formData.streetNb}
                onChange={(e) => handleFieldChange("streetNb", e.target.value)}
                data-testid="input-streetNb"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <Label htmlFor="postalCode-manual" className="text-xs text-muted-foreground mb-1">
                {d(`${P}.form.postalCode`)} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="postalCode-manual"
                value={formData.postalCode}
                onChange={(e) => handleFieldChange("postalCode", e.target.value)}
                data-testid="input-postalCode-manual"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="locality-manual" className="text-xs text-muted-foreground mb-1">
                {d(`${P}.form.locality`)} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="locality-manual"
                value={formData.locality}
                onChange={(e) => handleFieldChange("locality", e.target.value)}
                data-testid="input-locality-manual"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="canton-manual" className="text-xs text-muted-foreground mb-1">
                {d(`${P}.form.canton`)}
              </Label>
              <Select value={formData.canton || ""} onValueChange={(value) => handleFieldChange("canton", value ?? "")}>
                <SelectTrigger id="canton-manual" className="w-full" data-testid="input-canton-manual">
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
                {d(`${P}.form.country`)}
              </Label>
              <Input
                id="country-manual"
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
          {d(`${P}.form.addressGoogle`, "Recherche automatique")}
        </button>
      </>
    )}
  </div>

  {/* Subject */}
  <div>
    <Label htmlFor="subject" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
      {d(`${P}.form.subject`)}
    </Label>
    <Input
      id="subject"
      value={formData.subject}
      onChange={(e) => handleFieldChange("subject", e.target.value)}
      onFocus={() => telemetry.trackFocus("subject")}
      onBlur={() => telemetry.trackBlur("subject")}
      required
      data-testid="input-subject"
    />
  </div>

  {/* Message */}
  <div>
    <Label htmlFor="message" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
      {d(`${P}.form.message`)}
    </Label>
    <Textarea
      id="message"
      value={formData.message}
      onChange={(e) => handleFieldChange("message", e.target.value)}
      onFocus={() => telemetry.trackFocus("message")}
      onBlur={() => telemetry.trackBlur("message")}
      required
      rows={6}
      data-testid="textarea-message"
    />
  </div>

  <Button
    type="submit"
    size="lg"
    className="w-full"
    disabled={!isFormValid || isSubmitting}
    data-testid="button-submit-contact"
  >
    <Send className="h-5 w-5 mr-2" />
    {isSubmitting
      ? d(`${P}.form.submitting`)
      : d(`${P}.form.submit`)}
  </Button>
            </form>
          </Card>
        </div>
      </div>
      </div>

      {/* GetQuote CTA */}
      <GetQuote
        variant={getQuoteVariant}
        title={d(`${P}.blocks.getquote.headline`)}
        subtitle={d(`${P}.blocks.getquote.subheadline`)}
        ctaLabel={d(`${P}.blocks.getquote.cta.label`)}
        ctaHref={quoteHref}
        note={d(`${P}.blocks.getquote.note`)}
        image={getQuoteBlock?.image}
      />
    </div>
    </APIProvider>
  );
}
