"use client";

import { useMemo } from "react";
import { Clock, ShieldCheck, ShieldX } from "lucide-react";
import { IconButtonGroup, type IconButtonOption } from "@/components/quote/IconButtonGroup";
import { FieldLabel } from "./FieldLabel";
import { fieldConfig, tooltipImageUrl } from "./pageConfig";
import type { StepProps } from "./types";

type ApprovalCase = { label: string; options: { value: string; label: string }[] };

// Keys stay under `steps.finalize.*`: the translations already exist there and
// the request page reads the same labels.
const APPROVAL_DEFAULTS: Record<string, ApprovalCase> = {
  tenant: {
    label: "steps.finalize.fields.approval.tenant.label",
    options: [
      { value: "yes", label: "steps.finalize.fields.approval.tenant.options.yes" },
      { value: "in-progress", label: "steps.finalize.fields.approval.tenant.options.in-progress" },
      { value: "no", label: "steps.finalize.fields.approval.tenant.options.no" },
    ],
  },
  "co-owner": {
    label: "steps.finalize.fields.approval.co-owner.label",
    options: [
      { value: "yes", label: "steps.finalize.fields.approval.co-owner.options.yes" },
      { value: "in-progress", label: "steps.finalize.fields.approval.co-owner.options.in-progress" },
      { value: "no", label: "steps.finalize.fields.approval.co-owner.options.no" },
    ],
  },
};

const APPROVAL_ICONS = { yes: ShieldCheck, "in-progress": Clock, no: ShieldX } as const;

/**
 * Landlord / co-ownership approval. Asked in the housing step (v2) rather
 * than at the end: it belongs with the housing answers and it frees the last
 * screen for the contact details alone. Optional, as it always was.
 */
export function ApprovalField({ data, set, tq, tqOpt, pageConfig }: StepProps) {
  const housingStatus = typeof data.housingStatus === "string" ? data.housingStatus : "";
  const approval = useMemo(() => {
    if (!housingStatus) return null;
    const conditional = fieldConfig(pageConfig, "finalize", "approval").conditional as { cases?: Record<string, ApprovalCase> } | undefined;
    return (conditional?.cases ?? APPROVAL_DEFAULTS)[housingStatus] ?? null;
  }, [pageConfig, housingStatus]);
  if (!approval) return null;

  const options: IconButtonOption[] = approval.options.map((o) => ({
    value: o.value,
    label: tq(o.label),
    icon: APPROVAL_ICONS[o.value as keyof typeof APPROVAL_ICONS] ?? ShieldCheck,
  }));

  return (
    <div id="q-approval">
      <FieldLabel
        label={tq(approval.label)}
        help={tqOpt(`steps.finalize.fields.approval.${housingStatus}.why`)}
        tooltip={tqOpt(`steps.finalize.fields.approval.${housingStatus}.tooltip`)}
        image={tooltipImageUrl(pageConfig, "finalize", "approval")}
      />
      <IconButtonGroup label={tq(approval.label)} options={options} value={String(data.approval ?? "")} onChange={(v) => set("approval", v)} />
    </div>
  );
}
