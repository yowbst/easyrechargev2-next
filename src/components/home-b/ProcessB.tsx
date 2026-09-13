import { Container, SectionTitle } from "./Shell";

export interface ProcessStepB {
  id: string;
  /** Zero-padded ordinal, e.g. "01". */
  n: string;
  /** Time commitment badge, e.g. "SOUS 48 H". Optional. */
  sla?: string;
  title: string;
  body: string;
}

/**
 * The forest-green process band — the one dark section on the page, which is
 * what makes the four SLA badges read as commitments rather than decoration.
 */
export function ProcessB({
  title,
  lede,
  steps,
}: {
  title: string;
  lede?: string;
  steps: ProcessStepB[];
}) {
  if (steps.length === 0) return null;
  return (
    <section
      data-reveal
      className="rounded-t-xl bg-b-forest py-20 text-b-on-forest"
    >
      <Container>
        <div className="mb-12 grid items-end gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
          <SectionTitle>{title}</SectionTitle>
          {lede && (
            <p className="max-w-[34rem] text-[17px] leading-[1.65] opacity-75">
              {lede}
            </p>
          )}
        </div>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li
              key={s.id}
              className="rounded-xl bg-[color-mix(in_srgb,var(--b-on-forest)_7%,transparent)] p-8"
              data-testid={`step-${s.id}`}
            >
              <div className="mb-10 flex items-center justify-between gap-3">
                <span className="font-heading text-[2rem] font-semibold tracking-[-0.04em] opacity-30">
                  {s.n}
                </span>
                {s.sla && (
                  <span className="inline-flex h-[26px] items-center rounded-md bg-[color-mix(in_srgb,var(--b-signal)_15%,transparent)] px-3 text-[13px] font-semibold text-b-signal">
                    {s.sla}
                  </span>
                )}
              </div>
              <h3 className="mb-2.5 text-[17px] font-semibold leading-[1.35]">
                {s.title}
              </h3>
              <p className="text-[15px] leading-[1.6] opacity-75">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
