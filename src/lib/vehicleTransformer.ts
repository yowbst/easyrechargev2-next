import { DIRECTUS_URL } from "@/lib/directus";

export interface Vehicle {
  id: string;
  slug: string;
  brand: string;
  model: string;
  image: string;
  batteryCapacity: number;
  batteryDisplay: string;
  range: number;
  rangeDisplay: string;
  chargingPower: number;
  chargingDisplay: string;
  fastCharging: boolean;
  activeTo?: number;
  efficiency: number;
  efficiencyDisplay: string;
  pricePerRange: number;
  pricePerRangeDisplay: string;
  charging?: {
    home_destination?: {
      charge_port?: string;
      charge_time?: {
        value: number;
        unit: string;
        range?: {
          to: { value: number; unit: string };
          from: { value: number; unit: string };
        };
      };
      charge_power?: { value: number; unit: string };
      charge_speed?: { value: number; unit: string };
    };
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface VehicleNumericField {
  value: number;
  unit: string;
}

function extractNumericField(
  field: number | VehicleNumericField | undefined,
  defaultUnit: string,
): { value: number; unit: string } {
  if (field === undefined || field === null) {
    return { value: 0, unit: defaultUnit };
  }
  if (typeof field === "number") {
    return { value: field, unit: defaultUnit };
  }
  return { value: field.value || 0, unit: field.unit || defaultUnit };
}

const EUR_CHF_RATE = 1.08;

export function transformDirectusVehicle(dv: AnyRecord): Vehicle | null {
  const brandName = dv?.brand?.name;
  if (!brandName || !dv?.model) return null;

  const battery = extractNumericField(dv.battery, "kWh");
  const range = extractNumericField(dv.range, "km");
  const efficiency = extractNumericField(dv.efficiency, "Wh/km");
  const fastcharge = extractNumericField(dv.fastcharge, "kW");
  const pricePerRangeRaw = extractNumericField(
    dv.price_per_range ?? dv.pricePerRange,
    "EUR/km",
  );

  const pricePerRangeChf = Math.round(pricePerRangeRaw.value * EUR_CHF_RATE);

  return {
    id: String(dv.id),
    slug: dv.slug || String(dv.id),
    brand: brandName,
    model: dv.model,
    image: dv.thumbnail ? `${DIRECTUS_URL}/assets/${dv.thumbnail}` : "",
    batteryCapacity: battery.value,
    batteryDisplay: `${battery.value} ${battery.unit}`,
    range: range.value,
    rangeDisplay: `${range.value} ${range.unit}`,
    chargingPower: fastcharge.value,
    chargingDisplay: `${fastcharge.value} ${fastcharge.unit}`,
    fastCharging: fastcharge.value > 0,
    activeTo: dv.active_to ?? dv.activeTo,
    efficiency: efficiency.value,
    efficiencyDisplay: `${efficiency.value} ${efficiency.unit}`,
    pricePerRange: pricePerRangeChf,
    pricePerRangeDisplay: `${pricePerRangeChf} CHF/km`,
    charging: dv.charging,
  };
}

export function formatMinutes(totalMinutes: number | undefined): string {
  if (!totalMinutes || totalMinutes <= 0) return "-";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}
