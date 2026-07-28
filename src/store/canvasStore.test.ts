import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import type { Block, BlockTypeId } from '../canvas/types.ts'
import { BLOCK_TYPES, getBlockTypeDefinition } from '../constants/blockTypes.ts'

import { useCanvasStore } from './canvasStore.ts'

const store = () => useCanvasStore.getState()
const blocks = () => store().blocks
const ids = () => blocks().map((block) => block.id)
const blockById = (id: string): Block => {
  const found = blocks().find((block) => block.id === id)
  if (!found) throw new Error(`No block ${id} in the store`)
  return found
}

beforeEach(() => {
  store().resetCanvas()
  resetBlockIdSequence()
})

describe('addBlock', () => {
  it('adds a block of every offered type', () => {
    for (const definition of BLOCK_TYPES) {
      store().addBlock(definition.id)
    }

    const types = blocks().map((block) => block.type)
    for (const definition of BLOCK_TYPES) {
      expect(types).toContain(definition.id)
    }
    expect(blocks()).toHaveLength(BLOCK_TYPES.length)
  })

  it('gives the new block the type default size and empty placeholder text', () => {
    const id = store().addBlock('image')
    const block = blockById(id)
    const { defaultRect } = getBlockTypeDefinition('image')

    expect(block).toMatchObject({
      type: 'image',
      text: '',
      width: defaultRect.width,
      height: defaultRect.height,
    })
  })

  it('selects the block it just added and closes any editor', () => {
    const id = store().addBlock('heading')

    expect(store().selectedBlockId).toBe(id)
    expect(store().editingBlockId).toBeNull()
  })

  it('stacks full-width bands behind free-floating content', () => {
    const headingId = store().addBlock('heading')
    const sectionId = store().addBlock('section')

    expect(ids()).toEqual([sectionId, headingId])
  })

  it('adds free-floating blocks in front', () => {
    const first = store().addBlock('heading')
    const second = store().addBlock('button')

    expect(ids()).toEqual([first, second])
  })

  it('keeps the document JSON-serialisable', () => {
    store().addBlock('nav-bar')
    store().addBlock('text')

    const roundTripped = JSON.parse(JSON.stringify(blocks())) as Block[]
    expect(roundTripped).toEqual(blocks())
  })

  it('does not mutate the previous state', () => {
    const firstId = store().addBlock('heading')
    const previousBlocks = blocks()
    const previousSnapshot = structuredClone(previousBlocks)

    store().addBlock('text')

    expect(previousBlocks).toEqual(previousSnapshot)
    expect(previousBlocks).toHaveLength(1)
    expect(blocks()).not.toBe(previousBlocks)
    expect(previousBlocks[0]?.id).toBe(firstId)
  })
})

describe('selectBlock', () => {
  it('selects and deselects', () => {
    const id = store().addBlock('heading')

    store().selectBlock(null)
    expect(store().selectedBlockId).toBeNull()

    store().selectBlock(id)
    expect(store().selectedBlockId).toBe(id)
  })

  it('leaves an open editor alone so its blur can commit the draft first', () => {
    const first = store().addBlock('heading')
    const second = store().addBlock('heading')
    store().startEditingBlock(first)

    store().selectBlock(second)

    expect(store().selectedBlockId).toBe(second)
    expect(store().editingBlockId).toBe(first)
  })
})

describe('setBlockText', () => {
  it('commits the typed text onto the block', () => {
    const id = store().addBlock('heading')

    store().setBlockText(id, 'Welcome to BOSS')

    expect(blockById(id).text).toBe('Welcome to BOSS')
  })

  it('trims surrounding whitespace', () => {
    const id = store().addBlock('button')

    store().setBlockText(id, '   Book a call   ')

    expect(blockById(id).text).toBe('Book a call')
  })

  it('accepts being cleared back to the placeholder', () => {
    const id = store().addBlock('heading')
    store().setBlockText(id, 'Something')

    store().setBlockText(id, '')

    expect(blockById(id).text).toBe('')
  })

  it('does not mutate the previous block object', () => {
    const id = store().addBlock('heading')
    const previousBlock = blockById(id)
    const snapshot = structuredClone(previousBlock)

    store().setBlockText(id, 'New copy')

    expect(previousBlock).toEqual(snapshot)
    expect(previousBlock.text).toBe('')
  })
})

