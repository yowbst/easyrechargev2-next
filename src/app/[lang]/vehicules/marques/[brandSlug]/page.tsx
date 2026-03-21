import { notFound } from "next/navigation";
import { fetchVehicles } from "@/lib/directus-queries";
import { isValidLang, slugToDirectusLocale } from "@/lib/i18n/config";
import { VehicleBrandView } from "@/lib/vehicles/shared";

interface Props {
  params: Promise<{ lang: string; brandSlug: string }>;
}

export default async function VehicleBrandPage({ params }: Props) {
  const { lang, brandSlug } = await params;
  if (!isValidLang(lang)) notFound();

  const locale = slugToDirectusLocale(lang);
  const vehicles = await fetchVehicles(locale);

  return (
    <VehicleBrandView
      brandSlug={brandSlug}
      vehicles={vehicles}
      lang={lang}
      vehiclesSegment="vehicules"
      brandsSegment="marques"
    />
  );
}
