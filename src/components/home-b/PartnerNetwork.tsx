import { BadgeCheck } from "lucide-react";
import { Container, SectionHead } from "./Shell";

export interface PartnerCard {
  id: string;
  name: string;
  canton: string;
  /** Secondary line, e.g. installation count. Optional. */
  meta?: string;
}

/**
 * "Des entreprises qui ont un nom et une adresse."
 *
 * Fed from the real `partners` collection rather than placeholder logos — the
 * section's whole argument is that these are named, locatable companies, and a
 * row of invented names would undercut it. Renders nothing when the query
 * comes back empty.
 */
export function PartnerNetwork({
  title,
  action,
  partners,
  certifiedLabel,
}: {
  title: string;
  action?: { label: string; href: string };
  partners: PartnerCard[];
  /** Certification chip, e.g. "OIBT". */
  certifiedLabel?: string;
}) {
  if (partners.length === 0) return null;
  return (
    <section data-reveal className="bg-b-paper py-14">
      <Container>
        <SectionHead title={title} action={action} />
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {partners.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border bg-b-paper p-7"
              data-testid={`card-partner-${p.id}`}
            >
              <div className="mb-12 flex items-center justify-between gap-3">
                <span className="inline-flex h-7 items-center rounded-md bg-b-sand px-3 text-[13px] font-semibold text-muted-foreground">
                  {p.canton}
                </span>
                {certifiedLabel && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-b-link">
                    <BadgeCheck className="size-[15px]" aria-hidden />
                    {certifiedLabel}
                  </span>
                )}
              </div>
              <p className="mb-2 text-[17px] font-semibold leading-[1.35]">
                {p.name}
              </p>
              {p.meta && (
                <p className="text-[15px] text-muted-foreground">{p.meta}</p>
              )}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
