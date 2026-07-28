import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import { PAGE_WIDTH_PX } from '../canvas/constants.ts'
import type { Block } from '../canvas/types.ts'
import { BLOCK_TYPES, getBlockTypeDefinition } from '../constants/blockTypes.ts'

import { selectCurrentBlocks, useCanvasStore } from './canvasStore.ts'

/**
 * Store actions that run the pure geometry: drag-with-snap and resize-with-clamp.
 * The maths itself is covered in src/canvas/geometry.test.ts — these tests prove the
 * store wires it up, keeps the rest of the block intact, and never mutates in place.
 */

const store = () => useCanvasStore.getState()
const blocks = () => selectCurrentBlocks(store())
const blockById = (id: string): Block => {
  const found = blocks().find((block) => block.id === id)
  if (!found) throw new Error(`No block ${id} in the store`)
  return found
}

beforeEach(() => {
  store().resetCanvas()
  resetBlockIdSequence()
})

describe('moveBlockBy', () => {
  it('snaps the destination onto the 8px grid', () => {
    const id = store().addBlock('heading')
    const { x, y } = blockById(id)

    store().moveBlockBy(id, 37, 21)

    expect(blockById(id)).toMatchObject({ x: x + 40, y: y + 24 })
  })

  it('never lets a block leave the page, on any side', () => {
    const id = store().addBlock('button')

    store().moveBlockBy(id, -9000, -9000)
    const offLeft = blockById(id)
    expect(offLeft.x).toBe(0)
    expect(offLeft.y).toBe(0)

    store().moveBlockBy(id, 9000, 0)
    const offRight = blockById(id)
    expect(offRight.x + offRight.width).toBe(PAGE_WIDTH_PX)
  })

  it('leaves the size and text alone', () => {
    const id = store().addBlock('text')
    const before = blockById(id)

    store().moveBlockBy(id, 64, 64)

    expect(blockById(id)).toMatchObject({
      width: before.width,
      height: before.height,
      text: before.text,
    })
  })

  it('ignores an unknown id without touching state', () => {
    store().addBlock('heading')
    const previousBlocks = blocks()

    store().moveBlockBy('nope', 40, 40)

    expect(blocks()).toBe(previousBlocks)
  })

  it('keeps the state object identical when the move changes nothing', () => {
    const id = store().addBlock('heading')
    const previousBlocks = blocks()

    store().moveBlockBy(id, 0, 0)

    expect(blocks()).toBe(previousBlocks)
  })

  it('does not mutate the previous block object', () => {
    const id = store().addBlock('heading')
    const previousBlock = blockById(id)
    const snapshot = structuredClone(previousBlock)

    store().moveBlockBy(id, 40, 40)

    expect(previousBlock).toEqual(snapshot)
    expect(blockById(id)).not.toBe(previousBlock)
  })
})

describe('resizeBlockBy', () => {
  it('resizes from the south-east handle', () => {
    const id = store().addBlock('heading')
    const before = blockById(id)

    store().resizeBlockBy(id, 'se', 40, 40)

    expect(blockById(id)).toMatchObject({
      x: before.x,
      y: before.y,
      width: before.width + 40,
      height: before.height + 40,
    })
  })

  it('clamps to the per-type minimum size', () => {
    for (const definition of BLOCK_TYPES) {
      store().resetCanvas()
      const id = store().addBlock(definition.id)

      store().resizeBlockBy(id, 'se', -9000, -9000)

      expect(blockById(id)).toMatchObject({
        width: definition.minSize.width,
        height: definition.minSize.height,
      })
    }
  })

  it('pins the opposite corner when a north-west resize hits the minimum', () => {
    const id = store().addBlock('heading')
    const before = blockById(id)
    const { minSize } = getBlockTypeDefinition('heading')

    store().resizeBlockBy(id, 'nw', 9000, 9000)

    expect(blockById(id)).toMatchObject({
      x: before.x + before.width - minSize.width,
      y: before.y + before.height - minSize.height,
      width: minSize.width,
      height: minSize.height,
    })
  })

  it('does not mutate the previous block object', () => {
    const id = store().addBlock('heading')
    const previousBlock = blockById(id)
    const snapshot = structuredClone(previousBlock)

    store().resizeBlockBy(id, 'se', 80, 80)

    expect(previousBlock).toEqual(snapshot)
  })
})
