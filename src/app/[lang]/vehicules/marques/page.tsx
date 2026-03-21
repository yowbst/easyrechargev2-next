import { notFound } from "next/navigation";
import { fetchVehicleBrands } from "@/lib/directus-queries";
import { isValidLang, slugToDirectusLocale } from "@/lib/i18n/config";
import { VehicleBrandsListView } from "@/lib/vehicles/shared";

interface Props {
  params: Promise<{ lang: string }>;
}

export default async function VehicleBrandsPage({ params }: Props) {
  const { lang } = await params;
  if (!isValidLang(lang)) notFound();

  const locale = slugToDirectusLocale(lang);
  const brands = await fetchVehicleBrands(locale);

  return (
    <VehicleBrandsListView
      brands={brands}
      lang={lang}
      vehiclesSegment="vehicules"
      brandsSegment="marques"
    />
  );
}
