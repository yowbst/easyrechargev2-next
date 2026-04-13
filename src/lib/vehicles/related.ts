/**
 * Pure functions for finding related vehicles.
 * No framework dependencies — operates on transformed Vehicle objects.
 */

import type { Vehicle } from "@/lib/vehicleTransformer";

/**
 * Vehicles from the same brand, excluding the current one.
 * Sorted by closest range to the current vehicle.
 */
export function findSameBrandVehicles(
  current: Vehicle,
  allVehicles: Vehicle[],
  limit = 4,
): Vehicle[] {
  return allVehicles
    .filter((v) => v.brand === current.brand && v.slug !== current.slug)
    .sort((a, b) => Math.abs(a.range - current.range) - Math.abs(b.range - current.range))
    .slice(0, limit);
}

/**
 * Vehicles from OTHER brands with similar range and cost-per-km.
 * Scored by combined proximity (lower = more similar).
 */
export function findSimilarVehicles(
  current: Vehicle,
  allVehicles: Vehicle[],
  limit = 4,
): Vehicle[] {
  if (!current.range || !current.pricePerRange) return [];

  return allVehicles
    .filter((v) => {
      if (v.slug === current.slug || v.brand === current.brand) return false;
      if (!v.range || !v.pricePerRange) return false;
      const rangeDiff = Math.abs(v.range - current.range) / current.range;
      const pprDiff = Math.abs(v.pricePerRange - current.pricePerRange) / current.pricePerRange;
      return rangeDiff <= 0.3 && pprDiff <= 0.5;
    })
    .map((v) => {
      const rangeDiff = Math.abs(v.range - current.range) / current.range;
      const pprDiff = Math.abs(v.pricePerRange - current.pricePerRange) / current.pricePerRange;
      return { vehicle: v, score: rangeDiff + pprDiff };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((item) => item.vehicle);
}
