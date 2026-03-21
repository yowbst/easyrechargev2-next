import { z } from "zod";

// Quote form validation schemas
export const quoteFormSchema = z.object({
  // Section 1: Logement
  housingStatus: z.enum(['owner', 'co-owner', 'tenant']).optional(),
  housingType: z.enum(['house', 'apartment', 'other']),
  solarEquipment: z.enum(['yes', 'no', 'unknown']),
  homeBattery: z.enum(['yes', 'no', 'unknown']),
  neighborhoodEquipment: z.enum(['yes', 'no', 'unknown']),
  electricalBoardType: z.enum(['easy', 'medium', 'difficult', 'unknown']),

  // Section 2: Place de parc
  parkingSpotLocation: z.string().min(1),
  electricalLineDistance: z.union([z.number().min(5).max(50), z.literal('na')]).nullable(),
  electricalLineHoleCount: z.union([z.number().min(0).max(5), z.literal('na')]).nullable(),

  // Section 3: Borne de recharge
  parkingSpotCount: z.enum(['1', '2', '3+']),
  ecpStatus: z.enum(['get-advice', 'choice-done']),
  ecpBrand: z.string(),
  ecpModel: z.string(),
  ecpProvided: z.enum(['include', 'exclude']),
  deadline: z.enum(['asap', '1-2mo', '3-6mo', '6+mo']),

  // Section 4: Véhicule électrique
  vehicleStatus: z.enum(['own', 'ordered', 'want-to-order', 'unknown']),
  vehicleBrand: z.string(),
  vehicleModel: z.string(),
  vehicleTripDistance: z.union([z.number().min(5).max(180), z.literal('na')]).nullable(),
  vehicleChargingHours: z.union([z.number().min(5).max(10), z.literal('na')]).nullable(),

  // Section 5: Coordonnées
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
  email: z.string().email("Email invalide"),
  phone: z.string().min(1, "Téléphone requis"),
  phoneCountry: z.enum(['CH', 'FR', 'DE', 'IT', 'AT']),
  addressMode: z.enum(['google', 'manual']).default('google'),
  address: z.string().optional(),
  streetName: z.string().min(1, "Rue requise"),
  streetNb: z.string().min(1, "Numéro requis"),
  postalCode: z.string().min(1, "Code postal requis"),
  locality: z.string().min(1, "Localité requise"),
  canton: z.string().optional(),
  country: z.string().default('CH'),
});

export type QuoteFormData = z.infer<typeof quoteFormSchema>;
