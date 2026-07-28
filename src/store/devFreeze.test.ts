import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import type { Block } from '../canvas/types.ts'

import { selectCurrentBlocks, useCanvasStore } from './canvasStore.ts'

/**
 * The freeze is installed by canvasStore.ts on import, and Vitest runs with
 * MODE === 'test', so it is live for the whole unit suite. These tests prove it
 * is actually doing something rather than silently no-opping — otherwise the
 * other 240 tests would pass just as happily with it switched off.
 */

const store = () => useCanvasStore.getState()
const blocksNow = () => selectCurrentBlocks(store())

beforeEach(() => {
  store().resetCanvas()
  resetBlockIdSequence()
})

describe('the dev/test document freeze', () => {
  it('freezes the blocks array and every block in it', () => {
    store().addBlock('heading')
    store().addBlock('section')

    expect(Object.isFrozen(blocksNow())).toBe(true)
    for (const block of blocksNow()) {
      expect(Object.isFrozen(block)).toBe(true)
    }
  })

  it('throws on an in-place write to a block', () => {
    const id = store().addBlock('heading')
    const block = blocksNow().find((candidate) => candidate.id === id)
    expect(block).toBeDefined()
    if (!block) return

    // ESM runs in strict mode, so a frozen write is a TypeError, not a silent no-op.
    expect(() => {
      ;(block as { x: number }).x = 999
    }).toThrow(TypeError)
    expect(block.x).not.toBe(999)
  })

  it('throws on an in-place push to the document', () => {
    store().addBlock('heading')
    const blocks = blocksNow()

    expect(() => {
      ;(blocks as Block[]).push({
        id: 'sneaky',
        type: 'button',
        x: 0,
        y: 0,
        width: 64,
        height: 32,
        text: '',
      })
    }).toThrow(TypeError)
    expect(blocksNow()).toHaveLength(1)
  })

  it('still lets every legitimate immutable action through', () => {
    // The whole point: freezing must break mutation, not the app. Each of these
    // rebuilds the array rather than editing it in place.
    const id = store().addBlock('heading')
    store().moveBlockBy(id, 40, 40)
    store().resizeBlockBy(id, 'se', 40, 8)
    store().setBlockText(id, 'Frozen but editable')
    const second = store().addBlock('button')
    store().bringBlockForward(id)
    store().sendBlockBackward(second)
    store().deleteBlock(second)

    expect(blocksNow()).toHaveLength(1)
    expect(blocksNow()[0]).toMatchObject({ x: 120, y: 160, text: 'Frozen but editable' })
  })
})
