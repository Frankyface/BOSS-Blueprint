/**
 * HOW COMFORTABLY A THRESHOLD WAS PASSED.
 *
 * Every classifier in this module is a conjunction of gates, and a region that
 * scraped past its gates deserves to say so. A gate's margin is RELATIVE to its own
 * limit, so a 0.25 margin means the same thing whether the limit is 0.05 radians of
 * bow or 600 pixels of path — which is what lets one `CONFIDENCE_MARGIN` govern the
 * whole module instead of a per-classifier fudge factor each.
 *
 * ONLY MEASURED GATES BELONG HERE. Discrete counts — how many strokes, how many lines
 * in a stack, how many words in a row — are deliberately NOT expressed as gates: a
 * count of exactly the minimum is not "barely" anything, it is exactly the rule, and
 * an integer carries no measurement noise that could put it on the wrong side of a
 * boundary. Feeding counts in would mark every two-line paragraph on every page
 * `unsure` for no reason a client would recognise.
 */

export interface Gate {
  readonly value: number
  readonly limit: number
  readonly mode: 'atLeast' | 'atMost'
}

export function atLeast(value: number, limit: number): Gate {
  return { value, limit, mode: 'atLeast' }
}

export function atMost(value: number, limit: number): Gate {
  return { value, limit, mode: 'atMost' }
}

/**
 * How far past the limit the value sits, as a fraction of the limit. Negative means
 * the gate FAILED. A limit of zero has no scale to be relative to, so it falls back
 * to absolute pixels rather than dividing by nothing.
 */
export function marginOf(gate: Gate): number {
  const scale = Math.abs(gate.limit) || 1
  const slack = gate.mode === 'atLeast' ? gate.value - gate.limit : gate.limit - gate.value
  return slack / scale
}

/**
 * The weakest margin across every gate, or `null` if any of them failed.
 *
 * A conjunction is only as strong as its weakest term, so the minimum is the honest
 * summary — averaging would let three comfortable gates hide one that barely held.
 */
export function worstMargin(gates: readonly Gate[]): number | null {
  let weakest = Number.POSITIVE_INFINITY
  for (const gate of gates) {
    const margin = marginOf(gate)
    if (margin < 0) return null
    weakest = Math.min(weakest, margin)
  }
  return Number.isFinite(weakest) ? weakest : 0
}
