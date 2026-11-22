import { createHash } from "node:crypto";
import { installationEvidence } from "./candidates";
import type { CleanCompany, LegalFormKind, RawCompany } from "./types";

/** "CHE-107.036.057", "che 107 036 057" and "CHE107036057" all become "CHE107036057". */
export function normalizeUid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^CHE[\s.-]*(\d{3})[\s.-]*(\d{3})[\s.-]*(\d{3})$/i.exec(raw.trim());
  return m ? `CHE${m[1]}${m[2]}${m[3]}` : null;
}

/** CHE107036057 -> CHE-107.036.057, the form printed on Swiss documents. */
export function formatUid(uid: string | null | undefined): string {
  const n = normalizeUid(uid);
  return n ? `CHE-${n.slice(3, 6)}.${n.slice(6, 9)}.${n.slice(9, 12)}` : "";
}

/** ech-0097 legal form codes, as listed on LINDAS. */
export function legalFormKind(code: string | null | undefined): LegalFormKind {
  switch (code) {
    case "0101":
      return "sp";
    case "0103":
    case "0104":
      return "gp";
    case "0106":
      return "corporation";
    case "0107":
      return "llc";
    case "0108":
      return "cooperative";
    case "0111":
    case "0151":
      return "branch";
    default:
      return "other";
  }
}

/**
 * The register graph has no status field: a company in liquidation or
 * bankruptcy stays listed, and the only trace is a suffix on the name.
 */
export function isInLiquidation(name: string): boolean {
  return /\b(en liquidation|in liquidation|in liquidazione|en faillite|in konkurs|in fallimento|(en|in) liq\b\.?|in nachlassliquidation|liquidation concordataire)(?!\w)/i.test(name);
}

/** sha256 of the purpose after NFKC and whitespace collapse: stable under cosmetic edits. */
export function purposeHash(purpose: string): string {
  const norm = purpose.normalize("NFKC").replace(/\s+/g, " ").trim();
  return createHash("sha256").update(norm).digest("hex");
}

/**
 * Register street fields can span several lines ("c/o Name\nStreet 5") and some carry a
 * literal "null" line. One clean line, or null when nothing is left.
 */
export function cleanStreet(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l !== "" && l.toLowerCase() !== "null");
  return lines.length ? lines.join(", ") : null;
}

export type CoordLookup = (postalCode: string) => readonly [number, number] | null;

const round = (n: number, digits: number) => Number(n.toFixed(digits));

export function toCleanCompany(raw: RawCompany, lookup: CoordLookup): CleanCompany {
  const coords = raw.postalCode ? lookup(raw.postalCode) : null;
  return {
    ehraid: raw.ehraid,
    uid: normalizeUid(raw.uid),
    chid: raw.chid,
    register_url: `https://register.ld.admin.ch/zefix/company/${raw.ehraid}`,
    legal_name: raw.legalName.trim(),
    purpose_text: raw.purpose.trim(),
    purpose_hash: purposeHash(raw.purpose),
    legal_form_code: raw.legalFormCode,
    legal_form_kind: legalFormKind(raw.legalFormCode),
    in_liquidation: isInLiquidation(raw.legalName),
    installation_evidence: installationEvidence(raw.purpose),
    street_address: cleanStreet(raw.street),
    postal_code: raw.postalCode,
    locality: raw.locality?.trim() || null,
    canton: raw.canton,
    bfs_id: raw.bfsId,
    lat: coords ? round(coords[0], 6) : null,
    lng: coords ? round(coords[1], 6) : null,
    geo_source: coords ? "postcode_centroid" : null,
  };
}
