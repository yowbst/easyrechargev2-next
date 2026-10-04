"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { IconButtonGroup } from "@/components/quote/IconButtonGroup";
import { RangeButtonGroup } from "@/components/quote/RangeButtonGroup";
import { resolveBuckets } from "@/lib/quoteBuckets";
import { ENRICH_FIELDS, type EnrichField } from "@/lib/quote-enrich-fields";
import { FieldLabel } from "./FieldLabel";
import { fieldConfig } from "./pageConfig";
import type { StepProps } from "./types";

type Answers = Partial<Record<EnrichField, string | number>>;

const CHOICES: Partial<Record<EnrichField, string[]>> = {
  electricalBoardType: ["old", "recent", "na"],
  ecpProvided: ["include", "exclude"],
};
const UNIT_FIELDS: EnrichField[] = ["electricalLineDistance", "vehicleTripDistance", "vehicleChargingHours"];

/**
 * After sending (design 15 v2, 2f; flag `quote-enrich`): the six questions the
 * lean funnel dropped, all optional. Labels and buckets are the ones the old
 * form used (`steps.<former step>.fields.<field>.*`); "Later" leaves at once.
 */
export function EnrichStep({ tq, tqOpt, tc, pageConfig, onDone }: Pick<StepProps, "tq" | "tqOpt" | "tc" | "pageConfig"> & {
  onDone: (answers: Answers) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState<"save" | "later" | null>(null);
  const set = (field: EnrichField, value: string | number) => setAnswers((a) => ({ ...a, [field]: value }));
  const finish = async (mode: "save" | "later") => {
    setBusy(mode);
    await onDone(mode === "save" ? answers : {});
  };

  return (
    <>
      <h1 className="mb-8 font-heading text-[26px] leading-tight font-semibold tracking-tight md:text-4xl">{tc("steps.enrich.title")}</h1>
      <div className="flex flex-col gap-8">
        {(Object.keys(ENRICH_FIELDS) as EnrichField[]).map((field) => {
          const step = ENRICH_FIELDS[field].step;
          const k = `steps.${step}.fields.${field}`;
          const label = tq(`${k}.label`);
          const help = tc(`steps.enrich.fields.${field}.why`);
          const choices = CHOICES[field];
          if (choices) {
            return (
              <div key={field} id={`q-${field}`}>
                <FieldLabel label={label} help={help} />
                <IconButtonGroup
                  label={label}
                  cols={choices.length}
                  options={choices.map((v) => ({ value: v, label: tq(`${k}.options.${v}`) }))}
                  value={String(answers[field] ?? "")}
                  onChange={(v) => set(field, v)}
                />
              </div>
            );
          }
          const unit = UNIT_FIELDS.includes(field) ? (tqOpt(`${k}.unit`) ?? "") : "";
          return (
            <div key={field} id={`q-${field}`}>
              <RangeButtonGroup
                value={(answers[field] as number | "na" | undefined) ?? null}
                onChange={(v) => set(field, v)}
                options={resolveBuckets(field, fieldConfig(pageConfig, step, field).buckets, unit)}
                label={label}
                help={help}
                naLabel={tqOpt(`${k}.na`) ?? tqOpt(`${k}.checkboxLabel`) ?? tq("common.dontKnow")}
                testId={field}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => finish("save")}
          disabled={busy !== null || Object.keys(answers).length === 0}
          aria-busy={busy === "save"}
          className="inline-flex h-12 items-center gap-2 rounded-md bg-b-forest px-5 text-[15px] font-semibold text-b-on-forest disabled:opacity-50 dark:bg-b-on-forest dark:text-b-forest"
          data-testid="button-enrich-save"
        >
          {busy === "save" && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {tc("steps.enrich.save")}
        </button>
        <button
          type="button"
          onClick={() => finish("later")}
          disabled={busy !== null}
          className="inline-flex h-12 items-center px-4 text-[15px] font-semibold text-muted-foreground underline underline-offset-3"
          data-testid="button-enrich-later"
        >
          {tc("steps.enrich.later")}
        </button>
      </div>
    </>
  );
}
