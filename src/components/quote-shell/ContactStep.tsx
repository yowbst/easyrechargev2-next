"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Mail, MapPin, Phone as PhoneIcon, User, Users } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_COUNTRIES, validatePhone } from "@/lib/phone-utils";
import { normalizeName, suggestEmailCorrection } from "@/lib/form-hygiene";
import { NAV_BAR_CLEARANCE } from "@/lib/dropdownPlacement";
import { getCantonCode, CANTON_CODES } from "@shared/swiss-cantons";
import { RevealField } from "./RevealField";
import { fieldConfig } from "./pageConfig";
import type { FormValues } from "./types";

const LazyPlaceAutocomplete = dynamic(
  () => import("@/components/quote/PlaceAutocomplete").then((m) => m.PlaceAutocomplete),
  { ssr: false },
);
const LazyAPIProvider = dynamic(
  () => import("@vis.gl/react-google-maps").then((m) => m.APIProvider),
  { ssr: false },
);

interface ContactFields {
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
}

interface ContactStepProps {
  data: FormValues;
  set: (field: string, value: unknown) => void;
  /** Several fields at once (place selection, address mode). */
  patch: (updates: FormValues) => void;
  tq: (key: string, vars?: Record<string, string | number>) => string;
  tqOpt: (key: string) => string | undefined;
  lang: string;
  pageConfig: Record<string, unknown>;
}

const countryFlag = (code: string) =>
  Array.from(code.toUpperCase()).map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))).join("");

export function ContactStep({ data, set, patch, tq, tqOpt, lang, pageConfig }: ContactStepProps) {
  const formData = data as unknown as ContactFields;
  const handleFieldChange = (field: keyof ContactFields, value: unknown) => set(field, value);
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
  const isPhoneValid = formData.phone && validatePhone(formData.phone, formData.phoneCountry as CountryCode);

  const phoneCountries = useMemo(() => {
    const configured = fieldConfig(pageConfig, "contact", "phone").countries as string[] | undefined;
    if (!configured?.length) return SUPPORTED_COUNTRIES;
    return SUPPORTED_COUNTRIES.filter((c) => configured.includes(c.code));
  }, [pageConfig]);

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    if (!place.address_components) return;
    const updates: FormValues = { streetName: "", streetNb: "", postalCode: "", locality: "", canton: "", country: "" };
    for (const component of place.address_components) {
      const types = component.types;
      if (types.includes("street_number")) updates.streetNb = component.long_name;
      if (types.includes("route")) updates.streetName = component.long_name;
      if (types.includes("postal_code")) updates.postalCode = component.long_name;
      if (types.includes("locality")) updates.locality = component.long_name;
      if (types.includes("administrative_area_level_1")) updates.canton = getCantonCode(component.long_name) || component.short_name;
      if (types.includes("country")) updates.country = component.short_name;
    }
    patch(updates);
  };

  const toggleAddressMode = () => {
    patch({
      addressMode: formData.addressMode === "google" ? "manual" : "google",
      address: "", streetName: "", streetNb: "", postalCode: "", locality: "", canton: "", country: "CH",
    });
  };

  return (
    <>
      {/* Address */}
      <div id="q-address">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary" />
          {tq("steps.contact.fields.address.label")}
        </Label>

        {formData.addressMode === "google" ? (
          <>
            {/* Only hide search after a place is actually selected (which populates streetName) */}
            <div className={formData.streetName ? "hidden" : ""}>
              <LazyAPIProvider apiKey={googleMapsApiKey} libraries={["places"]}>
                <LazyPlaceAutocomplete
                  id="address"
                  value={formData.address}
                  onChange={(value) => handleFieldChange("address", value)}
                  onPlaceSelect={handlePlaceSelect}
                  placeholder={tq("steps.contact.fields.address.placeholder") || undefined}
                  bottomClearance={NAV_BAR_CLEARANCE}
                />
              </LazyAPIProvider>
            </div>

            {/* Display editable address component fields */}
            <RevealField visible={!!(formData.streetName || formData.locality)}>
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
            </RevealField>

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

      {/* First Name & Last Name */}
      <div className="grid grid-cols-2 gap-3">
        <div id="q-firstName">
          <Label htmlFor="firstName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
            <User className="h-4 w-4 text-primary" />
            {tq("steps.contact.fields.firstName.label")}
          </Label>
          <Input
            id="firstName"
            type="text"
            value={formData.firstName}
            onChange={(e) => handleFieldChange("firstName", e.target.value)}
            onBlur={(e) => handleFieldChange("firstName", normalizeName(e.target.value))}
            data-testid="input-firstName"
          />
        </div>
        <div id="q-lastName">
          <Label htmlFor="lastName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" />
            {tq("steps.contact.fields.lastName.label")}
          </Label>
          <Input
            id="lastName"
            type="text"
            value={formData.lastName}
            onChange={(e) => handleFieldChange("lastName", e.target.value)}
            onBlur={(e) => handleFieldChange("lastName", normalizeName(e.target.value))}
            data-testid="input-lastName"
          />
        </div>
      </div>

      {/* Email */}
      <div id="q-email">
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
        {isEmailValid && suggestEmailCorrection(formData.email) && (
          <p className="text-xs text-muted-foreground mt-1">
            {tqOpt("steps.contact.fields.email.suggestion") ?? (lang === "de" ? "Meinten Sie" : "Vouliez-vous dire")}{" "}
            <button
              type="button"
              className="font-medium text-primary underline underline-offset-2"
              onClick={() => handleFieldChange("email", suggestEmailCorrection(formData.email)!)}
            >
              {suggestEmailCorrection(formData.email)}
            </button>
            {" ?"}
          </p>
        )}
      </div>

      {/* Phone with Country Selector */}
      <div id="q-phone">
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
    </>
  );
}
