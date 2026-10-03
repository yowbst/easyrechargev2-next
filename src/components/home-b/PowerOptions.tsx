import { Clock } from "lucide-react";
import { Container } from "./Shell";

export interface PowerOption {
  id: string;
  /** Headline figure, e.g. "11 kW". */
  kw: string;
  /** Short qualifier chip, e.g. "Recommandé". */
  tag?: string;
  /** Marks the option we steer most households to. */
  recommended?: boolean;
  title: string;
  body: string;
  /** Charge time for the reference battery. */
  time?: string;
}

/**
 * "Quelle puissance pour votre voiture ?" — three options with the charge time
 * each implies, so the choice is made on a number rather than on a name.
 */
export function PowerOptions({
  title,
  aside,
  options,
  note,
}: {
  title: string;
  /** Reference condition for the times, e.g. "batterie de 60 kWh". */
  aside?: string;
  options: PowerOption[];
  note?: string;
}) {
  if (options.length === 0) return null;
  return (
    <section data-reveal className="bg-b-paper py-14">
      <Container>
        <div className="rounded-xl bg-b-sand p-8 md:p-11">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-x-12 gap-y-3">
            <h2 className="type-h2">
              {title}
            </h2>
            {aside && (
              <span className="shrink-0 text-[15px] text-muted-foreground">
                {aside}
              </span>
            )}
          </div>

          <ul className="grid gap-6 md:grid-cols-3">
            {options.map((o) => (
              <li
                key={o.id}
                className={`rounded-xl bg-b-paper p-7 ${
                  o.recommended
                    ? "border-[1.5px] border-b-charge"
                    : "border-[1.5px] border-transparent"
                }`}
                data-testid={`card-power-${o.id}`}
              >
                <div className="mb-5 flex items-baseline justify-between gap-4">
                  <span className="font-heading text-[2rem] font-semibold leading-none tracking-[-0.04em]">
                    {o.kw}
                  </span>
                  {o.tag && (
                    <span
                      className={`inline-flex h-[26px] shrink-0 items-center rounded-md px-3 text-[13px] font-semibold ${
                        o.recommended
                          ? "bg-b-charge text-b-on-charge"
                          : "bg-b-sand text-muted-foreground"
                      }`}
                    >
                      {o.tag}
                    </span>
                  )}
                </div>
                <h3 className="mb-2 text-[17px] font-semibold leading-[1.3]">
                  {o.title}
                </h3>
                <p className="mb-5 text-[15px] leading-[1.6] text-muted-foreground">
                  {o.body}
                </p>
                {o.time && (
                  <p className="flex items-center gap-2 border-t pt-4 text-[15px] text-muted-foreground">
                    <Clock className="size-[15px] shrink-0" aria-hidden />
                    {o.time}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {note && (
            <p className="mt-7 text-[15px] leading-[1.6] text-muted-foreground">
              {note}
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}
