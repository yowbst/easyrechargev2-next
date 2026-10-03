"use client";

import type { Product } from "@/lib/products";
import type { ProductFunnel } from "./types";

/** Products whose funnel runs on QuoteShell. The charger still uses QuoteForm. */
export const FUNNELS: Partial<Record<Product, ProductFunnel>> = {};

export function getFunnel(product: Product): ProductFunnel {
  const funnel = FUNNELS[product];
  if (!funnel) throw new Error(`QuoteShell: no funnel registered for product "${product}"`);
  return funnel;
}
