import type { Block } from './types.ts'

/**
 * Paint order == array order: index 0 paints first (furthest back), the last item
 * paints on top. Keeping z-order as list order means the document stays a flat,
 * serialisable array with no z-index bookkeeping to drift.
 *
 * All functions return a NEW array when something moved, and the original array
 * when the move was a no-op (already at the front/back, or unknown id) — so a
 * future history middleware can skip recording nothing-happened actions.
 */

function swap(blocks: readonly Block[], indexA: number, indexB: number): readonly Block[] {
  const first = blocks[indexA]
  const second = blocks[indexB]
  if (!first || !second) return blocks

  const next = blocks.slice()
  next[indexA] = second
  next[indexB] = first
  return next
}

/** Move one step towards the viewer. */
export function bringForward(blocks: readonly Block[], id: string): readonly Block[] {
  const index = blocks.findIndex((block) => block.id === id)
  if (index < 0 || index === blocks.length - 1) return blocks
  return swap(blocks, index, index + 1)
}

/** Move one step away from the viewer. */
export function sendBackward(blocks: readonly Block[], id: string): readonly Block[] {
  const index = blocks.findIndex((block) => block.id === id)
  if (index <= 0) return blocks
  return swap(blocks, index, index - 1)
}

/**
 * Where a newly added block joins the stack.
 * Full-width bands (Section, Nav bar) go to the BACK so they behave like page
 * background; free-floating content goes to the FRONT where the client can see it.
 */
export function insertBlock(
  blocks: readonly Block[],
  block: Block,
  position: 'front' | 'back',
): readonly Block[] {
  return position === 'back' ? [block, ...blocks] : [...blocks, block]
}