describe('deleteBlock', () => {
  it('removes the block', () => {
    const first = store().addBlock('heading')
    const second = store().addBlock('button')

    store().deleteBlock(first)

    expect(ids()).toEqual([second])
  })

  it('clears the selection and editor when the deleted block owned them', () => {
    const id = store().addBlock('heading')
    store().startEditingBlock(id)

    store().deleteBlock(id)

    expect(store().selectedBlockId).toBeNull()
    expect(store().editingBlockId).toBeNull()
  })

  it('keeps another block selected', () => {
    const first = store().addBlock('heading')
    const second = store().addBlock('button')
    store().selectBlock(second)

    store().deleteBlock(first)

    expect(store().selectedBlockId).toBe(second)
  })

  it('ignores an unknown id without touching state', () => {
    store().addBlock('heading')
    const previousBlocks = blocks()

    store().deleteBlock('nope')

    expect(blocks()).toBe(previousBlocks)
  })

  it('does not mutate the previous array', () => {
    const first = store().addBlock('heading')
    store().addBlock('button')
    const previousBlocks = blocks()
    const snapshot = structuredClone(previousBlocks)

    store().deleteBlock(first)

    expect(previousBlocks).toEqual(snapshot)
    expect(previousBlocks).toHaveLength(2)
  })
})

describe('z-order actions', () => {
  it('brings a block one step forward', () => {
    const first = store().addBlock('heading')
    const second = store().addBlock('heading')

    store().bringBlockForward(first)

    expect(ids()).toEqual([second, first])
  })

  it('sends a block one step backward', () => {
    const first = store().addBlock('heading')
    const second = store().addBlock('heading')

    store().sendBlockBackward(second)

    expect(ids()).toEqual([second, first])
  })

  it('does nothing at the ends of the stack', () => {
    const first = store().addBlock('heading')
    const second = store().addBlock('heading')
    const previousBlocks = blocks()

    store().sendBlockBackward(first)
    store().bringBlockForward(second)

    expect(blocks()).toBe(previousBlocks)
  })

  it('does not mutate the previous array', () => {
    const first = store().addBlock('heading')
    store().addBlock('heading')
    const previousBlocks = blocks()
    const snapshot = structuredClone(previousBlocks)

    store().bringBlockForward(first)

    expect(previousBlocks).toEqual(snapshot)
    expect(blocks()).not.toBe(previousBlocks)
  })
})

describe('inline editing state', () => {
  it('opens the editor for a block that has text', () => {
    const id = store().addBlock('heading')

    store().startEditingBlock(id)

    expect(store().editingBlockId).toBe(id)
    expect(store().selectedBlockId).toBe(id)
  })

  it('refuses to open an editor on a type with no text', () => {
    const textless: readonly BlockTypeId[] = ['section', 'image']

    for (const type of textless) {
      store().resetCanvas()
      const id = store().addBlock(type)

      store().startEditingBlock(id)

      expect(store().editingBlockId).toBeNull()
    }
  })

  it('ignores an unknown id', () => {
    store().startEditingBlock('nope')
    expect(store().editingBlockId).toBeNull()
  })

  it('closes the editor', () => {
    const id = store().addBlock('heading')
    store().startEditingBlock(id)

    store().stopEditingBlock()

    expect(store().editingBlockId).toBeNull()
    expect(store().selectedBlockId).toBe(id)
  })
})

describe('resetCanvas', () => {
  it('empties the document and clears selection', () => {
    store().addBlock('heading')
    store().addBlock('section')

    store().resetCanvas()

    expect(blocks()).toEqual([])
    expect(store().selectedBlockId).toBeNull()
    expect(store().editingBlockId).toBeNull()
  })
})
