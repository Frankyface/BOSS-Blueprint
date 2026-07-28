import { create } from 'zustand'

import {
  blocksEqual,
  withCopyMode,
  withGenerateDescription,
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
  documentsEqual,
  duplicatePage as duplicatePageIn,
  emptyDocument,
  MIN_PAGE_COUNT,
  movePage as movePageIn,
  renamePage as renamePageIn,
  withPageBlocks,
  withSiteSettings,
} from '../canvas/document.ts'
import { moveRect, resizeRect } from '../canvas/geometry.ts'
import { navItemsFromText, withNavItems } from '../canvas/navItems.ts'
import { pageById } from '../canvas/pages.ts'
import {
  applySettingsPatch,
  isEmptySiteSettings,
  withColorAt,
  withColorRemoved,
} from '../canvas/siteSettings.ts'
import type { SiteSettingsPatch } from '../canvas/siteSettings.ts'
import type {
  Block,
  BlockLink,
  BlockTypeId,
  CanvasDocument,
  CopyMode,
  Page,
  ResizeHandle,
  SiteSettings,
} from '../canvas/types.ts'
import { toRect } from '../canvas/types.ts'
import { bringForward, insertBlock, sendBackward } from '../canvas/zorder.ts'
import { getBlockTypeDefinition } from '../constants/blockTypes.ts'

import { installDocumentFreeze } from './devFreeze.ts'

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

export interface CanvasState {
  readonly siteSettings: SiteSettings
  /** Ordered; `pages[0]` is the homepage. Never empty. */
  readonly pages: readonly Page[]
  /**
   * Which page the canvas is showing.
   *
   * UI STATE, not document state: switching pages is not an undo step and is not
   * autosaved. Undo must put the client's *content* back, not teleport them to
   * whichever page they happened to be on when they made the change — the same
   * reasoning that keeps selection out of history.
   */
  readonly currentPageId: string
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

  setBlockCopyMode: (id: string, mode: CopyMode) => void
  setBlockGenerateDescription: (id: string, description: string) => void
  setBlockLengthHint: (id: string, hint: string) => void
  setBlockLink: (id: string, link: BlockLink) => void

  addNavItem: (blockId: string, label: string) => void
  setNavItemLabel: (blockId: string, itemId: string, label: string) => void
  setNavItemLink: (blockId: string, itemId: string, link: BlockLink) => void
  removeNavItem: (blockId: string, itemId: string) => void

  addPage: (name: string) => string
  renamePage: (pageId: string, name: string) => void
  duplicatePage: (pageId: string) => string
  /** Returns how many links reverted to "none", so the caller can say so. */
  deletePage: (pageId: string) => number
  movePage: (pageId: string, delta: number) => void
  setCurrentPage: (pageId: string) => void

  updateSiteSettings: (patch: SiteSettingsPatch) => void
  setSiteColor: (index: number, color: string) => void
  removeSiteColor: (index: number) => void

  replaceDocument: (document: CanvasDocument) => void
  resetCanvas: () => void
}

export type CanvasStore = CanvasState & CanvasActions

/** Shared empty list so "this page has no blocks" is a stable reference. */
const NO_BLOCKS: readonly Block[] = []

function initialState(): CanvasState {
  const document = emptyDocument()
  return {
    siteSettings: document.siteSettings,
    pages: document.pages,
    currentPageId: document.pages[0]?.id ?? '',
    selectedBlockId: null,
    editingBlockId: null,
  }
}

export const INITIAL_CANVAS_STATE: CanvasState = initialState()

export function documentOf(state: CanvasState): CanvasDocument {
  return { siteSettings: state.siteSettings, pages: state.pages }
}

export function selectCurrentPage(state: CanvasState): Page | null {
  return pageById(state.pages, state.currentPageId)
}

export function selectCurrentBlocks(state: CanvasState): readonly Block[] {
  return selectCurrentPage(state)?.blocks ?? NO_BLOCKS
}

/** Is there anything for "Start over" to clear — on ANY page, or in the settings? */
export function selectHasContent(state: CanvasState): boolean {
  return (
    state.pages.length > MIN_PAGE_COUNT ||
    state.pages.some((page) => page.blocks.length > 0) ||
    !isEmptySiteSettings(state.siteSettings)
  )
}

export function selectSelectedBlock(state: CanvasState): Block | null {
  if (state.selectedBlockId === null) return null
  return selectCurrentBlocks(state).find((block) => block.id === state.selectedBlockId) ?? null
}

/**
 * Replace one block on the current page immutably. Returns the ORIGINAL state when
 * the id is unknown or the update changed nothing, so no-op gestures don't churn
 * React or the undo stack.
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
  if (blocksEqual(current, next)) return blocks

  const updated = blocks.slice()
  updated[index] = next
  return updated
}

type StateUpdate = CanvasState | Partial<CanvasState>

/** Apply a blocks transform to the current page; identity in, identity out. */
function updateCurrentBlocks(
  state: CanvasState,
  update: (blocks: readonly Block[]) => readonly Block[],
): StateUpdate {
  const next = withPageBlocks(documentOf(state), state.currentPageId, update)
  return next.pages === state.pages ? state : { pages: next.pages }
}

function updateCurrentBlock(
  state: CanvasState,
  id: string,
  update: (block: Block) => Block,
): StateUpdate {
  return updateCurrentBlocks(state, (blocks) => withUpdatedBlock(blocks, id, update))
}

function applyDocument(state: CanvasState, next: CanvasDocument): StateUpdate {
  if (documentsEqual(next, documentOf(state))) return state
  return { siteSettings: next.siteSettings, pages: next.pages }
}

function updateSettings(
  state: CanvasState,
  update: (settings: SiteSettings) => SiteSettings,
): StateUpdate {
  return applyDocument(state, withSiteSettings(documentOf(state), update(state.siteSettings)))
}

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

type PageFocus = Pick<CanvasState, 'currentPageId' | 'selectedBlockId' | 'editingBlockId'>

/** Moving to a page always lands deselected, with no editor open. */
function focusOn(pageId: string): PageFocus {
  return { currentPageId: pageId, selectedBlockId: null, editingBlockId: null }
}

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
