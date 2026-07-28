import { describe, expect, it } from 'vitest'

import type { Block } from './types.ts'
import { bringForward, insertBlock, sendBackward } from './zorder.ts'

function block(id: string): Block {
  return { id, type: 'heading', x: 0, y: 0, width: 100, height: 40, text: '' }
}

const BACK = block('back')
const MIDDLE = block('middle')
const FRONT = block('front')
const STACK: readonly Block[] = [BACK, MIDDLE, FRONT]

const ids = (blocks: readonly Block[]) => blocks.map((item) => item.id)

describe('bringForward', () => {
  it('swaps the block one step towards the viewer', () => {
    expect(ids(bringForward(STACK, 'back'))).toEqual(['middle', 'back', 'front'])
  })

  it('does nothing when the block is already frontmost', () => {
    expect(bringForward(STACK, 'front')).toBe(STACK)
  })

  it('does nothing for an unknown id', () => {
    expect(bringForward(STACK, 'nope')).toBe(STACK)
  })

  it('leaves the previous array untouched', () => {
    const next = bringForward(STACK, 'back')
    expect(next).not.toBe(STACK)
    expect(ids(STACK)).toEqual(['back', 'middle', 'front'])
  })
})

describe('sendBackward', () => {
  it('swaps the block one step away from the viewer', () => {
    expect(ids(sendBackward(STACK, 'front'))).toEqual(['back', 'front', 'middle'])
  })

  it('does nothing when the block is already backmost', () => {
    expect(sendBackward(STACK, 'back')).toBe(STACK)
  })

  it('does nothing for an unknown id', () => {
    expect(sendBackward(STACK, 'nope')).toBe(STACK)
  })

  it('leaves the previous array untouched', () => {
    const next = sendBackward(STACK, 'front')
    expect(next).not.toBe(STACK)
    expect(ids(STACK)).toEqual(['back', 'middle', 'front'])
  })
})

describe('bringForward and sendBackward together', () => {
  it('round-trip back to the original order', () => {
    const moved = bringForward(STACK, 'back')
    expect(ids(sendBackward(moved, 'back'))).toEqual(ids(STACK))
  })
})

describe('insertBlock', () => {
  const fresh = block('fresh')

  it('puts free-floating blocks in front', () => {
    expect(ids(insertBlock(STACK, fresh, 'front'))).toEqual(['back', 'middle', 'front', 'fresh'])
  })

  it('puts full-width bands behind everything', () => {
    expect(ids(insertBlock(STACK, fresh, 'back'))).toEqual(['fresh', 'back', 'middle', 'front'])
  })

  it('leaves the previous array untouched', () => {
    const next = insertBlock(STACK, fresh, 'front')
    expect(next).not.toBe(STACK)
    expect(STACK).toHaveLength(3)
  })
})
