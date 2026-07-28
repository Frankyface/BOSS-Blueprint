import { beforeEach, describe, expect, it } from 'vitest'

import { BLOCK_TYPES, getBlockTypeDefinition } from '../constants/blockTypes.ts'

import { createBlock, createBlockId, nextBlockRect, resetBlockIdSequence } from './blockFactory.ts'
import { CASCADE_STEP_PX } from './constants.ts'
import type { Block } from './types.ts'

beforeEach(() => {
  resetBlockIdSequence()
})

describe('createBlockId', () => {
  it('never hands out the same id twice', () => {
    const ids = new Set(Array.from({ length: 200 }, createBlockId))
    expect(ids.size).toBe(200)
  })
})

describe('nextBlockRect', () => {
  it('uses the declared default rect for the first block of each type', () => {
    for (const definition of BLOCK_TYPES) {
      const rect = nextBlockRect(definition.id, [])
      expect(rect.width).toBe(definition.defaultRect.width)
      expect(rect.height).toBe(definition.defaultRect.height)
    }
  })

  it('starts full-width bands at the top-left of the page', () => {
    expect(nextBlockRect('section', [])).toEqual({ x: 0, y: 0, width: 1200, height: 240 })
    expect(nextBlockRect('nav-bar', [])).toEqual({ x: 0, y: 0, width: 1200, height: 72 })
  })

  it('stacks each new full-width band below the last one', () => {
    const navBar = createBlock('nav-bar', [])
    const firstSection = createBlock('section', [navBar])
    const secondSection = createBlock('section', [navBar, firstSection])

    expect(firstSection.y).toBe(navBar.y + navBar.height)
    expect(secondSection.y).toBe(firstSection.y + firstSection.height)
  })

  it('ignores free-floating blocks when stacking bands', () => {
    const heading = createBlock('heading', [])
    expect(nextBlockRect('section', [heading]).y).toBe(0)
  })

  it('cascades each new free-floating block of the same type down and right', () => {
    const first = createBlock('heading', [])
    const second = createBlock('heading', [first])

    expect(second.x).toBe(first.x + CASCADE_STEP_PX)
    expect(second.y).toBe(first.y + CASCADE_STEP_PX)
  })

  it('cascades per type, so a Text block does not shift because a Heading exists', () => {
    const heading = createBlock('heading', [])
    const textDefault = getBlockTypeDefinition('text').defaultRect

    expect(nextBlockRect('text', [heading])).toEqual(textDefault)
  })

  it('keeps every default rect on the page', () => {
    const many: Block[] = []
    for (let index = 0; index < 40; index += 1) {
      const block = createBlock('button', many)
      many.push(block)
      expect(block.x).toBeGreaterThanOrEqual(0)
      expect(block.y).toBeGreaterThanOrEqual(0)
      expect(block.x + block.width).toBeLessThanOrEqual(1200)
    }
  })
})

describe('createBlock', () => {
  it('creates a block of the requested type with empty (placeholder) text', () => {
    const block = createBlock('heading', [])

    expect(block.type).toBe('heading')
    expect(block.text).toBe('')
    expect(block.id).toMatch(/^block-/)
  })

  it('produces a plain JSON-serialisable object', () => {
    const block = createBlock('image', [])
    expect(JSON.parse(JSON.stringify(block))).toEqual(block)
  })

  it('does not mutate the blocks it was given', () => {
    const existing = [createBlock('section', [])]
    const snapshot = structuredClone(existing)

    createBlock('section', existing)

    expect(existing).toEqual(snapshot)
  })
})
