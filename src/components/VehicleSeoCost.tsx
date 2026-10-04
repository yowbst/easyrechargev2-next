"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Fuel, Zap, Home, BatteryCharging, Sun, Calendar } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CostEstimate } from "@/lib/vehicle-content";
import { interpolate } from "@/lib/i18n/vehicle-content-strings";

function InlineInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  unit,
  width,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (raw: string) => void;
  onBlur: () => void;
  unit: string;
  width: string;
}) {
  return (
    <div className="flex h-13 w-full items-center justify-between gap-3 rounded-lg border bg-card pr-2 pl-4 sm:w-auto sm:justify-start">
      <label htmlFor={id} className="whitespace-nowrap text-[15px] text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            if (/^\d*\.?\d*$/.test(e.target.value)) onChange(e.target.value);
          }}
          onBlur={onBlur}
          className={`${width} h-10 min-w-16 rounded-md border bg-b-paper px-2.5 text-right text-[15px] font-semibold tabular-nums outline-none focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring`}
        />
        <span className="whitespace-nowrap text-sm text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  amount,
  period,
  detail,
  variant = "default",
  savingsLabel,
  lossLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  amount: number;
  period: string;
  detail?: string;
  variant?: "default" | "primary" | "savings";
  savingsLabel?: string;
  lossLabel?: string;
}) {
  // "savings" variant: green if positive, red if negative
  const isPositive = amount >= 0;
  const resolvedVariant = variant === "savings"
    ? (isPositive ? "success" : "loss")
    : variant;

  const styles = {
    default: "border-transparent bg-b-sand",
    primary: "border-b-charge bg-b-charge/10",
    success: "border-b-charge bg-b-charge/10",
    loss: "border-[#8C1D18]/50 bg-[#8C1D18]/5",
  };
  const colorMap = {
    default: "text-b-link",
    primary: "text-b-link",
    success: "text-[#0B5C2E] dark:text-b-signal",
    loss: "text-[#8C1D18] dark:text-[#f2645a]",
  };
  const textColor = colorMap[resolvedVariant];
  const isHighlighted = resolvedVariant === "success" || resolvedVariant === "loss";
  const contextLabel = variant === "savings"
    ? (isPositive ? savingsLabel : lossLabel)
    : undefined;

  return (
    <div className={`rounded-xl border-2 p-5 ${styles[resolvedVariant]}`}>
      <div className="mb-3.5 flex items-center gap-2">
        <Icon className={`size-4 shrink-0 ${textColor}`} />
        <span className={`text-sm font-semibold leading-snug ${isHighlighted ? textColor : "text-foreground"}`}>
          {label}
        </span>
      </div>
      {contextLabel && (
        <div className={`mb-2 text-xs leading-none ${textColor}`}>{contextLabel}</div>
      )}
      <div className="flex items-baseline gap-1.5">
        <span className={`font-heading text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${isHighlighted ? textColor : ""}`}>
          {fmtN(Math.abs(amount))}
        </span>
        <span className="text-sm text-muted-foreground">
          CHF/{period}
        </span>
      </div>
      {detail && (
        <div className="mt-2 text-sm tabular-nums text-muted-foreground">{detail}</div>
      )}
    </div>
  );
}

interface CostColLabels {
  homeChargingTitle: string;
  homeChargingIntro: string;
  inputsSubtitle: string;
  inputsLabel: string;
  scenario: string;
  kwh: string;
  kwhSolar: string;
  kwhNetwork: string;
  cost: string;
  tariffLabel: string;
  tariffUnit: string;
  dailyKmLabel: string;
  dailyKmUnit: string;
  fuelPriceLabel: string;
  fuelPriceUnit: string;
  fuelConsumptionLabel: string;
  fuelConsumptionUnit: string;
  savingsTitle: string;
  savingsInputsLabel: string;
  savingsCardLabel: string;
  savingsPerMonth: string;
  savingsPerYear: string;
  vsPetrol: string;
  vsEv: string;
  networkTitle: string;
  networkHome: string;
  networkHomeDesc: string;
  networkPublicAc: string;
  networkPublicAcDesc: string;
  networkPublicDc: string;
  networkPublicDcDesc: string;
  networkSavingsVsPublic: string;
  networkIntro: string;
  savingsIntro: string;
  savingsLabel: string;
  lossLabel: string;
  solarLabel: string;
  solarUnit: string;
}

