"use client";

import { Field, Section } from "./SubmissionFields";
import { BATTERY_BUCKETS } from "@/components/quote-shell/products/battery/buckets";

interface Props {
  fd: Record<string, unknown>;
  /** pages.quote-battery.<key>, "" when missing */
  tb: (key: string) => string;
  yes: string;
  no: string;
  dontKnow: string;
  printSections: Record<string, boolean>;
  /** Battery request added in the charger funnel: only the shared answers and PV size were asked. */
  addon?: { origin: string; toComplete: string } | null;
}

const DASH = "—";

function withUnit(n: number, unit: string) {
  return unit ? `${n.toLocaleString("fr-CH")} ${unit}` : n.toLocaleString("fr-CH");
}

function bucketLabel(field: keyof typeof BATTERY_BUCKETS, v: unknown, unit: string, dontKnow: string): string {
  if (v === "na") return dontKnow;
  if (typeof v !== "number") return DASH;
  const b = BATTERY_BUCKETS[field].find((x) => x.value === v);
  return b ? b.label.replace("{u}", unit ? ` ${unit}` : "") : withUnit(v, unit);
}

export function BatterySubmissionSections({ fd, tb, yes, no, dontKnow, printSections, addon }: Props) {
  const opt = (path: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return DASH;
    if (v === true) return yes;
    if (v === false) return no;
    return tb(`${path}.options.${v}`) || String(v);
  };
  const label = (path: string, fallback: string) => tb(`${path}.label`) || fallback;
  const H = "steps.housing.fields";
  const P = "steps.pv.fields";
  const C = "steps.consumption.fields";

  const pvPower = fd.pvPowerExact && typeof fd.pvPower === "number"
    ? withUnit(fd.pvPower, "kWc")
    : bucketLabel("pvPower", fd.pvPower, "kWc", dontKnow);
  const evCount = typeof fd.evCount === "number" ? fd.evCount : null;

  if (addon) {
    return (
      <>
        <Section title={tb("steps.housing.title") || "Logement"} printVisible={printSections.housing}>
          <p className="pb-2 text-sm font-medium text-primary" data-testid="text-addon-origin">{addon.origin}</p>
          <Field label={label(`${H}.housingStatus`, "Statut")} value={opt(`${H}.housingStatus`, fd.housingStatus)} />
          <Field label={label(`${H}.housingType`, "Type de logement")} value={opt(`${H}.housingType`, fd.housingType)} />
          <Field label={label(`${H}.solarEquipment`, "Installation solaire")} value={opt(`${H}.solarEquipment`, fd.solarEquipment)} />
          {!!fd.deadline && <Field label={label(`${C}.deadline`, "Délai")} value={opt(`${C}.deadline`, fd.deadline)} />}
        </Section>

        <Section title={tb("steps.pv.title") || "Installation solaire"} printVisible={printSections.installation}>
          <Field label={label(`${P}.pvPower`, "Puissance")} value={pvPower} />
          <p className="pt-2 text-sm text-muted-foreground" data-testid="text-addon-to-complete">{addon.toComplete}</p>
        </Section>
      </>
    );
  }

  return (
    <>
      <Section title={tb("steps.housing.title") || "Logement"} printVisible={printSections.housing}>
        <Field label={label(`${H}.housingStatus`, "Statut")} value={opt(`${H}.housingStatus`, fd.housingStatus)} />
        <Field label={label(`${H}.housingType`, "Type de logement")} value={opt(`${H}.housingType`, fd.housingType)} />
        <Field label={label(`${H}.solarEquipment`, "Installation solaire")} value={opt(`${H}.solarEquipment`, fd.solarEquipment)} />
      </Section>

      <Section title={tb("steps.pv.title") || "Installation solaire"} printVisible={printSections.installation}>
        <Field label={label(`${P}.pvPower`, "Puissance")} value={pvPower} />
        <Field label={label(`${P}.inverterBrand`, "Onduleur")} value={opt(`${P}.inverterBrand`, fd.inverterBrand)} />
        <Field label={label(`${P}.existingBattery`, "Batterie existante")} value={opt(`${P}.existingBattery`, fd.existingBattery)} />
      </Section>

      <Section title={tb("steps.consumption.title") || "Consommation"} printVisible={printSections.consumption}>
        <Field label={label(`${C}.householdCount`, "Ménages")} value={bucketLabel("householdCount", fd.householdCount, "", dontKnow)} />
        {fd.householdCount === 1 && (
          <Field label={label(`${C}.householdSize`, "Personnes")} value={bucketLabel("householdSize", fd.householdSize, "", dontKnow)} />
        )}
        {fd.annualConsumptionExact === true && typeof fd.annualConsumption === "number" && (
          <Field label={label(`${C}.annualConsumption`, "Consommation annuelle")} value={withUnit(fd.annualConsumption, "kWh")} />
        )}
        <Field label={label(`${C}.heatPump`, "Pompe à chaleur")} value={opt(`${C}.heatPump`, fd.heatPump)} />
        <Field label={label(`${C}.evCount`, "Véhicules électriques")} value={bucketLabel("evCount", fd.evCount, "", dontKnow)} />
        {evCount === 0 && <Field label={label(`${C}.evPlanned`, "Véhicule prévu")} value={opt(`${C}.evPlanned`, fd.evPlanned)} />}
        {evCount !== null && evCount >= 1 && <Field label={label(`${C}.hasCharger`, "Borne existante")} value={opt(`${C}.hasCharger`, fd.hasCharger)} />}
        <Field label={label(`${C}.deadline`, "Délai")} value={opt(`${C}.deadline`, fd.deadline)} />
      </Section>
    </>
  );
}
