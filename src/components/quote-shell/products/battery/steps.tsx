"use client";

import { useState } from "react";
import {
  Battery, BatteryCharging, Building2, CalendarClock, CalendarDays, CircleSlash, Clock, Cpu, Hammer, HelpCircle, Home, Key, Sun, Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { IconButtonGroup, type IconButtonOption } from "@/components/quote/IconButtonGroup";
import { RangeButtonGroup } from "@/components/quote/RangeButtonGroup";
import { resolveBuckets } from "@/lib/quoteBuckets";
import { RevealField } from "../../RevealField";
import { FieldLabel } from "../../FieldLabel";
import { ApprovalField } from "../../ApprovalField";
import { fieldConfig, tooltipImageUrl } from "../../pageConfig";
import type { StepProps } from "../../types";
import { BATTERY_BUCKETS } from "./buckets";
import type { BatteryFields } from "./fields";
import { parseDecimal } from "./validation";

const F = (step: string, field: string) => `steps.${step}.fields.${field}`;

function options(tq: StepProps["tq"], step: string, field: string, list: [string, IconButtonOption["icon"]][]): IconButtonOption[] {
  return list.map(([value, icon]) => ({ value, label: tq(`${F(step, field)}.options.${value}`), icon }));
}

function buckets(pageConfig: StepProps["pageConfig"], step: string, field: keyof typeof BATTERY_BUCKETS, unit: string) {
  return resolveBuckets(field, fieldConfig(pageConfig, step, field).buckets ?? BATTERY_BUCKETS[field], unit);
}

const notice = "rounded-lg border border-border/60 bg-muted/40 p-4 text-sm leading-relaxed";

export function HousingStep(props: StepProps) {
  const { data, set, tq, tqOpt, pageConfig } = props;
  const d = data as Partial<BatteryFields>;
  const tenant = d.housingStatus === "tenant";
  const label = (field: string) => (
    <FieldLabel label={tq(`${F("housing", field)}.label`)} help={tqOpt(`${F("housing", field)}.why`)} tooltip={tqOpt(`${F("housing", field)}.tooltip`)} image={tooltipImageUrl(pageConfig, "housing", field)} />
  );

  return (
    <>
      <div id="q-housingStatus">
        {label("housingStatus")}
        <IconButtonGroup
          options={options(tq, "housing", "housingStatus", [["owner", Home], ["co-owner", Building2], ["tenant", Key]])}
          value={d.housingStatus ?? ""}
          onChange={(v) => set("housingStatus", v)}
        />
      </div>

      <RevealField visible={tenant}>
        <div className={notice} role="status">{tq("steps.housing.tenantExit")}</div>
      </RevealField>

      <RevealField visible={!!d.housingStatus && !tenant}>
        <div id="q-housingType">
          {label("housingType")}
          <IconButtonGroup
            options={options(tq, "housing", "housingType", [["house", Home], ["apartment", Building2]])}
            value={d.housingType ?? ""}
            onChange={(v) => set("housingType", v)}
            disabledValues={d.housingStatus === "owner" ? ["apartment"] : []}
          />
        </div>
      </RevealField>

      <RevealField visible={!!d.housingType && !tenant}>
        <div id="q-solarEquipment">
          {label("solarEquipment")}
          <IconButtonGroup
            options={options(tq, "housing", "solarEquipment", [["exists", Sun], ["in-progress", Hammer], ["none", CircleSlash]])}
            value={d.solarEquipment ?? ""}
            onChange={(v) => set("solarEquipment", v)}
          />
        </div>
      </RevealField>

      <RevealField visible={d.solarEquipment === "none" && !tenant}>
        <div className={notice} role="status">{tq("steps.housing.noPvNote")}</div>
      </RevealField>

      {/* Co-ownership approval: asked here since the finalize step is gone (v2). */}
      <RevealField visible={d.housingStatus === "co-owner" && !!d.solarEquipment && !props.hidden.has("approval")}>
        <ApprovalField {...props} />
      </RevealField>
    </>
  );
}

/** A bucket picker that can switch to a typed exact value. */
function ExactOrBuckets({ step, field, exactField, unit, allowNa, data, set, tq, tqOpt, pageConfig }: StepProps & {
  step: string;
  field: "pvPower" | "annualConsumption";
  exactField: "pvPowerExact" | "annualConsumptionExact";
  unit: string;
  allowNa: boolean;
}) {
  const exact = data[exactField] === true;
  const value = data[field];
  const [raw, setRaw] = useState(exact && typeof value === "number" ? String(value) : "");
  const k = F(step, field);

  return (
    <div id={`q-${field}`}>
      {exact || field === "annualConsumption" ? (
        <>
          <FieldLabel label={tq(`${k}.label`)} help={tqOpt(`${k}.why`)} tooltip={tqOpt(`${k}.tooltip`)} image={tooltipImageUrl(pageConfig, step, field)} htmlFor={exact ? `${field}-exact` : undefined} />
          {exact && (
            <div className="flex items-center gap-2">
              <Input
                id={`${field}-exact`}
                inputMode="decimal"
                autoComplete="off"
                value={raw}
                onChange={(e) => { setRaw(e.target.value); set(field, parseDecimal(e.target.value)); }}
                className="max-w-40"
                data-testid={`input-${field}-exact`}
              />
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
          )}
        </>
      ) : (
        <RangeButtonGroup
          value={(value as number | "na" | null) ?? null}
          onChange={(v) => set(field, v)}
          options={buckets(pageConfig, step, field as "pvPower", unit)}
          label={tq(`${k}.label`)}
          naLabel={tq("common.dontKnow")}
          allowNa={allowNa}
          help={tqOpt(`${k}.why`)}
          tooltip={tqOpt(`${k}.tooltip`)}
          tooltipImage={tooltipImageUrl(pageConfig, step, field)}
          testId={field}
        />
      )}
      <button
        type="button"
        className="text-sm text-primary hover:underline mt-2"
        onClick={() => { setRaw(""); set(exactField, !exact); }}
        data-testid={`toggle-${field}-exact`}
      >
        {exact ? tq(`${k}.hideExact`) : tq(`${k}.showExact`)}
      </button>
      {exact && <p className="text-xs text-muted-foreground mt-1">{tq("common.precisionHint")}</p>}
    </div>
  );
}

export function PvStep(props: StepProps) {
  const { data, set, tq, tqOpt, pageConfig } = props;
  const d = data as Partial<BatteryFields>;
  const sizeAnswered = d.pvPower !== null && d.pvPower !== undefined;

  return (
    <>
      <ExactOrBuckets {...props} step="pv" field="pvPower" exactField="pvPowerExact" unit="kWc" allowNa />

      <RevealField visible={sizeAnswered}>
        <div id="q-inverterBrand">
          <FieldLabel label={tq(`${F("pv", "inverterBrand")}.label`)} help={tqOpt(`${F("pv", "inverterBrand")}.why`)} tooltip={tqOpt(`${F("pv", "inverterBrand")}.tooltip`)} image={tooltipImageUrl(pageConfig, "pv", "inverterBrand")} />
          <IconButtonGroup
            options={options(tq, "pv", "inverterBrand", [["solaredge", Cpu], ["fronius", Cpu], ["huawei", Cpu], ["sma", Cpu], ["other", Cpu], ["unknown", HelpCircle]])}
            value={d.inverterBrand ?? ""}
            onChange={(v) => set("inverterBrand", v)}
          />
        </div>
      </RevealField>

      <RevealField visible={!!d.inverterBrand}>
        <div id="q-existingBattery">
          <FieldLabel label={tq(`${F("pv", "existingBattery")}.label`)} help={tqOpt(`${F("pv", "existingBattery")}.why`)} />
          <IconButtonGroup
            options={options(tq, "pv", "existingBattery", [["none", Battery], ["extend", BatteryCharging]])}
            value={d.existingBattery ?? ""}
            onChange={(v) => set("existingBattery", v)}
          />
        </div>
      </RevealField>
    </>
  );
}

export function ConsumptionStep(props: StepProps) {
  const { data, set, tq, tqOpt, pageConfig } = props;
  const d = data as Partial<BatteryFields>;
  const k = (field: string) => F("consumption", field);
  const countDone = d.householdCount != null && (d.householdCount !== 1 || d.householdSize != null);
  const evDone = typeof d.evCount === "number" && (d.evCount === 0 ? !!d.evPlanned : !!d.hasCharger);
  const yesNo = (field: string): IconButtonOption[] => options(tq, "consumption", field, [["yes", Zap], ["no", CircleSlash]]);

  return (
    <>
      <div id="q-householdCount">
        <RangeButtonGroup
          value={d.householdCount ?? null}
          onChange={(v) => set("householdCount", v)}
          options={buckets(pageConfig, "consumption", "householdCount", "")}
          label={tq(`${k("householdCount")}.label`)}
          allowNa={false}
          help={tqOpt(`${k("householdCount")}.why`)}
          tooltip={tqOpt(`${k("householdCount")}.tooltip`)}
          tooltipImage={tooltipImageUrl(pageConfig, "consumption", "householdCount")}
          testId="householdCount"
        />
      </div>

      <RevealField visible={d.householdCount === 1}>
        <div id="q-householdSize">
          <RangeButtonGroup
            value={d.householdSize ?? null}
            onChange={(v) => set("householdSize", v)}
            options={buckets(pageConfig, "consumption", "householdSize", "")}
            label={tq(`${k("householdSize")}.label`)}
            allowNa={false}
            testId="householdSize"
          />
        </div>
      </RevealField>

      <RevealField visible={countDone}>
        <ExactOrBuckets {...props} step="consumption" field="annualConsumption" exactField="annualConsumptionExact" unit="kWh" allowNa={false} />
      </RevealField>

      <RevealField visible={countDone}>
        <div id="q-heatPump">
          <FieldLabel label={tq(`${k("heatPump")}.label`)} help={tqOpt(`${k("heatPump")}.why`)} tooltip={tqOpt(`${k("heatPump")}.tooltip`)} />
          <IconButtonGroup options={yesNo("heatPump")} value={d.heatPump ?? ""} onChange={(v) => set("heatPump", v)} />
        </div>
      </RevealField>

      <RevealField visible={!!d.heatPump}>
        <div id="q-evCount">
          <RangeButtonGroup
            value={d.evCount ?? null}
            onChange={(v) => set("evCount", v)}
            options={buckets(pageConfig, "consumption", "evCount", "")}
            label={tq(`${k("evCount")}.label`)}
            allowNa={false}
            help={tqOpt(`${k("evCount")}.why`)}
            tooltip={tqOpt(`${k("evCount")}.tooltip`)}
            testId="evCount"
          />
        </div>
      </RevealField>

      <RevealField visible={d.evCount === 0}>
        <div id="q-evPlanned" className="pl-4 border-l-2 border-primary/20">
          <FieldLabel label={tq(`${k("evPlanned")}.label`)} help={tqOpt(`${k("evPlanned")}.why`)} />
          <IconButtonGroup options={yesNo("evPlanned")} value={d.evPlanned ?? ""} onChange={(v) => set("evPlanned", v)} />
        </div>
      </RevealField>

      <RevealField visible={typeof d.evCount === "number" && d.evCount >= 1}>
        <div id="q-hasCharger" className="pl-4 border-l-2 border-primary/20">
          <FieldLabel label={tq(`${k("hasCharger")}.label`)} help={tqOpt(`${k("hasCharger")}.why`)} />
          <IconButtonGroup options={yesNo("hasCharger")} value={d.hasCharger ?? ""} onChange={(v) => set("hasCharger", v)} />
        </div>
      </RevealField>

      <RevealField visible={evDone}>
        <div id="q-deadline">
          <FieldLabel label={tq(`${k("deadline")}.label`)} help={tqOpt(`${k("deadline")}.why`)} />
          <IconButtonGroup
            options={options(tq, "consumption", "deadline", [["asap", Zap], ["2-3mo", Clock], ["3-6mo", CalendarClock], ["6+mo", CalendarDays]])}
            value={d.deadline ?? ""}
            onChange={(v) => set("deadline", v)}
          />
        </div>
      </RevealField>
    </>
  );
}
