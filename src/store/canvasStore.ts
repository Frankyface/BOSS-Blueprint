import { create } from 'zustand'

import {
  withCopyMode,
  withGenerateDescription,
  withImageData,
  withImageDescription,
  withImageFit,
  withLengthHint,
  withLink,
  withNavItemAdded,
  withNavItemLabel,
  withNavItemLink,
  withNavItemRemoved,
} from '../canvas/blockEdits.ts'
import { createBlock } from '../canvas/blockFactory.ts'
import { normaliseBlockText } from '../canvas/blockText.ts'
import {
  addPage as addPageTo,
  blocksOfPage,
  deletePage as deletePageFrom,
  duplicatePage as duplicatePageIn,
  movePage as movePageIn,
  renamePage as renamePageIn,
} from '../canvas/document.ts'
import { moveRect, resizeRect } from '../canvas/geometry.ts'
import { navItemsFromText, withNavItems } from '../canvas/navItems.ts'
import { pageById } from '../canvas/pages.ts'
import { withStrokeAdded, withStrokeRemoved } from '../canvas/penStrokes.ts'
import { applySettingsPatch, withColorAt, withColorRemoved } from '../canvas/siteSettings.ts'
import type { CanvasDocument } from '../canvas/types.ts'
import { toRect } from '../canvas/types.ts'
import { bringForward, insertBlock, sendBackward } from '../canvas/zorder.ts'
import { getBlockTypeDefinition } from '../constants/blockTypes.ts'

import {
  applyDocument,
  documentOf,
  focusOn,
  initialState,
  INITIAL_CANVAS_STATE,
  selectCurrentBlocks,
  updateCurrentBlock,
  updateCurrentBlocks,
  updateCurrentStrokes,
  updateSettings,
} from './canvasState.ts'
import type { CanvasState, CanvasStore } from './canvasState.ts'
import { installDocumentFreeze } from './devFreeze.ts'

/**
 * Re-exported so every component and test keeps importing the store's vocabulary
 * from one place, whichever file it happens to be defined in.
 */
export {
  documentOf,
  INITIAL_CANVAS_STATE,
  selectCurrentBlocks,
  selectCurrentPage,
  selectCurrentStrokes,
  selectHasContent,
  selectSelectedBlock,
} from './canvasState.ts'
export type { CanvasActions, CanvasState, CanvasStore } from './canvasState.ts'

