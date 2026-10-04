"use client";

import {
  ArrowDownToLine, Ban, BatteryCharging, Box, Building2, CalendarCheck, CalendarClock, CalendarDays,
  CarFront, Clock, HelpCircle, Home, Hourglass, Key, Search, Sun, Umbrella, Users, Warehouse, Zap,
} from "lucide-react";
import { IconButtonGroup, type IconButtonOption } from "@/components/quote/IconButtonGroup";
import { RevealField } from "../../RevealField";
import { FieldLabel } from "../../FieldLabel";
import { ApprovalField } from "../../ApprovalField";
import { optionTooltipImageUrl, tooltipImageUrl } from "../../pageConfig";
import type { StepProps } from "../../types";
import { PARKING_MAIN, parkingMain, type EcpFields } from "./fields";
import { asksApproval, hasSolar, showsNeighborhoodEquipment } from "./validation";

const F = (step: string, field: string) => `steps.${step}.fields.${field}`;

/** Tiles of one question, with each option's tooltip (`optionTooltips.<value>`) when Directus has one. */
function options(props: StepProps, step: string, field: string, list: [string, IconButtonOption["icon"]][], labelKey = "options"): IconButtonOption[] {
  const { tq, tqOpt, pageConfig } = props;
  return list.map(([value, icon]) => ({
    value,
    label: tq(`${F(step, field)}.${labelKey}.${value}`),
    icon,
    tooltip: tqOpt(`${F(step, field)}.optionTooltips.${value}`),
    image: optionTooltipImageUrl(pageConfig, step, field, value),
  }));
}

/** One single-choice question: label + why + tiles, anchored at `#q-<field>`. */
function Question({ step, field, list, value, onChange, props, cols, disabledValues, sub }: {
  step: string;
  field: string;
  list: [string, IconButtonOption["icon"]][];
  value: string;
  onChange: (v: string) => void;
  props: StepProps;
  cols?: number;
  disabledValues?: string[];
  /** Follow-up question: indented under the one it depends on. */
  sub?: boolean;
}) {
  const { tq, tqOpt, pageConfig, hidden } = props;
  if (hidden.has(field)) return null;
  const k = F(step, field);
  return (
    <div id={`q-${field}`} className={sub ? "border-l-2 border-b-charge/30 pl-5" : undefined}>
      <FieldLabel label={tq(`${k}.label`)} help={tqOpt(`${k}.why`)} tooltip={tqOpt(`${k}.tooltip`)} image={tooltipImageUrl(pageConfig, step, field)} />
      <IconButtonGroup
        label={tq(`${k}.label`)}
        options={options(props, step, field, list)}
        value={value}
        onChange={onChange}
        cols={cols}
        disabledValues={disabledValues}
      />
    </div>
  );
}

const STATUS = (d: Partial<EcpFields>) => d.housingStatus ?? "";

export function HousingStep(props: StepProps) {
  const { data, set } = props;
  const d = data as Partial<EcpFields>;
  const solar = hasSolar(d);
  const neighborhood = showsNeighborhoodEquipment(d);
  const solarDone = !!d.solarEquipment && (!solar || !!d.homeBattery);

  return (
    <>
      <Question step="housing" field="housingStatus" props={props} value={STATUS(d)} onChange={(v) => set("housingStatus", v)}
        list={[["owner", Home], ["co-owner", Building2], ["tenant", Key]]} />

      <RevealField visible={!!d.housingStatus}>
        <Question step="housing" field="housingType" props={props} value={d.housingType ?? ""} onChange={(v) => set("housingType", v)}
          list={[["house", Home], ["apartment", Building2], ["other", Warehouse]]}
          disabledValues={d.housingStatus === "owner" ? ["apartment"] : []} />
      </RevealField>

      <RevealField visible={!!d.housingStatus && !!d.housingType}>
        <Question step="housing" field="solarEquipment" props={props} value={d.solarEquipment ?? ""} onChange={(v) => set("solarEquipment", v)}
          list={[["exists", Sun], ["in-progress", Hourglass], ["none", Ban]]} />
      </RevealField>

      <RevealField visible={solar}>
        <Question step="housing" field="homeBattery" props={props} sub value={d.homeBattery ?? ""} onChange={(v) => set("homeBattery", v)}
          list={[["exists", BatteryCharging], ["in-progress", Hourglass], ["none", Ban]]} />
      </RevealField>

      <RevealField visible={neighborhood && solarDone}>
        <Question step="housing" field="neighborhoodEquipment" props={props} sub value={d.neighborhoodEquipment ?? ""} onChange={(v) => set("neighborhoodEquipment", v)}
          list={[["exists", Users], ["in-progress", Hourglass], ["none", Ban]]} />
      </RevealField>

      <RevealField visible={asksApproval(d) && solarDone && (!neighborhood || !!d.neighborhoodEquipment) && !props.hidden.has("approval")}>
        <ApprovalField {...props} />
      </RevealField>
    </>
  );
}

