import { parsePhoneNumber, type CountryCode } from "libphonenumber-js";

export const SUPPORTED_COUNTRIES = [
  { code: "CH" as CountryCode, name: "Suisse", dialCode: "+41" },
  { code: "LI" as CountryCode, name: "Liechtenstein", dialCode: "+423" },
  { code: "FR" as CountryCode, name: "France", dialCode: "+33" },
  { code: "DE" as CountryCode, name: "Allemagne", dialCode: "+49" },
  { code: "IT" as CountryCode, name: "Italie", dialCode: "+39" },
  { code: "AT" as CountryCode, name: "Autriche", dialCode: "+43" },
] as const;

export function validatePhone(phoneNumber: string, country: CountryCode): boolean {
  try {
    const parsed = parsePhoneNumber(phoneNumber, country);
    return parsed ? parsed.isValid() : false;
  } catch {
    return false;
  }
}

export function formatPhoneE164(phoneNumber: string, country: CountryCode): string | null {
  try {
    const parsed = parsePhoneNumber(phoneNumber, country);
    return parsed && parsed.isValid() ? parsed.format("E.164") : null;
  } catch {
    return null;
  }
}
