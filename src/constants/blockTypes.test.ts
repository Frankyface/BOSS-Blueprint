import { describe, expect, it } from 'vitest'

import type { BlockTypeId } from '../canvas/types.ts'

import {
  BLOCK_TYPES,
  BLOCK_TYPE_COUNT,
  getBlockTypeDefinition,
  PALETTE_BLOCK_TYPES,
  PALETTE_ORDER,
} from './blockTypes.ts'

/**
 * THE TABLE IS A CONTRACT, THE PALETTE ORDER IS NOT.
 *
 * `BLOCK_TYPES[].id` are the export discriminators (`docs/export-format.md`
 * §2.6) and the default rectangles are the geometry every starter template and
 * every already-saved `.blueprint` was authored against. Reordering the PALETTE
 * (UX audit P2) must not be able to move either, so both are pinned here as
 * literals rather than derived from the table they are supposed to be guarding.
 */

const PINNED_DISCRIMINATORS: readonly BlockTypeId[] = [
  'section',
  'heading',
  'text',
  'image',
  'button',
  'nav-bar',
]

const PINNED_GEOMETRY: Readonly<
  Record<BlockTypeId, { rect: [number, number, number, number]; min: [number, number] }>
> = {
  section: { rect: [0, 0, 1200, 240], min: [160, 64] },
  heading: { rect: [80, 120, 640, 72], min: [96, 40] },
  text: { rect: [80, 240, 640, 160], min: [96, 48] },
  image: { rect: [80, 440, 400, 280], min: [64, 64] },
  button: { rect: [80, 760, 200, 56], min: [64, 32] },
  'nav-bar': { rect: [0, 0, 1200, 72], min: [240, 40] },
}

describe('the block type table', () => {
  it('still exports exactly the six discriminators, in the same order', () => {
    expect(BLOCK_TYPES.map((definition) => definition.id)).toEqual(PINNED_DISCRIMINATORS)
    expect(BLOCK_TYPE_COUNT).toBe(PINNED_DISCRIMINATORS.length)
  })

  it.each(PINNED_DISCRIMINATORS)('%s keeps its default geometry', (id) => {
    const { defaultRect, minSize } = getBlockTypeDefinition(id)
    const pinned = PINNED_GEOMETRY[id]

    expect([defaultRect.x, defaultRect.y, defaultRect.width, defaultRect.height]).toEqual(pinned.rect)
    expect([minSize.width, minSize.height]).toEqual(pinned.min)
  })
})

describe('the palette order (UX audit P2)', () => {
  it('offers every type exactly once', () => {
    expect([...PALETTE_ORDER].sort()).toEqual([...PINNED_DISCRIMINATORS].sort())
    expect(PALETTE_BLOCK_TYPES).toHaveLength(BLOCK_TYPE_COUNT)
  })

  it('no longer opens with Section', () => {
    expect(PALETTE_ORDER[0]).not.toBe('section')
    expect(PALETTE_ORDER[0]).toBe('heading')
  })

  it('explains what a Section looks like rather than naming it twice', () => {
    expect(getBlockTypeDefinition('section').hint).toBe(
      'A coloured background band behind other blocks',
    )
  })

  it('hands back the very definitions the table holds, not copies of them', () => {
    for (const definition of PALETTE_BLOCK_TYPES) {
      expect(definition).toBe(getBlockTypeDefinition(definition.id))
    }
  })
})