export function ParkingStep(props: StepProps) {
  const { data, set, tq } = props;
  const d = data as Partial<EcpFields>;
  const main = parkingMain(d.parkingSpotLocation ?? "");
  const MAIN_ICONS: Record<string, IconButtonOption["icon"]> = { exterior: Sun, garage: Warehouse, covered: Umbrella, underground: ArrowDownToLine };
  const k = F("parking", "parkingSpotLocation");
  if (props.hidden.has("parkingSpotLocation")) return null;

  return (
    <>
      <div id="q-parkingSpotLocation">
        <FieldLabel label={tq(`${k}.label`)} help={props.tqOpt(`${k}.why`)} tooltip={props.tqOpt(`${k}.tooltip`)} image={tooltipImageUrl(props.pageConfig, "parking", "parkingSpotLocation")} />
        <IconButtonGroup
          label={tq(`${k}.label`)}
          cols={2}
          options={options(props, "parking", "parkingSpotLocation", PARKING_MAIN.map((v) => [v, MAIN_ICONS[v]]))}
          value={main}
          // Choosing a first level keeps an already chosen second level of the same family.
          onChange={(v) => set("parkingSpotLocation", parkingMain(d.parkingSpotLocation ?? "") === v ? d.parkingSpotLocation : v)}
        />
      </div>

      {PARKING_MAIN.filter((v) => v !== "underground").map((family) => (
        <RevealField key={family} visible={main === family}>
          <div className="border-l-2 border-b-charge/30 pl-5">
            <FieldLabel label={tq(`${k}.options.${family}`)} help={props.tqOpt(`${k}.subWhy`)} />
            <IconButtonGroup
              label={tq(`${k}.options.${family}`)}
              cols={2}
              options={options(props, "parking", "parkingSpotLocation", [[`${family}-adjacent`, Home], [`${family}-standalone`, Box]])}
              value={d.parkingSpotLocation ?? ""}
              onChange={(v) => set("parkingSpotLocation", v)}
            />
          </div>
        </RevealField>
      ))}
    </>
  );
}

export function ChargerStep(props: StepProps) {
  const { data, set, tq } = props;
  const d = data as Partial<EcpFields>;
  const countOptions: [string, IconButtonOption["icon"]][] = [["1", undefined], ["2", undefined], ["3+", undefined]];

  return (
    <>
      {!props.hidden.has("parkingSpotCount") && (
        <div id="q-parkingSpotCount">
          <FieldLabel label={tq(`${F("charger", "parkingSpotCount")}.label`)} help={props.tqOpt(`${F("charger", "parkingSpotCount")}.why`)} />
          <IconButtonGroup
            label={tq(`${F("charger", "parkingSpotCount")}.label`)}
            options={countOptions.map(([v]) => ({
              value: v,
              // The translation is the noun only ("véhicule(s)"): the count leads.
              // Option keys use "3plus" — "+" is not a safe Directus key.
              label: `${v} ${tq(`${F("charger", "parkingSpotCount")}.options.${v === "3+" ? "3plus" : v}`)}`,
            }))}
            value={d.parkingSpotCount ?? ""}
            onChange={(v) => set("parkingSpotCount", v)}
          />
        </div>
      )}

      <RevealField visible={!!d.parkingSpotCount || props.hidden.has("parkingSpotCount")}>
        <Question step="charger" field="deadline" props={props} cols={4} value={d.deadline ?? ""} onChange={(v) => set("deadline", v)}
          list={[["asap", Zap], ["2-3mo", Clock], ["3-6mo", CalendarClock], ["6+mo", CalendarDays]]} />
      </RevealField>
    </>
  );
}

export function VehicleStep(props: StepProps) {
  const { data, set } = props;
  const d = data as Partial<EcpFields>;
  return (
    <Question step="vehicle" field="vehicleStatus" props={props} cols={2} value={d.vehicleStatus ?? ""} onChange={(v) => set("vehicleStatus", v)}
      list={[["own", CarFront], ["ordered", CalendarCheck], ["want-to-order", Search], ["unknown", HelpCircle]]} />
  );
}
