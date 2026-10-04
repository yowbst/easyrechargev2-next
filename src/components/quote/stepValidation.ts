// What is missing on the shared contact step of the quote funnels (charger
// and battery). Returns the FIRST unanswered field in visual order — the
// shell scrolls to `#q-<key>` when the submit button is pressed early.
// The product steps have their own rules: products/<product>/validation.ts.

import { validatePhone } from "@/lib/phone-utils";
import type { CountryCode } from "libphonenumber-js";

export interface ContactFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  addressMode: string;
  address: string;
  postalCode?: string;
  locality?: string;
  canton?: string;
  streetName?: string;
  streetNb?: string;
  acceptTerms: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactFirstUnanswered(f: ContactFields): string | null {
  // Address first (2026-07 UX pass): it keeps the autocomplete dropdown high
  // in the viewport and asks for the low-friction answer before personal details.
  const addressOk =
    f.addressMode === "google"
      ? f.address && f.postalCode && f.locality && f.canton
      : f.postalCode && f.locality && f.streetName && f.streetNb && f.canton;
  if (!addressOk) return "address";
  if (!String(f.firstName ?? "").trim()) return "firstName";
  if (!String(f.lastName ?? "").trim()) return "lastName";
  if (!EMAIL_RE.test(String(f.email ?? ""))) return "email";
  if (!f.phone || !validatePhone(f.phone, f.phoneCountry as CountryCode)) return "phone";
  // Consent sits under the submit button since the finalize step was merged in (v2).
  if (!f.acceptTerms) return "acceptTerms";
  return null;
}
