import Link from "next/link";
import { InstallerCard } from "@/components/companies/InstallerCard";
import { TrackedSection } from "@/components/companies/TrackedSection";
import type { NearbyInstaller } from "@/lib/companies/public/installers";

/** "2026-11-21T08:00:00Z" → "21.11.2026" (Swiss date, Zurich time). */
export function formatRegisterDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Zurich" }).format(d);
}

/**
 * Register companies near a commune (French pages only). Name, address, distance and
 * register link: no contact details, the request goes through the quote funnel.
 * Source and opt-out are always printed under the list.
 */
export function NearbyInstallers({
  installers,
  localityName,
  postalCode,
  cantonCode,
  radiusKm,
  registerDate,
  contactHref,
}: {
  installers: NearbyInstaller[];
  localityName: string;
  postalCode: string;
  cantonCode: string;
  radiusKm: number;
  registerDate: string | null;
  contactHref: string | null;
}) {
  if (installers.length === 0) return null;
  const date = formatRegisterDate(registerDate);
  return (
    <TrackedSection
      as="section"
      event="installers_block"
      props={{ canton: cantonCode, postal_code: postalCode, count: installers.length, radius_km: radiusKm }}
      aria-labelledby="nearby-installers"
      className="space-y-5"
    >
      <div className="space-y-2">
        <h2 id="nearby-installers" className="text-xl sm:text-2xl font-heading font-bold">
          Électriciens près de {localityName}
        </h2>
        <p className="text-base text-muted-foreground leading-relaxed">
          Entreprises de la région dont le but social, inscrit au registre du commerce, mentionne des installations électriques.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {installers.map((i) => (
          <li key={i.ehraid}>
            <InstallerCard installer={i} distanceKm={i.distanceKm} />
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Source&nbsp;: registre du commerce (Zefix){date ? `, données du ${date}` : ""}. Distance depuis le centre de la localité, classement
        automatique à partir du but social.{" "}
        {contactHref ? (
          <>
            Vous représentez une entreprise listée&nbsp;?{" "}
            <Link href={contactHref} className="font-medium text-primary underline-offset-2 hover:underline">
              Écrivez-nous
            </Link>{" "}
            pour une correction ou un retrait.
          </>
        ) : null}
      </p>
    </TrackedSection>
  );
}
