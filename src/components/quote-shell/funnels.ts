"use client";

import type { Product } from "@/lib/products";
import type { ProductFunnel } from "./types";
import { batteryFunnel } from "./products/battery";
import { ecpFunnel } from "./products/ecp";

/** Every quote funnel runs on QuoteShell since v2. */
export const FUNNELS: Record<Product, ProductFunnel> = { ecp: ecpFunnel, battery: batteryFunnel };

export function getFunnel(product: Product): ProductFunnel {
  const funnel = FUNNELS[product];
  if (!funnel) throw new Error(`QuoteShell: no funnel registered for product "${product}"`);
  return funnel;
}
