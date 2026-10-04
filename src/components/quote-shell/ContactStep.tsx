"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Loader2, Lock, Mail, Phone as PhoneIcon, Plus } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_COUNTRIES, validatePhone } from "@/lib/phone-utils";
import { normalizeName, suggestEmailCorrection } from "@/lib/form-hygiene";
import { getCantonCode, CANTON_CODES } from "@shared/swiss-cantons";
import { fieldConfig } from "./pageConfig";
import type { FormValues, StepProps } from "./types";

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
  comment?: string;
  acceptTerms?: boolean;
}

interface ContactStepProps extends Omit<StepProps, "hidden" | "links"> {
  /** Several fields at once (place selection, address mode). */
  patch: (updates: FormValues) => void;
  slaVars: Record<string, string | number>;
  onSubmit: () => void;
  onBack?: () => void;
  isSubmitting: boolean;
  submitError: boolean;
  /** NPA and locality came from the mini-quote: the street is all that is left. */
  focusStreet: boolean;
}

// Inputs of design 06 / 15 v2: 52 px, radius 8, a 2 px link border on focus.
const FIELD =
  "h-13 rounded-lg border-border bg-card px-3.5 text-base md:text-base focus-visible:border-2 focus-visible:border-b-link focus-visible:ring-0";
const LABEL = "flex flex-wrap items-baseline justify-between gap-x-3 text-[15px] font-semibold leading-snug";

const countryFlag = (code: string) =>
  Array.from(code.toUpperCase()).map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))).join("");

function Field({ id, label, why, className = "", children }: { id: string; label: string; why?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className={LABEL}>
        {label}
        {why && <span className="text-sm font-normal text-muted-foreground">{why}</span>}
      </label>
      {children}
    </div>
  );
}

/**
 * Last step of every quote funnel (design 15 v2, 2e): the address — street
 * first, NPA and locality carried over from the mini-quote — then the person,
 * the submit button in the flow, consent under it and the comment folded away.
 */
