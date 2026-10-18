import type { StepDef, StepRule } from "./types";

/**
 * A funnel's steps: the rules (order, skip, exit — shared with the server)
 * plus each step's UI. A rule without UI throws when the funnel module loads.
 */
export function withUi<Id extends string>(
  rules: StepRule[],
  ui: Record<Id, Omit<StepDef, keyof StepRule>>,
): StepDef[] {
  return rules.map((rule) => {
    const view = ui[rule.id as Id];
    if (!view) throw new Error(`No UI for step "${rule.id}"`);
    return { ...rule, ...view };
  });
}
