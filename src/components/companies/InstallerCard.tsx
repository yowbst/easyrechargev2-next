import { BadgeCheck, Cable, ClipboardCheck, Cpu, ExternalLink, Flame, Lightbulb, MapPin, Network, PlugZap, ShieldCheck, Sun, Wrench, Zap, type LucideIcon } from "lucide-react";
import { SPECIALTIES, type SpecialtyKey } from "@/lib/companies/specialties";
import { monogram, monogramTone, type PublicInstaller } from "@/lib/companies/public/installers";

const ICONS: Record<SpecialtyKey, LucideIcon> = {
  bornes: PlugZap,
  photovoltaique: Sun,
  courant_fort: Zap,
  courant_faible: Cable,
  domotique: Cpu,
  telecom: Network,
  securite: ShieldCheck,
  eclairage: Lightbulb,
  chauffage: Flame,
  controles: ClipboardCheck,
  depannage: Wrench,
};

const FORM_LABEL: Record<string, string> = {
  corporation: "SA",
  llc: "Sàrl",
  sp: "Entreprise individuelle",
  gp: "Société de personnes",
  cooperative: "Coopérative",
  branch: "Succursale",
};

const TONES = [
  "bg-[#07231A] text-[#3DDC84]",
  "bg-[#E2DCCE] text-[#07231A] dark:bg-[#1b3527] dark:text-[#e8ede9]",
  "bg-[#16A34A] text-[#04150C]",
] as const;

export function formatDistance(km: number): string {
  if (km < 1) return "< 1 km";
  return `${km.toFixed(1).replace(".", ",")} km`;
}

/** The register's public page for a UID (uid.admin.ch, the federal company register lookup). */
export function registerLink(uid: string): string | null {
  const digits = uid.replace(/[^0-9]/g, "");
  return digits.length === 9 ? `https://www.uid.admin.ch/Detail.aspx?uid_id=CHE${digits}&lang=fr` : null;
}

/**
 * One installer, read as a company of the trade: monogram, what it does, up to three
 * specialties, where it is. Register facts only, nothing invented.
 */
export function InstallerCard({ installer, distanceKm }: { installer: PublicInstaller; distanceKm?: number }) {
  const form = FORM_LABEL[installer.legalForm ?? ""] ?? null;
  const summary = installer.tradeSummary ?? `Entreprise d'électricité${form ? ` · ${form}` : ""}`;
  const register = registerLink(installer.uid);
  const place = [installer.postalCode, installer.locality].filter(Boolean).join(" ");
  return (
    <article className="flex h-full flex-col gap-3.5 rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden
          className={`inline-flex size-14 shrink-0 items-center justify-center rounded-[10px] font-heading text-xl font-semibold tracking-tight ${TONES[monogramTone(installer.ehraid)]}`}
        >
          {monogram(installer.name)}
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold leading-snug">{installer.name}</h3>
          <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground">{summary}</p>
        </div>
      </div>
      {installer.specialties.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Spécialités">
          {installer.specialties.slice(0, 3).map((k) => {
            const Icon = ICONS[k];
            return (
              <li key={k} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2.5 text-[13px] font-semibold text-foreground/80">
                <Icon className="size-3.5 text-primary" aria-hidden />
                {SPECIALTIES[k]}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {installer.street ? `${installer.street}, ${place}` : place}
            {distanceKm !== undefined ? ` · ${formatDistance(distanceKm)}` : ""}
          </span>
        </span>
        {register && (
          <a href={register} target="_blank" rel="nofollow noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
            <BadgeCheck className="size-3.5" aria-hidden />
            Registre des entreprises
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}
