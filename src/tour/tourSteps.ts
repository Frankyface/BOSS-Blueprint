import type { TourPlacement } from './tourAnchor.ts'

/**
 * THE FIVE THINGS A CLIENT CANNOT WORK OUT ON THEIR OWN, in the order the eye
 * travels: left column, centre, toolbar, right column, top-right.
 *
 * The UX audit (2026-07-28, persona Rosa) is the evidence base — the app's own
 * explanatory sentence lived 700px below the first palette block, so her first two
 * instincts failed in silence and she nearly stopped before adding one element
 * (findings M1, N1). These pointers are the cheap half of that fix; the palette
 * keeps its own sentence forever, directly under the BLOCKS heading, because a tour
 * teaches once and a label teaches every time.
 *
 * NOT A WIZARD. "Guided wizard onboarding" is an explicit v1 non-goal: these are
 * five labels on things that already exist, and nothing here ever gates the canvas.
 */

export interface TourStep {
  /** Matched against `[data-tour="…"]` in the live DOM. */
  readonly target: string
  /** Bold first line — the instruction itself. */
  readonly title: string
  /** One short sentence of detail. */
  readonly body: string
  /** Which side of its target the bubble prefers. See `tourAnchor.ts`. */
  readonly placement: TourPlacement
}

/**
 * Thirty seconds of reading at 200 wpm is 100 words; the ceiling is 95 so the
 * whole tour stays comfortably under it however slowly it is read. The unit test
 * counts these strings, so copy cannot quietly grow past the promise.
 *
 * The spec's draft copy came to 107 words by this count. Every teaching point
 * survives here — click to add, drag to place, double-click to type, Enter to
 * commit, what the pen is for, what each panel tab holds, what Submit does — the
 * padding around them did not (see the feature file's Notes).
 */
export const TOUR_WORD_LIMIT = 95

/**
 * Placement is chosen per step to keep the middle of the page clear: the bubble is
 * chrome pointing AT the canvas, and a client must be able to keep working with it
 * open. `right-end` parks step 1 low beside the palette rather than over the spot a
 * new block lands in.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: 'palette',
    title: 'Click a block to add it.',
    body: 'Heading, Text, Image, Button or Nav bar — it lands on the page, ready to drag.',
    placement: 'right-end',
  },
  {
    target: 'canvas',
    title: 'Double-click a block to type.',
    body: "Your words replace the grey text. Press Enter when you're done.",
    placement: 'inside-top',
  },
  {
    target: 'pen-tool',
    title: 'Grab the pen to scribble.',
    body: 'Circle something, write a note, sketch a photo idea — we read your marks.',
    placement: 'below-start',
  },
  {
    target: 'side-panel',
    title: 'This panel is about whatever you picked.',
    body: 'Block = its words and links · Site = your name and style · Nav map = what links where.',
    placement: 'left-start',
  },
  {
    target: 'submit',
    title: "When you're happy, hit Submit.",
    body: 'Download your design, email it to us — then we build it.',
    placement: 'below-end',
  },
]

/**
 * Words, as a reader counts them: anything with a letter or a digit in it. The
 * em dashes and interpuncts that separate clauses are punctuation, not reading
 * time, and counting them would make the budget lie in the safe direction.
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => /[a-z0-9]/i.test(token)).length
}

export function tourWordCount(steps: readonly TourStep[] = TOUR_STEPS): number {
  return steps.reduce((total, step) => total + countWords(step.title) + countWords(step.body), 0)
}

/**
 * The steps whose target is actually on the page right now.
 *
 * A pointer aimed at nothing is worse than a missing pointer, so a step whose
 * target has gone (Submit before Stage 3 landed it; the pen in some future layout)
 * is skipped and the remaining steps renumber themselves. Silent by design — and
 * caught by the unit test that renders the whole app and demands one element per
 * `data-tour` id, so it can never happen unnoticed in a shipped build.
 */
export function liveTourSteps(
  root: ParentNode,
  steps: readonly TourStep[] = TOUR_STEPS,
): readonly TourStep[] {
  return steps.filter((step) => root.querySelector(`[data-tour="${step.target}"]`) !== null)
}