const CH = "fr-CH";
const fmtN = (n: number, decimals = 0) =>
  n.toLocaleString(CH, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export function VehicleSeoCost({
  data,
  colLabels,
}: {
  data: CostEstimate;
  colLabels: CostColLabels;
}) {
  const [tariffInput, setTariffInput] = useState(String(data.tariff));
  const [dailyKmInput, setDailyKmInput] = useState("50");
  const [hasSolar, setHasSolar] = useState(false);
  const [solarPctInput, setSolarPctInput] = useState("33");
  const [fuelPriceInput, setFuelPriceInput] = useState("1.95");
  const [fuelConsInput, setFuelConsInput] = useState("7");

  const tariff = parseFloat(tariffInput) || data.tariff;
  const dailyKm = parseInt(dailyKmInput, 10) || 50;
  const monthlyKm = dailyKm * 20;
  const solarPct = hasSolar ? Math.min(100, Math.max(0, parseFloat(solarPctInput) || 0)) : 0;
  const effectiveTariff = tariff * (1 - solarPct / 100);
  const fuelPrice = parseFloat(fuelPriceInput) || 1.95;
  const fuelCons = parseFloat(fuelConsInput) || 7;

  const rows = useMemo(() => {
    const effKwhPerKm = data.efficiency / 1000;
    const fullKwh = Math.round(data.batteryCapacity * 0.7 * 10) / 10;
    const dailyKwh = Math.round(dailyKm * effKwhPerKm * 10) / 10;
    const monthlyKwh = Math.round(monthlyKm * effKwhPerKm * 10) / 10;

    return [
      { scenario: data.labels.fullCharge, kwh: fullKwh, icon: BatteryCharging as LucideIcon },
      { scenario: interpolate(data.labels.daily, { dailyKm }), kwh: dailyKwh, icon: Zap as LucideIcon },
      { scenario: interpolate(data.labels.monthly, { monthlyKm: monthlyKm.toLocaleString("fr-CH") }), kwh: monthlyKwh, icon: Calendar as LucideIcon },
    ];
  }, [data, dailyKm, monthlyKm]);

  // Fuel vs EV savings
  const kwhPerKm = data.efficiency / 1000;
  const evMonthlyCost = monthlyKm * kwhPerKm * effectiveTariff;
  const fuelMonthlyCost = monthlyKm * (fuelCons / 100) * fuelPrice;
  const monthlySaving = fuelMonthlyCost - evMonthlyCost;
  const yearlySaving = monthlySaving * 12;

  // Network comparison (monthly cost)
  const PUBLIC_AC_TARIFF = 0.45;
  const PUBLIC_DC_TARIFF = 0.65;
  const publicAcMonthlyCost = monthlyKm * kwhPerKm * PUBLIC_AC_TARIFF;
  const publicDcMonthlyCost = monthlyKm * kwhPerKm * PUBLIC_DC_TARIFF;
  const savingsVsPublicDcYear = (publicDcMonthlyCost - evMonthlyCost) * 12;

  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto w-full max-w-[1240px] px-5 md:px-10">
          {/* Section heading */}
          <h2 className="mb-3.5 max-w-[45rem] font-heading text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] md:text-[44px]">{data.title}</h2>
          <p className="mb-8 max-w-[45rem] text-[17px] leading-relaxed text-muted-foreground">{colLabels.inputsSubtitle}</p>

          {/* Shared inputs — the assumptions every figure below depends on */}
          <div className="mb-10 rounded-xl bg-b-sand px-5 py-5 md:px-6">
          <h3 className="type-label mb-3.5 tracking-widest text-muted-foreground">{colLabels.inputsLabel}</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <InlineInput
              id="tariff-input"
              label={colLabels.tariffLabel}
              value={tariffInput}
              onChange={setTariffInput}
              onBlur={() => {
                const v = parseFloat(tariffInput);
                if (isNaN(v) || v <= 0) setTariffInput(String(data.tariff));
              }}
              unit={colLabels.tariffUnit}
              width="w-14"
            />
            <InlineInput
              id="daily-km-input"
              label={colLabels.dailyKmLabel}
              value={dailyKmInput}
              onChange={setDailyKmInput}
              onBlur={() => {
                const v = parseInt(dailyKmInput, 10);
                if (isNaN(v) || v <= 0) setDailyKmInput("50");
              }}
              unit={colLabels.dailyKmUnit}
              width="w-12"
            />
            <div className="flex h-13 w-full items-center justify-between gap-3 rounded-lg border bg-card pr-2 pl-3.5 sm:w-auto sm:justify-start">
              <label htmlFor="solar-checkbox" className="flex cursor-pointer select-none items-center gap-2 whitespace-nowrap text-[15px] text-muted-foreground">
                <input
                  id="solar-checkbox"
                  type="checkbox"
                  checked={hasSolar}
                  onChange={(e) => setHasSolar(e.target.checked)}
                  className="size-5 cursor-pointer rounded accent-[var(--b-charge,var(--primary))]"
                />
                <Sun className="size-4 text-[#A16207]" />
                {colLabels.solarLabel}
              </label>
              <div className={`flex items-center gap-1 transition-opacity ${hasSolar ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
                <input
                  id="solar-pct-input"
                  type="text"
                  inputMode="decimal"
                  value={hasSolar ? solarPctInput : "0"}
                  onChange={(e) => {
                    if (/^\d*\.?\d*$/.test(e.target.value)) setSolarPctInput(e.target.value);
                  }}
                  onBlur={() => {
                    const v = parseFloat(solarPctInput);
                    if (isNaN(v) || v < 0) setSolarPctInput("33");
                    else if (v > 100) setSolarPctInput("100");
                  }}
                  className="h-10 w-14 rounded-md border bg-b-paper px-2.5 text-right text-[15px] font-semibold tabular-nums outline-none focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring"
                />
                <span className="whitespace-nowrap text-sm text-muted-foreground">{colLabels.solarUnit}</span>
              </div>
            </div>
          </div>
          </div>

          <div className="space-y-12">
            {/* 1. Home charging cost table */}
            <div>
              <h3 className="mb-2 font-heading text-[22px] font-semibold tracking-[-0.03em] md:text-2xl">{colLabels.homeChargingTitle}</h3>
              <p className="mb-4 max-w-[45rem] text-[15px] leading-relaxed text-muted-foreground">{colLabels.homeChargingIntro}</p>
              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-xl border sm:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-b-sand hover:bg-b-sand">
                      <TableHead className="font-semibold">{colLabels.scenario}</TableHead>
                      <TableHead className={`font-semibold text-right transition-opacity ${hasSolar ? "text-[#A16207] dark:text-yellow-400" : "opacity-30"}`}>{colLabels.kwhSolar}</TableHead>
                      <TableHead className="font-semibold text-right">{colLabels.kwhNetwork}</TableHead>
                      <TableHead className="font-semibold text-right">{colLabels.cost}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => {
                      const kwhSolar = row.kwh * (solarPct / 100);
                      const kwhNetwork = row.kwh * (1 - solarPct / 100);
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm">{row.scenario}</TableCell>
                          <TableCell className={`text-right tabular-nums text-sm transition-opacity ${hasSolar ? "text-yellow-600 dark:text-yellow-400" : "opacity-30 text-muted-foreground"}`}>
                            {fmtN(kwhSolar, 1)} kWh
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtN(kwhNetwork, 1)} kWh</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-semibold">CHF {fmtN(row.kwh * effectiveTariff, 2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile stacked cards */}
              <div className="grid gap-3 sm:hidden">
                {rows.map((row, i) => {
                  const kwhSolar = row.kwh * (solarPct / 100);
                  const kwhNetwork = row.kwh * (1 - solarPct / 100);
                  return (
                    <div key={i} className="rounded-xl border bg-card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm flex items-center gap-1.5">
                          <row.icon className="size-4 shrink-0 text-b-link" />
                          {row.scenario}
                        </span>
                        <span className="font-semibold text-sm tabular-nums">CHF {fmtN(row.kwh * effectiveTariff, 2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                        <span>{colLabels.kwhNetwork}: {fmtN(kwhNetwork, 1)} kWh</span>
                        {hasSolar && (
                          <span className="text-[#A16207] dark:text-yellow-400">{colLabels.kwhSolar}: {fmtN(kwhSolar, 1)} kWh</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Network comparison */}
            <div>
              <h3 className="mb-2 font-heading text-[22px] font-semibold tracking-[-0.03em] md:text-2xl">{colLabels.networkTitle}</h3>
              <p className="mb-4 max-w-[45rem] text-[15px] leading-relaxed text-muted-foreground">{colLabels.networkIntro}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
                <StatCard
                  icon={Home}
                  label={colLabels.networkHome}
                  amount={evMonthlyCost}
                  period={colLabels.savingsPerMonth}
                  detail={solarPct > 0 ? `${effectiveTariff.toFixed(2)} CHF/kWh effectif (${solarPct}% solaire)` : `${tariff.toFixed(2)} CHF/kWh`}
                  variant="primary"
                />
                <StatCard
                  icon={Zap}
                  label={colLabels.networkPublicAc}
                  amount={publicAcMonthlyCost}
                  period={colLabels.savingsPerMonth}
                  detail={`${PUBLIC_AC_TARIFF.toFixed(2)} CHF/kWh`}
                />
                <StatCard
                  icon={BatteryCharging}
                  label={colLabels.networkPublicDc}
                  amount={publicDcMonthlyCost}
                  period={colLabels.savingsPerMonth}
                  detail={`${PUBLIC_DC_TARIFF.toFixed(2)} CHF/kWh`}
                />
                <StatCard
                  icon={Home}
                  label={colLabels.networkSavingsVsPublic}
                  amount={savingsVsPublicDcYear}
                  period={colLabels.savingsPerYear}
                  detail={`${fmtN(Math.abs(publicDcMonthlyCost - evMonthlyCost))} CHF/${colLabels.savingsPerMonth}`}
                  variant="savings"
                  savingsLabel={colLabels.savingsLabel}
                  lossLabel={colLabels.lossLabel}
                />
              </div>
            </div>

            {/* 3. Savings vs petrol */}
            <div>
              <h3 className="mb-2 font-heading text-[22px] font-semibold tracking-[-0.03em] md:text-2xl">{colLabels.savingsTitle}</h3>
              <p className="mb-4 max-w-[45rem] text-[15px] leading-relaxed text-muted-foreground">{colLabels.savingsIntro}</p>
              <h4 className="type-label mb-3 tracking-widest text-muted-foreground">{colLabels.savingsInputsLabel}</h4>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <InlineInput
                  id="fuel-price-input"
                  label={colLabels.fuelPriceLabel}
                  value={fuelPriceInput}
                  onChange={setFuelPriceInput}
                  onBlur={() => {
                    const v = parseFloat(fuelPriceInput);
                    if (isNaN(v) || v <= 0) setFuelPriceInput("1.95");
                  }}
                  unit={colLabels.fuelPriceUnit}
                  width="w-14"
                />
                <InlineInput
                  id="fuel-cons-input"
                  label={colLabels.fuelConsumptionLabel}
                  value={fuelConsInput}
                  onChange={setFuelConsInput}
                  onBlur={() => {
                    const v = parseFloat(fuelConsInput);
                    if (isNaN(v) || v <= 0) setFuelConsInput("7");
                  }}
                  unit={colLabels.fuelConsumptionUnit}
                  width="w-12"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
                <StatCard
                  icon={Fuel}
                  label={colLabels.vsPetrol}
                  amount={fuelMonthlyCost}
                  period={colLabels.savingsPerMonth}
                  detail={`${fuelPrice.toFixed(2)} CHF/L · ${fuelCons.toFixed(1)} L/100km`}
                />
                <StatCard
                  icon={Zap}
                  label={colLabels.vsEv}
                  amount={evMonthlyCost}
                  period={colLabels.savingsPerMonth}
                  detail={`${effectiveTariff.toFixed(2)} CHF/kWh · ${data.efficiency} Wh/km`}
                />
                <div className="sm:col-span-1">
                  <StatCard
                    icon={Zap}
                    label={colLabels.savingsCardLabel}
                    amount={yearlySaving}
                    period={colLabels.savingsPerYear}
                    detail={`${fmtN(Math.abs(monthlySaving))} CHF/${colLabels.savingsPerMonth}`}
                    variant="savings"
                    savingsLabel={colLabels.savingsLabel}
                    lossLabel={colLabels.lossLabel}
                  />
                </div>
              </div>
            </div>
          </div>
      </div>
    </section>
  );
}
