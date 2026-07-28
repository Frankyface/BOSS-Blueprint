import { getBlockTypeDefinition } from '../constants/blockTypes.ts'

import { CASCADE_STEP_PX, CASCADE_WRAP_COUNT, PAGE_WIDTH_PX } from './constants.ts'
import { clampPosition } from './geometry.ts'
import type { Block, BlockRect, BlockTypeId } from './types.ts'

/** Monotonic within a session; `Date.now` keeps ids unique across reloads too. */
let sequence = 0

export function createBlockId(): string {
  sequence += 1
  return `block-${Date.now().toString(36)}-${sequence.toString(36)}`
}

/** Test-only: makes generated ids comparable across runs. */
export function resetBlockIdSequence(): void {
  sequence = 0
}

/** Bottom edge of the lowest full-width band already on the page. */
function stackedBottom(blocks: readonly Block[]): number {
  return blocks.reduce((lowest, block) => {
    const isStacked = getBlockTypeDefinition(block.type).placement === 'stacked'
    return isStacked ? Math.max(lowest, block.y + block.height) : lowest
  }, 0)
}

function cascadeOffset(blocks: readonly Block[], type: BlockTypeId): number {
  const sameType = blocks.filter((block) => block.type === type).length
  return (sameType % CASCADE_WRAP_COUNT) * CASCADE_STEP_PX
}

/**
 * Where a fresh block of `type` lands.
 * - Full-width bands stack below the last band, so a page builds up top to bottom.
 * - Everything else lands at its default spot, nudged down-right per existing
 *   sibling of the same type, so a second Heading never hides the first.
 */
export function nextBlockRect(type: BlockTypeId, blocks: readonly Block[]): BlockRect {
  const { defaultRect, placement } = getBlockTypeDefinition(type)

  if (placement === 'stacked') {
    return clampPosition({ ...defaultRect, x: 0, y: stackedBottom(blocks) }, PAGE_WIDTH_PX)
  }

  const offset = cascadeOffset(blocks, type)
  return clampPosition(
    { ...defaultRect, x: defaultRect.x + offset, y: defaultRect.y + offset },
    PAGE_WIDTH_PX,
  )
}

/**
 * Build a block ready to drop into the document.
 * `text` starts empty on purpose: an empty string means "still showing the
 * placeholder", which lets the Stage 3 export tell client copy from filler.
 */
export function createBlock(type: BlockTypeId, blocks: readonly Block[]): Block {
  return { id: createBlockId(), type, text: '', ...nextBlockRect(type, blocks) }
}