export function ContactStep({
  data, set, patch, tq, tqOpt, tc, lang, pageConfig, slaVars, onSubmit, onBack, isSubmitting, submitError, focusStreet,
}: ContactStepProps) {
  const f = data as unknown as ContactFields;
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email);
  const isPhoneValid = f.phone && validatePhone(f.phone, f.phoneCountry as CountryCode);
  const emailSuggestion = isEmailValid ? suggestEmailCorrection(f.email) : null;
  const consentLabel = tq("steps.finalize.fields.acceptTerms.label").trim();
  const privacyNote = tq("steps.finalize.fields.acceptTerms.privacyNote").split("{privacyLink}");
  const searching = f.addressMode === "google" && !f.streetName;
  // Asked once missing, then kept on screen: it must not vanish when chosen.
  const [cantonAsked] = useState(() => !f.canton);
  const askCanton = cantonAsked || !f.canton;

  const phoneCountries = useMemo(() => {
    const configured = fieldConfig(pageConfig, "contact", "phone").countries as string[] | undefined;
    if (!configured?.length) return SUPPORTED_COUNTRIES;
    return SUPPORTED_COUNTRIES.filter((c) => configured.includes(c.code));
  }, [pageConfig]);

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    if (!place.address_components) return;
    const updates: FormValues = { streetName: "", streetNb: "", country: "CH" };
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

  // Switching mode keeps NPA, locality and canton: they may come from the mini-quote.
  const toggleAddressMode = () =>
    patch({ addressMode: f.addressMode === "google" ? "manual" : "google", address: "", streetName: "", streetNb: "" });

  return (
    <>
      {/* Address */}
      <fieldset id="q-address" className="flex flex-col gap-3">
        <legend className="mb-3 text-[17px] font-semibold">{tq("steps.contact.fields.address.label")}</legend>
        <div className="grid grid-cols-4 gap-3">
          {searching ? (
            <Field id="address" label={tc("steps.contact.fields.address.street")} className="col-span-4">
              <LazyAPIProvider apiKey={googleMapsApiKey} libraries={["places"]}>
                <LazyPlaceAutocomplete
                  id="address"
                  value={f.address}
                  onChange={(value) => set("address", value)}
                  onPlaceSelect={handlePlaceSelect}
                  placeholder={tqOpt("steps.contact.fields.address.placeholder")}
                  className={FIELD}
                  autoFocus={focusStreet}
                />
              </LazyAPIProvider>
            </Field>
          ) : (
            <>
              <Field id="streetName" label={tq("steps.contact.fields.address.subfields.streetName")} className="col-span-3">
                <Input id="streetName" className={FIELD} autoComplete="address-line1" autoFocus={focusStreet && f.addressMode === "manual"}
                  value={f.streetName || ""} onChange={(e) => set("streetName", e.target.value)} data-testid="input-streetName" />
              </Field>
              <Field id="streetNb" label={tq("steps.contact.fields.address.subfields.streetNb")}>
                <Input id="streetNb" className={FIELD} value={f.streetNb || ""} onChange={(e) => set("streetNb", e.target.value)} data-testid="input-streetNb" />
              </Field>
            </>
          )}
          <Field id="postalCode" label={tq("steps.contact.fields.address.subfields.postalCode")}>
            <Input id="postalCode" className={FIELD} inputMode="numeric" autoComplete="postal-code" maxLength={4}
              value={f.postalCode || ""} onChange={(e) => set("postalCode", e.target.value)} data-testid="input-postalCode" />
          </Field>
          <Field id="locality" label={tq("steps.contact.fields.address.subfields.locality")} className={askCanton ? "col-span-2" : "col-span-3"}>
            <Input id="locality" className={FIELD} autoComplete="address-level2"
              value={f.locality || ""} onChange={(e) => set("locality", e.target.value)} data-testid="input-locality" />
          </Field>
          {/* The canton comes with the address; asked only when it did not. */}
          {askCanton && (
            <Field id="canton" label={tq("steps.contact.fields.address.subfields.canton")}>
              <Select value={f.canton || ""} onValueChange={(value) => set("canton", value)}>
                <SelectTrigger id="canton" className={`${FIELD} w-full`} data-testid="input-canton">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CANTON_CODES.map((code) => (
                    <SelectItem key={code} value={code}>{code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <button type="button" onClick={toggleAddressMode} className="self-start text-sm font-medium text-b-link hover:underline"
          data-testid={f.addressMode === "google" ? "button-toggle-manual-mode" : "button-toggle-google-mode"}>
          {tc(f.addressMode === "google" ? "steps.contact.fields.address.toggleManual" : "steps.contact.fields.address.toggleGoogle")}
        </button>
      </fieldset>

      {/* The person */}
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-[17px] font-semibold">{tc("steps.contact.fields.identity")}</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field id="firstName" label={tq("steps.contact.fields.firstName.label")}>
            <div id="q-firstName">
              <Input id="firstName" className={FIELD} autoComplete="given-name" value={f.firstName}
                onChange={(e) => set("firstName", e.target.value)} onBlur={(e) => set("firstName", normalizeName(e.target.value))} data-testid="input-firstName" />
            </div>
          </Field>
          <Field id="lastName" label={tq("steps.contact.fields.lastName.label")}>
            <div id="q-lastName">
              <Input id="lastName" className={FIELD} autoComplete="family-name" value={f.lastName}
                onChange={(e) => set("lastName", e.target.value)} onBlur={(e) => set("lastName", normalizeName(e.target.value))} data-testid="input-lastName" />
            </div>
          </Field>
        </div>

        <Field id="email" label={tq("steps.contact.fields.email.label")} why={tc("steps.contact.fields.email.why", slaVars)}>
          <div id="q-email" className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="email" type="email" inputMode="email" autoComplete="email" className={`${FIELD} pl-10`} value={f.email}
              onChange={(e) => set("email", e.target.value)} aria-invalid={!!f.email && !isEmailValid} data-testid="input-email" />
          </div>
          {f.email && !isEmailValid && <p className="text-sm text-destructive">{tq("steps.contact.fields.email.error")}</p>}
          {emailSuggestion && (
            <p className="text-sm text-muted-foreground">
              {tqOpt("steps.contact.fields.email.suggestion") ?? (lang === "de" ? "Meinten Sie" : "Vouliez-vous dire")}{" "}
              <button type="button" className="font-medium text-b-link underline underline-offset-2" onClick={() => set("email", emailSuggestion)}>
                {emailSuggestion}
              </button>
              {" ?"}
            </p>
          )}
        </Field>

        <Field id="phone" label={tq("steps.contact.fields.phone.label")} why={tc("steps.contact.fields.phone.why", slaVars)}>
          <div id="q-phone" className="flex">
            <Select value={f.phoneCountry} onValueChange={(value) => set("phoneCountry", value)}>
              <SelectTrigger aria-label={tq("steps.contact.fields.phone.label")} className={`${FIELD} w-28 rounded-r-none border-r-0`} data-testid="select-phoneCountry">
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
            <div className="relative flex-1">
              <PhoneIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="phone"
                type="tel"
                autoComplete="tel-national"
                className={`${FIELD} rounded-l-none pl-10`}
                value={f.phone}
                aria-invalid={!!f.phone && !isPhoneValid}
                onChange={(e) => {
                  const dialCode = phoneCountries.find((c) => c.code === f.phoneCountry)?.dialCode ?? "";
                  let phone = e.target.value.trim();
                  const compact = phone.replace(/[\s\-]/g, "");
                  if (compact.startsWith(dialCode)) phone = compact.slice(dialCode.length).trimStart();
                  else if (compact.startsWith("00" + dialCode.slice(1))) phone = compact.slice(2 + dialCode.length - 1).trimStart();
                  set("phone", phone);
                }}
                data-testid="input-phone"
              />
            </div>
          </div>
          {f.phone && !isPhoneValid && <p className="text-sm text-destructive">{tq("steps.contact.fields.phone.error")}</p>}
        </Field>
      </fieldset>

      {/* Send: the button is in the flow, consent under it (design 15 v2, 2e). */}
      <div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-md bg-b-charge text-[17px] font-semibold text-b-on-charge transition hover:brightness-95 disabled:opacity-80"
          data-testid="button-submit"
        >
          {isSubmitting ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <>{tc("steps.contact.submit")}<ArrowRight className="size-4.5" aria-hidden /></>}
        </button>
        {submitError && (
          <p role="alert" className="mt-2 text-center text-sm text-(--destructive-border)">{tq("steps.finalize.submitError")}</p>
        )}

        <div id="q-acceptTerms" className="mt-4">
          <label htmlFor="acceptTerms" className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted-foreground">
            <Checkbox
              id="acceptTerms"
              checked={f.acceptTerms === true}
              onCheckedChange={(checked) => set("acceptTerms", !!checked)}
              className="mt-0.5 size-6 shrink-0 rounded-md"
              data-testid="checkbox-accept-terms"
            />
            <span>
              {consentLabel}{/[.!?]$/.test(consentLabel) ? " " : ". "}
              {privacyNote[0]}
              <a href={`/${lang}/privacy`} className="text-b-link underline underline-offset-3" target="_blank" rel="noopener noreferrer">
                {tq("steps.finalize.fields.acceptTerms.privacyLink")}
              </a>
              {privacyNote[1]}
            </span>
          </label>
        </div>

        <details className="group mt-4">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 text-[15px] font-semibold text-b-link [&::-webkit-details-marker]:hidden">
            <Plus className="size-[15px] transition-transform group-open:rotate-45" aria-hidden />
            {tq("steps.finalize.fields.comment.label")} {tc("steps.contact.fields.comment.optional")}
          </summary>
          <Textarea
            id="comment"
            aria-label={tq("steps.finalize.fields.comment.label")}
            placeholder={tq("steps.finalize.fields.comment.placeholder")}
            value={f.comment ?? ""}
            onChange={(e) => set("comment", e.target.value)}
            rows={4}
            className="mt-2 resize-none rounded-lg border-border bg-card text-base"
            data-testid="textarea-comment"
          />
        </details>

        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          {tc("steps.contact.privacyNote")}
        </p>

        {onBack && (
          <button type="button" onClick={onBack} className="mt-6 inline-flex h-12 items-center gap-2 rounded-md px-1 text-[15px] font-semibold text-muted-foreground hover:text-foreground" data-testid="button-back">
            <ArrowLeft className="size-4" aria-hidden />
            {tq("navigation.back")}
          </button>
        )}
      </div>
    </>
  );
}
