/**
 * Run-clock arithmetic, split out of the orchestrator so it can be tested rather than
 * trusted.
 *
 * `SMOKE_BUDGET_MIN` was a PINNED constant with nothing reading it: "completes in ≤ 12
 * minutes" is a Success Criterion of `feature-roundtrip-harness.md`, and a criterion
 * nothing checks is a wish. A smoke run that overruns now fails, whatever the gates said.
 *
 * Deliberately NOT symmetrical with the per-segment budgets: a segment breach is an INFRA
 * failure (something hung), whereas the smoke budget is a product-facing promise about
 * how long the pre-merge check costs — so it produces a SMOKE-FAIL verdict, not an abort.
 */

import { SMOKE_BUDGET_MIN } from './thresholds.mjs';

const MINUTE = 60_000;

/** Wall-clock minutes since `startedAt`, to two decimals. */
export function elapsedMinutes(startedAt, now = Date.now()) {
  return Number(((now - startedAt.getTime()) / MINUTE).toFixed(2));
}

/**
 * @returns {{ verdictLine: string, exitCode: number, breached: boolean }}
 */
export function applySmokeBudget({ smoke, elapsedMin, verdictLine, exitCode, budgetMin = SMOKE_BUDGET_MIN }) {
  if (!smoke || elapsedMin <= budgetMin) return { verdictLine, exitCode, breached: false };
  return {
    verdictLine:
      `SMOKE-FAIL — over the ${String(budgetMin)}-minute budget at ${elapsedMin.toFixed(1)} min ` +
      `(gates said: ${verdictLine})`,
    exitCode: 1,
    breached: true,
  };
}
