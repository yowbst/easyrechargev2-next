"use client";

import { useState, useMemo, useCallback } from "react";
import type { Vehicle } from "@/lib/vehicleTransformer";

export interface FilterBounds {
  range: { min: number; max: number };
  battery: { min: number; max: number };
  efficiency: { min: number; max: number };
  pricePerRange: { min: number; max: number };
  chargePower: { min: number; max: number };
  chargeTime: { min: number; max: number };
  chargeSpeed: { min: number; max: number };
}

export interface VehicleFiltersState {
  rangeFilter: number;
  setRangeFilter: (value: number) => void;
  batteryFilter: number;
  setBatteryFilter: (value: number) => void;
  efficiencyFilter: number;
  setEfficiencyFilter: (value: number) => void;
  pricePerRangeFilter: number;
  setPricePerRangeFilter: (value: number) => void;
  chargePortFilter: string | null;
  setChargePortFilter: (value: string | null) => void;
  chargePowerFilter: number;
  setChargePowerFilter: (value: number) => void;
  chargeTimeFilter: number;
  setChargeTimeFilter: (value: number) => void;
  chargeSpeedFilter: number;
  setChargeSpeedFilter: (value: number) => void;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  filterBounds: FilterBounds;
  uniqueChargePorts: string[];
  filteredVehicles: Vehicle[];
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

const DEFAULT_BOUNDS: FilterBounds = {
  range: { min: 0, max: 800 },
  battery: { min: 0, max: 120 },
  efficiency: { min: 0, max: 250 },
  pricePerRange: { min: 0, max: 200 },
  chargePower: { min: 0, max: 22 },
  chargeTime: { min: 0, max: 24 },
  chargeSpeed: { min: 0, max: 100 },
};

export function useVehicleFilters(vehicles: Vehicle[]): VehicleFiltersState {
  const [rangeFilter, setRangeFilter] = useState(0);
  const [batteryFilter, setBatteryFilter] = useState(0);
  const [efficiencyFilter, setEfficiencyFilter] = useState(Infinity);
  const [pricePerRangeFilter, setPricePerRangeFilter] = useState(Infinity);
  const [chargePortFilter, setChargePortFilter] = useState<string | null>(null);
  const [chargePowerFilter, setChargePowerFilter] = useState(0);
  const [chargeTimeFilter, setChargeTimeFilter] = useState(Infinity);
  const [chargeSpeedFilter, setChargeSpeedFilter] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const uniqueChargePorts = useMemo(() => {
    const ports = vehicles
      .map((v) => v.charging?.home_destination?.charge_port)
      .filter((port): port is string => !!port && port !== "-");
    return Array.from(new Set(ports)).sort();
  }, [vehicles]);

  const filterBounds = useMemo((): FilterBounds => {
    if (vehicles.length === 0) return DEFAULT_BOUNDS;

    const safeMax = (arr: number[], fallback: number) =>
      arr.length > 0 ? Math.ceil(Math.max(...arr)) : fallback;
    const safeMin = (arr: number[], fallback: number) =>
      arr.length > 0 ? Math.floor(Math.min(...arr)) : fallback;

    const ranges = vehicles.map((v) => v.range).filter((v) => v > 0);
    const batteries = vehicles.map((v) => v.batteryCapacity).filter((v) => v > 0);
    const efficiencies = vehicles.map((v) => v.efficiency).filter((v) => v > 0);
    const pricesPerRange = vehicles.map((v) => v.pricePerRange).filter((v) => v > 0);
    const chargePowers = vehicles
      .map((v) => v.charging?.home_destination?.charge_power?.value)
      .filter((v): v is number => v !== undefined && v > 0);
    const chargeTimes = vehicles
      .map((v) => v.charging?.home_destination?.charge_time?.value)
      .filter((v): v is number => v !== undefined && v > 0);
    const chargeSpeeds = vehicles
      .map((v) => v.charging?.home_destination?.charge_speed?.value)
      .filter((v): v is number => v !== undefined && v > 0);

    return {
      range: { min: 0, max: safeMax(ranges, DEFAULT_BOUNDS.range.max) },
      battery: { min: 0, max: safeMax(batteries, DEFAULT_BOUNDS.battery.max) },
      efficiency: {
        min: safeMin(efficiencies, DEFAULT_BOUNDS.efficiency.min),
        max: safeMax(efficiencies, DEFAULT_BOUNDS.efficiency.max),
      },
      pricePerRange: { min: 0, max: safeMax(pricesPerRange, DEFAULT_BOUNDS.pricePerRange.max) },
      chargePower: { min: 0, max: safeMax(chargePowers, DEFAULT_BOUNDS.chargePower.max) },
      chargeTime: { min: 0, max: safeMax(chargeTimes, DEFAULT_BOUNDS.chargeTime.max) },
      chargeSpeed: { min: 0, max: safeMax(chargeSpeeds, DEFAULT_BOUNDS.chargeSpeed.max) },
    };
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      if (rangeFilter > 0 && vehicle.range < rangeFilter) return false;
      if (batteryFilter > 0 && vehicle.batteryCapacity < batteryFilter) return false;
      if (efficiencyFilter < Infinity && efficiencyFilter > 0 && vehicle.efficiency > efficiencyFilter) return false;
      if (pricePerRangeFilter < Infinity && vehicle.pricePerRange > pricePerRangeFilter) return false;

      if (chargePortFilter) {
        const vehiclePort = vehicle.charging?.home_destination?.charge_port;
        if (!vehiclePort || vehiclePort !== chargePortFilter) return false;
      }
      if (chargePowerFilter > 0) {
        const vehiclePower = vehicle.charging?.home_destination?.charge_power?.value;
        if (!vehiclePower || vehiclePower < chargePowerFilter) return false;
      }
      if (chargeTimeFilter < Infinity) {
        const vehicleTime = vehicle.charging?.home_destination?.charge_time?.value;
        if (!vehicleTime || vehicleTime > chargeTimeFilter) return false;
      }
      if (chargeSpeedFilter > 0) {
        const vehicleSpeed = vehicle.charging?.home_destination?.charge_speed?.value;
        if (!vehicleSpeed || vehicleSpeed < chargeSpeedFilter) return false;
      }

      return true;
    });
  }, [
    vehicles, rangeFilter, batteryFilter, efficiencyFilter, pricePerRangeFilter,
    chargePortFilter, chargePowerFilter, chargeTimeFilter, chargeSpeedFilter,
  ]);

  const hasActiveFilters =
    rangeFilter > 0 ||
    batteryFilter > 0 ||
    (efficiencyFilter < Infinity && efficiencyFilter > 0) ||
    pricePerRangeFilter < Infinity ||
    chargePortFilter !== null ||
    chargePowerFilter > 0 ||
    chargeTimeFilter < Infinity ||
    chargeSpeedFilter > 0;

  const clearFilters = useCallback(() => {
    setRangeFilter(0);
    setBatteryFilter(0);
    setEfficiencyFilter(Infinity);
    setPricePerRangeFilter(Infinity);
    setChargePortFilter(null);
    setChargePowerFilter(0);
    setChargeTimeFilter(Infinity);
    setChargeSpeedFilter(0);
  }, []);

  return {
    rangeFilter, setRangeFilter,
    batteryFilter, setBatteryFilter,
    efficiencyFilter, setEfficiencyFilter,
    pricePerRangeFilter, setPricePerRangeFilter,
    chargePortFilter, setChargePortFilter,
    chargePowerFilter, setChargePowerFilter,
    chargeTimeFilter, setChargeTimeFilter,
    chargeSpeedFilter, setChargeSpeedFilter,
    showFilters, setShowFilters,
    filterBounds,
    uniqueChargePorts,
    filteredVehicles,
    hasActiveFilters,
    clearFilters,
  };
}
