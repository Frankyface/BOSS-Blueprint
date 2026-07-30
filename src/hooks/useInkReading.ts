import { useMemo } from 'react'

import { inkReadingRegions } from '../canvas/inkReading.ts'
import type { InkRegion } from '../canvas/ink/types.ts'
import type { Block, PenStroke } from '../canvas/types.ts'
import { selectCurrentBlocks, selectCurrentStrokes, useCanvasStore } from '../store/canvasStore.ts'
import { selectIsInkReadingShown, usePenToolStore } from '../store/penTool.ts'

/**
 * OUR READING OF THE PAGE ON SCREEN — one answer, two places it is shown.
 *
 * The overlay paints it on the drawing and the toolbar says it in a sentence. Both
 * come through here rather than each calling the classifier with its own inputs,
 * because "the client and the builder are shown the same reading" is worth nothing
 * if the two halves of the CLIENT's view can drift apart first.
 *
 * NOTHING IS COMPUTED WHILE IT IS HIDDEN. The tick box is off by default and the
 * classifier is bounded but not free (`INK_MAX_STROKES` strokes of enclosure
 * search), so the flag is checked before the work, not after it. When it is on, the
 * memo re-reads only when the page's blocks or strokes actually change — a
 * mid-gesture drag writes neither (see `useBlockGesture` and `PenLayer`), so
 * dragging a block does not re-classify the page on every pointermove.
 */
const NO_REGIONS: readonly InkRegion[] = []

/**
 * ONE CLASSIFY PER CHANGE, ACROSS BOTH CONSUMERS (Fix I).
 *
 * This hook is called from `PenLayer` AND `PenControls`, and each `useMemo` is
 * per-instance — so the same page was classified TWICE per stroke (~65-100ms on a
 * 400-stroke page). This is a single-entry memo, OUTSIDE React, keyed on the two
 * inputs by reference: the store selectors hand both consumers the SAME `blocks` and
 * `strokes` arrays until the page actually changes, so the second caller in a commit
 * hits this cache instead of re-running the classifier. It is a pure memoisation —
 * same inputs, same output — not shared state; a page edit changes the references and
 * the next read recomputes once. A store/context refactor would be the "correct" home
 * for this, but the task forbids that scope, and this stays inside the single hook.
 */
let cache: {
  readonly blocks: readonly Block[]
  readonly strokes: readonly PenStroke[]
  readonly regions: readonly InkRegion[]
} | null = null

function readingFor(
  blocks: readonly Block[],
  strokes: readonly PenStroke[],
): readonly InkRegion[] {
  if (cache && cache.blocks === blocks && cache.strokes === strokes) return cache.regions

  const regions = inkReadingRegions(blocks, strokes)
  cache = { blocks, strokes, regions }
  return regions
}

export function useInkReading(): readonly InkRegion[] {
  const isShown = usePenToolStore(selectIsInkReadingShown)
  const blocks = useCanvasStore(selectCurrentBlocks)
  const strokes = useCanvasStore(selectCurrentStrokes)

  return useMemo(
    () => (isShown ? readingFor(blocks, strokes) : NO_REGIONS),
    [isShown, blocks, strokes],
  )
}
