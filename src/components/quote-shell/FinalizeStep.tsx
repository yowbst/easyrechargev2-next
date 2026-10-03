"use client";

import { useMemo } from "react";
import { Clock, MessageSquare, ShieldCheck, ShieldX } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { IconButtonGroup, type IconButtonOption } from "@/components/quote/IconButtonGroup";
import { FieldLabel } from "./FieldLabel";
import { fieldConfig, tooltipImageUrl } from "./pageConfig";
import type { FormValues } from "./types";

type ApprovalCase = { label: string; options: { value: string; label: string }[] };

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

interface FinalizeStepProps {
  data: FormValues;
  set: (field: string, value: unknown) => void;
  tq: (key: string, vars?: Record<string, string | number>) => string;
  tqOpt: (key: string) => string | undefined;
  lang: string;
  pageConfig: Record<string, unknown>;
}

export function FinalizeStep({ data, set, tq, tqOpt, lang, pageConfig }: FinalizeStepProps) {
  const housingStatus = typeof data.housingStatus === "string" ? data.housingStatus : "";
  const approval = useMemo(() => {
    if (!housingStatus) return null;
    const conditional = fieldConfig(pageConfig, "finalize", "approval").conditional as { cases?: Record<string, ApprovalCase> } | undefined;
    return (conditional?.cases ?? APPROVAL_DEFAULTS)[housingStatus] ?? null;
  }, [pageConfig, housingStatus]);

  const approvalOptions: IconButtonOption[] = (approval?.options ?? []).map((o) => ({
    value: o.value,
    label: tq(o.label),
    icon: APPROVAL_ICONS[o.value as keyof typeof APPROVAL_ICONS] ?? ShieldCheck,
  }));
  const privacyNote = tq("steps.finalize.fields.acceptTerms.privacyNote").split("{privacyLink}");

  return (
    <>
      {approval && (
        <div id="q-approval">
          <FieldLabel
            icon={ShieldCheck}
            label={tq(approval.label)}
            tooltip={tqOpt(`steps.finalize.fields.approval.${housingStatus}.tooltip`)}
            image={tooltipImageUrl(pageConfig, "finalize", "approval")}
          />
          <IconButtonGroup options={approvalOptions} value={String(data.approval ?? "")} onChange={(v) => set("approval", v)} />
        </div>
      )}

      <div>
        <FieldLabel icon={MessageSquare} label={tq("steps.finalize.fields.comment.label")} htmlFor="comment" />
        <Textarea
          id="comment"
          placeholder={tq("steps.finalize.fields.comment.placeholder")}
          value={String(data.comment ?? "")}
          onChange={(e) => set("comment", e.target.value)}
          rows={4}
          className="resize-none"
          data-testid="textarea-comment"
        />
      </div>

      <div id="q-acceptTerms" className="space-y-2">
        <label
          htmlFor="acceptTerms"
          className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
            data.acceptTerms ? "border-primary/30 bg-primary/5" : "border-border/60 bg-muted/40 hover:border-primary/30 hover:bg-muted/60"
          }`}
        >
          <Checkbox
            id="acceptTerms"
            checked={data.acceptTerms === true}
            onCheckedChange={(checked) => set("acceptTerms", !!checked)}
            className="shrink-0"
            data-testid="checkbox-accept-terms"
          />
          <p className="text-sm leading-relaxed">{tq("steps.finalize.fields.acceptTerms.label")}</p>
        </label>
        <p className="text-xs text-muted-foreground px-1">
          {privacyNote[0]}
          <a href={`/${lang}/privacy`} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            {tq("steps.finalize.fields.acceptTerms.privacyLink")}
          </a>
          {privacyNote[1]}
        </p>
      </div>
    </>
  );
}
