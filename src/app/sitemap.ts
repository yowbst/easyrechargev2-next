import type { MetadataRoute } from "next";
import {
  getCmsEntries,
  getBlogEntries,
  getVehicleEntries,
} from "@/lib/sitemap/registries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cmsEntries, blogEntries, vehicleEntries] = await Promise.all([
    getCmsEntries(),
    getBlogEntries(),
    getVehicleEntries(),
  ]);

  return [...cmsEntries, ...blogEntries, ...vehicleEntries];
}
