import { create } from 'zustand'

import { createBlock } from '../canvas/blockFactory.ts'
import { normaliseBlockText } from '../canvas/blockText.ts'
import { moveRect, resizeRect } from '../canvas/geometry.ts'
import type { Block, BlockTypeId, CanvasDocument, ResizeHandle } from '../canvas/types.ts'
import { toRect } from '../canvas/types.ts'
import { bringForward, insertBlock, sendBackward } from '../canvas/zorder.ts'
import { getBlockTypeDefinition } from '../constants/blockTypes.ts'

import { installDocumentFreeze } from './devFreeze.ts'

/**
 * The whole document lives in this one store as serialisable JSON, and every
 * mutation is a discrete named action that replaces state immutably. Both
 * properties are deliberate: they are what lets the next feature batch wrap this
 * store in history (undo/redo) and localStorage autosave middleware without
 * touching a single component.
 */

export interface CanvasState {
  /** Paint order == array order: last item is frontmost. */
  readonly blocks: readonly Block[]
  readonly selectedBlockId: string | null
  readonly editingBlockId: string | null
}

export interface CanvasActions {
  addBlock: (type: BlockTypeId) => string
  selectBlock: (id: string | null) => void
  moveBlockBy: (id: string, deltaX: number, deltaY: number) => void
  resizeBlockBy: (id: string, handle: ResizeHandle, deltaX: number, deltaY: number) => void
  setBlockText: (id: string, text: string) => void
  deleteBlock: (id: string) => void
  bringBlockForward: (id: string) => void
  sendBlockBackward: (id: string) => void
  startEditingBlock: (id: string) => void
  stopEditingBlock: () => void
  replaceDocument: (document: CanvasDocument) => void
  resetCanvas: () => void
}

export type CanvasStore = CanvasState & CanvasActions

export const INITIAL_CANVAS_STATE: CanvasState = {
  blocks: [],
  selectedBlockId: null,
  editingBlockId: null,
}

function isSameBlock(a: Block, b: Block): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.text === b.text
  )
}

/**
 * Replace one block immutably. Returns the ORIGINAL array when the id is unknown
 * or the update changed nothing, so no-op gestures don't churn React or (later)
 * the undo stack.
 */
function withUpdatedBlock(
  blocks: readonly Block[],
  id: string,
  update: (block: Block) => Block,
): readonly Block[] {
  const index = blocks.findIndex((block) => block.id === id)
  if (index < 0) return blocks

  const current = blocks[index]
  if (!current) return blocks

  const next = update(current)
  if (isSameBlock(current, next)) return blocks

  const updated = blocks.slice()
  updated[index] = next
  return updated
}

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  ...INITIAL_CANVAS_STATE,

  addBlock: (type) => {
    const block = createBlock(type, get().blocks)
    const definition = getBlockTypeDefinition(type)
    const position = definition.placement === 'stacked' ? 'back' : 'front'

    set((state) => ({
      blocks: insertBlock(state.blocks, block, position),
      selectedBlockId: block.id,
      editingBlockId: null,
    }))

    return block.id
  },

  /**
   * Selection deliberately does NOT close an open editor. Every "click somewhere
   * else" path fires the editor's blur first, which commits the draft and closes
   * it; tearing the textarea out of the DOM from here would race that blur and
   * silently lose what the client typed.
   */
  selectBlock: (id) => {
    set((state) => (state.selectedBlockId === id ? state : { selectedBlockId: id }))
  },

  moveBlockBy: (id, deltaX, deltaY) => {
    set((state) => ({
      blocks: withUpdatedBlock(state.blocks, id, (block) => ({
        ...block,
        ...moveRect(toRect(block), deltaX, deltaY),
      })),
    }))
  },

  resizeBlockBy: (id, handle, deltaX, deltaY) => {
    set((state) => ({
      blocks: withUpdatedBlock(state.blocks, id, (block) => ({
        ...block,
        ...resizeRect(
          toRect(block),
          handle,
          deltaX,
          deltaY,
          getBlockTypeDefinition(block.type).minSize,
        ),
      })),
    }))
  },

  setBlockText: (id, text) => {
    const normalised = normaliseBlockText(text)
    set((state) => ({
      blocks: withUpdatedBlock(state.blocks, id, (block) => ({ ...block, text: normalised })),
    }))
  },

  deleteBlock: (id) => {
    set((state) => {
      if (!state.blocks.some((block) => block.id === id)) return state

      return {
        blocks: state.blocks.filter((block) => block.id !== id),
        selectedBlockId: state.selectedBlockId === id ? null : state.selectedBlockId,
        editingBlockId: state.editingBlockId === id ? null : state.editingBlockId,
      }
    })
  },

  bringBlockForward: (id) => {
    set((state) => ({ blocks: bringForward(state.blocks, id) }))
  },

  sendBlockBackward: (id) => {
    set((state) => ({ blocks: sendBackward(state.blocks, id) }))
  },

  startEditingBlock: (id) => {
    const block = get().blocks.find((candidate) => candidate.id === id)
    if (!block || getBlockTypeDefinition(block.type).textMode === 'none') return

    set({ selectedBlockId: id, editingBlockId: id })
  },

  stopEditingBlock: () => {
    set((state) => (state.editingBlockId === null ? state : { editingBlockId: null }))
  },

  /**
   * Swap in a whole document — the one action undo/redo and the autosave restore
   * both go through.
   *
   * Selection is preserved rather than cleared: undoing a move should not also
   * yank the client's selection away. It IS pruned when the id no longer exists,
   * because an undo can take back the very block that was selected, and pointing
   * the toolbar at a block that is not on the page any more would be a ghost.
   */
  replaceDocument: (document) => {
    set((state) => {
      if (state.blocks === document.blocks) return state

      const exists = (id: string | null) =>
        id !== null && document.blocks.some((block) => block.id === id)

      return {
        blocks: document.blocks,
        selectedBlockId: exists(state.selectedBlockId) ? state.selectedBlockId : null,
        editingBlockId: exists(state.editingBlockId) ? state.editingBlockId : null,
      }
    })
  },

  resetCanvas: () => {
    set({ ...INITIAL_CANVAS_STATE })
  },
}))

// Makes the "immutable updates only" house rule enforced rather than merely
// asserted: any in-place write to the document throws in dev, in Vitest and in the
// E2E build. Folded out of the production bundle. See src/store/devFreeze.ts.
installDocumentFreeze(useCanvasStore)

/** Convenience for tests and the window test bridge. */
export function getCanvasSnapshot(): CanvasState {
  const { blocks, selectedBlockId, editingBlockId } = useCanvasStore.getState()
  return { blocks, selectedBlockId, editingBlockId }
}

/** The undoable/persisted slice, split out of the transient selection state. */
export function getCanvasDocument(): CanvasDocument {
  return { blocks: useCanvasStore.getState().blocks }
}
