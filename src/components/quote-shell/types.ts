import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { Product } from "@/lib/products";

export type FormValues = Record<string, unknown>;

/** What every product step receives from the shell. */
export interface StepProps {
  data: FormValues;
  set: (field: string, value: unknown) => void;
  tq: (key: string, vars?: Record<string, string | number>) => string;
  tqOpt: (key: string) => string | undefined;
  /** Directus, then the bundled v2 copy (copy.ts); always interpolated. */
  tc: (key: string, vars?: Record<string, string | number>) => string;
  lang: string;
  pageConfig: Record<string, unknown>;
  /** Questions hidden in the Directus page config (`config.hiddenFields`): not shown, not required. */
  hidden: ReadonlySet<string>;
  /** Links to the other funnels, with the answers they can reuse (tenant exit). */
  links: { ecpQuote?: string };
}

export interface StepDef {
  /** Also the URL `?step=` value, the `q-…` anchor scope and `steps.<id>.title`. */
  id: string;
  icon: LucideIcon;
  Component: ComponentType<StepProps>;
  /** Removed from the sequence for these answers. */
  skip?: (data: FormValues) => boolean;
  /** The visitor cannot continue: the shell replaces "Continue" with a link home. */
  exit?: (data: FormValues) => boolean;
  /** Answers listed in the side panel once the step is done, in order. */
  summary?: string[];
}

export interface ProductFunnel {
  product: Product;
  /** Directus pages read by `tq`, most specific first. */
  dictPageIds: string[];
  steps: StepDef[];
  initialData: FormValues;
  /** Values a restored draft or URL cannot override (questions no longer asked). */
  fixedData?: FormValues;
  firstUnansweredField: (stepId: string, data: FormValues, hidden?: ReadonlySet<string>) => string | null;
  /** Side-panel value of an answer, when the option label is not enough (counts, kWc). */
  formatAnswer?: (field: string, value: unknown, t: StepProps["tq"]) => string | null;
  /** Apply one answer and clear the answers it invalidates. */
  applyChange: (field: string, value: unknown, data: FormValues) => FormValues;
}
