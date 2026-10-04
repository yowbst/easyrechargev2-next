"use client";

import type { LucideIcon } from "lucide-react";
import { BadgeCheck, ClipboardCheck, FileCheck, Gift, Landmark, Pencil, PhoneCall, Star } from "lucide-react";
import type { PublicQuoteConfig } from "@/lib/public-config";
import type { FormValues, ProductFunnel, StepProps } from "./types";

export interface SubsidySummary {
  locality: string;
  available: boolean;
  maxChf: number | null;
}

export interface PartnerOffer {
  active?: boolean;
  currency?: string;
  amount?: number;
  network?: string;
}

type T = StepProps["tc"];

interface RailRow {
  icon: LucideIcon;
  main: string;
  sub?: string;
}

const slaVars = (gc: PublicQuoteConfig) => ({
  first_contact: gc.slas?.first_contact?.value ?? 48,
  quote_delivery_timeline: gc.slas?.quote_delivery_timeline?.value ?? "3-5",
});

/** The subsidy line: an amount when the commune states one, else a general promise. */
export function subsidyLine(tc: T, subsidy: SubsidySummary | null): string {
  if (subsidy?.maxChf) return tc("quote.rail.subsidy", { locality: subsidy.locality, amount: subsidy.maxChf.toLocaleString("fr-CH") });
  if (subsidy?.available) return tc("quote.rail.subsidyAvailable", { locality: subsidy.locality });
  return tc("quote.rail.subsidyFallback");
}

/** "What you get" rows (design 15 v2): subsidy, installers, delay, then the partner offer. */
function benefitRows(tc: T, tq: StepProps["tq"], gc: PublicQuoteConfig, subsidy: SubsidySummary | null, offer?: PartnerOffer): RailRow[] {
  const sla = slaVars(gc);
  const partners = (gc.stats as { partners?: number } | undefined)?.partners;
  const rows: RailRow[] = [
    { icon: Landmark, main: subsidyLine(tc, subsidy), sub: tc("quote.rail.subsidySub") },
    {
      icon: BadgeCheck,
      // A count of one reads as a weakness: below two, the line names no number.
      main: partners && partners >= 2 ? tc("quote.rail.installers", { count: partners }) : tc("quote.rail.installersGeneric"),
      sub: tc("quote.rail.installersSub", sla),
    },
    { icon: FileCheck, main: tc("quote.rail.delay", sla), sub: tc("quote.rail.delaySub") },
  ];
  if (offer && offer.active !== false && offer.amount) {
    const vars = { currency: offer.currency || "CHF", amount: offer.amount, network: offer.network || "" };
    rows.push({ icon: Gift, main: tq("welcome.offer.title", vars), sub: tq("welcome.offer.description", vars) });
  }
  return rows;
}

/** "What happens next" rows, on the last step. */
function nextRows(tc: T, gc: PublicQuoteConfig): RailRow[] {
  const sla = slaVars(gc);
  return [
    { icon: PhoneCall, main: `1 · ${tc("quote.rail.next.1")}`, sub: tc("quote.rail.next.1sub", sla) },
    { icon: ClipboardCheck, main: `2 · ${tc("quote.rail.next.2")}`, sub: tc("quote.rail.next.2sub", sla) },
    { icon: FileCheck, main: `3 · ${tc("quote.rail.next.3")}`, sub: tc("quote.rail.next.3sub", sla) },
  ];
}

export interface AnswerRow {
  stepId: string;
  field: string;
  label: string;
  value: string;
}

/** Answers of the steps already done, as label → value, for the side panel. */
export function answerRows(funnel: ProductFunnel, done: string[], data: FormValues, tq: StepProps["tq"], tqOpt: StepProps["tqOpt"]): AnswerRow[] {
  const rows: AnswerRow[] = [];
  for (const step of funnel.steps) {
    if (!done.includes(step.id)) continue;
    for (const field of step.summary ?? []) {
      const v = data[field];
      if (v === null || v === undefined || v === "") continue;
      const base = `steps.${step.id}.fields.${field}`;
      const value =
        funnel.formatAnswer?.(field, v, tq) ??
        (v === "na"
          ? tq("common.dontKnow")
          : typeof v === "string"
            ? (tqOpt(`${base}.options.${v}`) ?? v)
            : String(v));
      let label = tqOpt(`${base}.short`) ?? tq(`${base}.label`);
      // Two "Statut" rows (housing, vehicle) read as one: the step title tells them apart.
      if (rows.some((r) => r.label === label)) label = tq(`steps.${step.id}.title`);
      rows.push({ stepId: step.id, field, label, value });
    }
  }
  return rows;
}

function Rows({ rows }: { rows: RailRow[] }) {
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map(({ icon: Icon, main, sub }) => (
        <li key={main} className="flex items-start gap-3">
          <Icon className="mt-0.5 size-4.5 shrink-0 text-b-signal" aria-hidden />
          <div>
            <div className="text-base leading-snug font-semibold">{main}</div>
            {sub && <div className="text-sm leading-snug text-b-on-forest/75">{sub}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Side panel of the quote funnels (design 15 v2), desktop only: what the
 * visitor gets (or, on the last step, what happens next), their answers so far
 * with a link back to each question, and the rating.
 */
export function Rail({ tc, tq, gc, subsidy, offer, last, answers, onEdit }: {
  tc: T;
  tq: StepProps["tq"];
  gc: PublicQuoteConfig;
  subsidy: SubsidySummary | null;
  offer?: PartnerOffer;
  last: boolean;
  answers: AnswerRow[];
  onEdit: (stepId: string, field: string) => void;
}) {
  const score = gc.trustpilot?.score;
  const installations = gc.stats?.installations;

  return (
    <aside className="sticky top-6 flex flex-col gap-4 pb-10" aria-label={tc(last ? "quote.rail.next.title" : "quote.rail.title")}>
      <div className="rounded-xl bg-b-forest p-6 text-b-on-forest">
        <h2 className="mb-3.5 text-[13px] font-semibold tracking-widest text-b-on-forest/70 uppercase">
          {tc(last ? "quote.rail.next.title" : "quote.rail.title")}
        </h2>
        <Rows rows={last ? nextRows(tc, gc) : benefitRows(tc, tq, gc, subsidy, offer)} />
      </div>

      {answers.length > 0 && (
        <div className="rounded-xl bg-b-sand px-5.5 py-5">
          <h2 className="mb-2.5 text-[13px] font-semibold tracking-widest text-muted-foreground uppercase">{tc("quote.rail.answers")}</h2>
          <dl className="flex flex-col">
            {answers.map((a) => (
              <div key={a.field} className="flex justify-between gap-3 border-t border-border py-2 text-sm">
                <dt className="text-muted-foreground">{a.label}</dt>
                <dd className="flex items-center gap-2 text-right font-semibold">
                  {a.value}
                  <a
                    href={`?step=${a.stepId}#q-${a.field}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onEdit(a.stepId, a.field);
                    }}
                    aria-label={`${tc("quote.rail.edit")} : ${a.label}`}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-b-link hover:bg-b-inset"
                  >
                    <Pencil className="size-[13px]" aria-hidden />
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {score != null && installations != null && (
        <p className="flex items-center gap-2.5 px-1 text-sm text-muted-foreground">
          <span className="flex gap-0.5" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="size-3.5 fill-b-charge text-b-charge" />
            ))}
          </span>
          {tc("quote.rail.rating", { score, installations })}
        </p>
      )}
    </aside>
  );
}
