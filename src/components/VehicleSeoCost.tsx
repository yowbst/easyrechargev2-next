"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
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
    <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 rounded-lg border bg-background px-2.5 sm:px-3 py-1.5 w-full sm:w-auto">
      <label htmlFor={id} className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
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
          className={`${width} bg-muted/50 rounded-md px-2 py-1 text-right tabular-nums text-sm font-medium border-0 outline-none focus:ring-1 focus:ring-primary/40`}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">{unit}</span>
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
    default: "",
    primary: "border-primary/50 bg-primary/5 dark:bg-primary/10 ring-1 ring-primary/20",
    success: "border-green-500/50 bg-green-50/30 dark:bg-green-950/15 ring-1 ring-green-500/20",
    loss: "border-red-500/50 bg-red-50/30 dark:bg-red-950/15 ring-1 ring-red-500/20",
  };
  const colorMap = {
    default: "text-muted-foreground",
    primary: "text-primary",
    success: "text-green-700 dark:text-green-400",
    loss: "text-red-700 dark:text-red-400",
  };
  const textColor = colorMap[resolvedVariant];
  const isHighlighted = resolvedVariant === "success" || resolvedVariant === "loss";
  const contextLabel = variant === "savings"
    ? (isPositive ? savingsLabel : lossLabel)
    : undefined;

  return (
    <Card className={`p-3 sm:p-4 ${styles[resolvedVariant]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 shrink-0 ${textColor}`} />
        <span className={`text-xs sm:text-sm font-medium ${isHighlighted ? textColor : "text-muted-foreground"}`}>
          {label}
        </span>
      </div>
      {contextLabel && (
        <div className={`text-[10px] sm:text-xs leading-none ${textColor} opacity-80`}>{contextLabel}</div>
      )}
      <div className="flex items-baseline gap-1.5 -mt-1.5">
        <span className={`text-xl sm:text-2xl font-bold leading-none tabular-nums ${isHighlighted ? textColor : ""}`}>
          {fmtN(Math.abs(amount))}
        </span>
        <span className="text-[10px] sm:text-xs text-muted-foreground">
          CHF/{period}
        </span>
      </div>
      {detail && (
        <div className={`text-[10px] sm:text-xs mt-1 tabular-nums ${isHighlighted ? "opacity-70 " + textColor : "text-muted-foreground"}`}>{detail}</div>
      )}
    </Card>
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
    <section className="py-12">
      <div className="container mx-auto px-4">
          {/* Section heading */}
          <h2 className="text-xl sm:text-2xl font-heading font-bold mb-2">{data.title}</h2>
          <p className="text-sm sm:text-base text-muted-foreground mb-6">{colLabels.inputsSubtitle}</p>

          {/* Shared inputs */}
          <h3 className="text-xs font-heading font-semibold uppercase tracking-widest text-muted-foreground mb-3">{colLabels.inputsLabel}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 mb-10">
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
            <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 rounded-lg border bg-background px-2.5 sm:px-3 py-1.5 w-full sm:w-auto">
              <label htmlFor="solar-checkbox" className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground whitespace-nowrap cursor-pointer select-none">
                <input
                  id="solar-checkbox"
                  type="checkbox"
                  checked={hasSolar}
                  onChange={(e) => setHasSolar(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                />
                <Sun className="h-3.5 w-3.5 text-yellow-500" />
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
                  className="w-10 bg-muted/50 rounded-md px-2 py-1 text-right tabular-nums text-sm font-medium border-0 outline-none focus:ring-1 focus:ring-primary/40"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">{colLabels.solarUnit}</span>
              </div>
            </div>
          </div>

          <div className="space-y-10">
            {/* 1. Home charging cost table */}
            <div>
              <h3 className="text-base sm:text-lg font-heading font-semibold mb-2">{colLabels.homeChargingTitle}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{colLabels.homeChargingIntro}</p>
              {/* Desktop table */}
              <Card className="overflow-hidden hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60">
                      <TableHead className="font-semibold">{colLabels.scenario}</TableHead>
                      <TableHead className={`font-semibold text-right transition-opacity ${hasSolar ? "text-yellow-600 dark:text-yellow-400" : "opacity-30"}`}>{colLabels.kwhSolar}</TableHead>
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
              </Card>
              {/* Mobile stacked cards */}
              <div className="grid gap-3 sm:hidden">
                {rows.map((row, i) => {
                  const kwhSolar = row.kwh * (solarPct / 100);
                  const kwhNetwork = row.kwh * (1 - solarPct / 100);
                  return (
                    <Card key={i} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm flex items-center gap-1.5">
                          <row.icon className="h-4 w-4 text-primary shrink-0" />
                          {row.scenario}
                        </span>
                        <span className="font-semibold text-sm tabular-nums">CHF {fmtN(row.kwh * effectiveTariff, 2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                        <span>{colLabels.kwhNetwork}: {fmtN(kwhNetwork, 1)} kWh</span>
                        {hasSolar && (
                          <span className="text-yellow-600 dark:text-yellow-400">{colLabels.kwhSolar}: {fmtN(kwhSolar, 1)} kWh</span>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* 2. Network comparison */}
            <div>
              <h3 className="text-base sm:text-lg font-heading font-semibold mb-2">{colLabels.networkTitle}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{colLabels.networkIntro}</p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
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
              <h3 className="text-base sm:text-lg font-heading font-semibold mb-2">{colLabels.savingsTitle}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{colLabels.savingsIntro}</p>
              <h4 className="text-xs font-heading font-semibold uppercase tracking-widest text-muted-foreground mb-3">{colLabels.savingsInputsLabel}</h4>
              <div className="flex flex-wrap items-center gap-2 mb-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
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