/**
 * The whole document lives in this one store as serialisable JSON, and every
 * mutation is a discrete named action that replaces state immutably. Both
 * properties are what let the session module wrap this store in history (undo/redo)
 * and localStorage autosave without touching a single component.
 *
 * Every action here is a thin shell over a pure function in `src/canvas/`. That is
 * deliberate: page CRUD, link integrity and copy-mode rules are all testable with
 * no store at all, and this file stays a wiring layer.
 */

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  ...INITIAL_CANVAS_STATE,

  addBlock: (type) => {
    const state = get()
    const block = createBlock(type, selectCurrentBlocks(state))
    const definition = getBlockTypeDefinition(type)
    const position = definition.placement === 'stacked' ? 'back' : 'front'

    set((current) => ({
      ...updateCurrentBlocks(current, (blocks) => insertBlock(blocks, block, position)),
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
    set((state) =>
      updateCurrentBlock(state, id, (block) => ({
        ...block,
        ...moveRect(toRect(block), deltaX, deltaY),
      })),
    )
  },

  resizeBlockBy: (id, handle, deltaX, deltaY) => {
    set((state) =>
      updateCurrentBlock(state, id, (block) => ({
        ...block,
        ...resizeRect(
          toRect(block),
          handle,
          deltaX,
          deltaY,
          getBlockTypeDefinition(block.type).minSize,
        ),
      })),
    )
  },

  /**
   * A nav bar's labels and its structured items are two views of one thing, so
   * typing into the block rebuilds the items (keeping the wiring of any label that
   * survived the edit) rather than leaving the two to drift.
   */
  setBlockText: (id, text) => {
    const normalised = normaliseBlockText(text)
    set((state) =>
      updateCurrentBlock(state, id, (block) =>
        block.type === 'nav-bar'
          ? withNavItems(block, navItemsFromText(normalised, block.items ?? []))
          : { ...block, text: normalised },
      ),
    )
  },

  deleteBlock: (id) => {
    set((state) => {
      const blocks = selectCurrentBlocks(state)
      if (!blocks.some((block) => block.id === id)) return state

      return {
        ...updateCurrentBlocks(state, (current) => current.filter((block) => block.id !== id)),
        selectedBlockId: state.selectedBlockId === id ? null : state.selectedBlockId,
        editingBlockId: state.editingBlockId === id ? null : state.editingBlockId,
      }
    })
  },

  bringBlockForward: (id) => {
    set((state) => updateCurrentBlocks(state, (blocks) => bringForward(blocks, id)))
  },

  sendBlockBackward: (id) => {
    set((state) => updateCurrentBlocks(state, (blocks) => sendBackward(blocks, id)))
  },

  startEditingBlock: (id) => {
    const block = selectCurrentBlocks(get()).find((candidate) => candidate.id === id)
    if (!block || getBlockTypeDefinition(block.type).textMode === 'none') return

    set({ selectedBlockId: id, editingBlockId: id })
  },

  stopEditingBlock: () => {
    set((state) => (state.editingBlockId === null ? state : { editingBlockId: null }))
  },

  /**
   * A finished upload, an emptied slot, a fit change and a description are each
   * ONE store write and therefore one undo step. The compression work happens
   * before this is ever called (`compressImage`), so the document never holds a
   * half-processed photo.
   */
  setBlockImage: (id, imageData, originalFilename = '') => {
    set((state) =>
      updateCurrentBlock(state, id, (block) => withImageData(block, imageData, originalFilename)),
    )
  },

  setBlockImageFit: (id, fit) => {
    set((state) => updateCurrentBlock(state, id, (block) => withImageFit(block, fit)))
  },

  setBlockImageDescription: (id, description) => {
    set((state) =>
      updateCurrentBlock(state, id, (block) => withImageDescription(block, description)),
    )
  },

  /**
   * The pen's commit point. Everything up to pointerup is previewed by writing an
   * SVG path directly (`PenLayer`), exactly as the block gesture previews a drag —
   * so a 200-sample scribble is one re-render, one history entry and one autosave,
   * not two hundred.
   */
  addPenStroke: (stroke) => {
    set((state) => updateCurrentStrokes(state, (strokes) => withStrokeAdded(strokes, stroke)))
  },

  removePenStroke: (strokeId) => {
    set((state) => updateCurrentStrokes(state, (strokes) => withStrokeRemoved(strokes, strokeId)))
  },

  setBlockCopyMode: (id, mode) => {
    set((state) => updateCurrentBlock(state, id, (block) => withCopyMode(block, mode)))
  },

  setBlockGenerateDescription: (id, description) => {
    set((state) =>
      updateCurrentBlock(state, id, (block) => withGenerateDescription(block, description)),
    )
  },

  setBlockLengthHint: (id, hint) => {
    set((state) => updateCurrentBlock(state, id, (block) => withLengthHint(block, hint)))
  },

  setBlockLink: (id, link) => {
    set((state) => updateCurrentBlock(state, id, (block) => withLink(block, link)))
  },

  addNavItem: (blockId, label) => {
    set((state) => updateCurrentBlock(state, blockId, (block) => withNavItemAdded(block, label)))
  },

  setNavItemLabel: (blockId, itemId, label) => {
    set((state) =>
      updateCurrentBlock(state, blockId, (block) => withNavItemLabel(block, itemId, label)),
    )
  },

  setNavItemLink: (blockId, itemId, link) => {
    set((state) =>
      updateCurrentBlock(state, blockId, (block) => withNavItemLink(block, itemId, link)),
    )
  },

  removeNavItem: (blockId, itemId) => {
    set((state) =>
      updateCurrentBlock(state, blockId, (block) => withNavItemRemoved(block, itemId)),
    )
  },

  addPage: (name) => {
    const { document, pageId } = addPageTo(documentOf(get()), name)

    // Adding a page moves you onto it — that is the only reason to add one.
    set((state) => ({ ...applyDocument(state, document), ...focusOn(pageId) }))
    return pageId
  },

  renamePage: (pageId, name) => {
    set((state) => applyDocument(state, renamePageIn(documentOf(state), pageId, name)))
  },

  duplicatePage: (pageId) => {
    const { document, pageId: copyId } = duplicatePageIn(documentOf(get()), pageId)

    set((state) => ({ ...applyDocument(state, document), ...focusOn(copyId) }))
    return copyId
  },

  deletePage: (pageId) => {
    const state = get()
    const { document, revertedLinks } = deletePageFrom(documentOf(state), pageId)
    if (document.pages === state.pages) return 0

    // Land on the page that took the deleted one's place, or the new last page.
    const wasAt = state.pages.findIndex((page) => page.id === pageId)
    const landing = document.pages[Math.min(wasAt, document.pages.length - 1)]

    set((current) => ({
      ...applyDocument(current, document),
      ...(current.currentPageId === pageId && landing ? focusOn(landing.id) : {}),
    }))

    return revertedLinks
  },

  movePage: (pageId, delta) => {
    set((state) => applyDocument(state, movePageIn(documentOf(state), pageId, delta)))
  },

  /**
   * Switching pages clears selection and any open editor: both name a block that is
   * no longer on screen, and an editor left open over a page that is gone would
   * commit its draft into thin air.
   */
  setCurrentPage: (pageId) => {
    set((state) => {
      if (state.currentPageId === pageId) return state
      if (!pageById(state.pages, pageId)) return state
      return focusOn(pageId)
    })
  },

  updateSiteSettings: (patch) => {
    set((state) => updateSettings(state, (settings) => applySettingsPatch(settings, patch)))
  },

  setSiteColor: (index, color) => {
    set((state) => updateSettings(state, (settings) => withColorAt(settings, index, color)))
  },

  removeSiteColor: (index) => {
    set((state) => updateSettings(state, (settings) => withColorRemoved(settings, index)))
  },

  /**
   * Swap in a whole document — the one action undo/redo and the autosave restore
   * both go through.
   *
   * Selection and the current page are preserved rather than cleared: undoing a
   * move should not also yank the client's selection away or send them to another
   * page. Both ARE pruned when what they name no longer exists, because an undo can
   * take back the very block that was selected or the very page being looked at.
   */
  replaceDocument: (document) => {
    set((state) => {
      const update = applyDocument(state, document)
      if (update === state) return state

      const currentPageId = pageById(document.pages, state.currentPageId)
        ? state.currentPageId
        : (document.pages[0]?.id ?? '')

      const onPage = blocksOfPage(document, currentPageId)
      const exists = (id: string | null) => id !== null && onPage.some((block) => block.id === id)

      return {
        ...update,
        currentPageId,
        selectedBlockId: exists(state.selectedBlockId) ? state.selectedBlockId : null,
        editingBlockId: exists(state.editingBlockId) ? state.editingBlockId : null,
      }
    })
  },

  resetCanvas: () => {
    set({ ...initialState() })
  },
}))


// Makes the "immutable updates only" house rule enforced rather than merely
// asserted: any in-place write to the document throws in dev, in Vitest and in the
// E2E build. Folded out of the production bundle. See src/store/devFreeze.ts.
installDocumentFreeze(useCanvasStore)

/** Convenience for tests and the window test bridge. */
export function getCanvasSnapshot(): CanvasState {
  const { siteSettings, pages, currentPageId, selectedBlockId, editingBlockId } =
    useCanvasStore.getState()
  return { siteSettings, pages, currentPageId, selectedBlockId, editingBlockId }
}

/** The undoable/persisted slice, split out of the transient UI state. */
export function getCanvasDocument(): CanvasDocument {
  return documentOf(useCanvasStore.getState())
}
