import { blocksEqual, withTemplateFlagClearedOnEdit } from '../canvas/blockEdits.ts'
import {
  documentsEqual,
  emptyDocument,
  MIN_PAGE_COUNT,
  withPageBlocks,
  withPageStrokes,
  withSiteSettings,
} from '../canvas/document.ts'
import { pageById } from '../canvas/pages.ts'
import { isEmptySiteSettings } from '../canvas/siteSettings.ts'
import type { SiteSettingsPatch } from '../canvas/siteSettings.ts'
import type {
  Block,
  BlockLink,
  BlockTypeId,
  CanvasDocument,
  CopyMode,
  ImageFit,
  Page,
  PenStroke,
  ResizeHandle,
  SiteSettings,
} from '../canvas/types.ts'

/**
 * THE STORE'S SHAPE — state, action signatures, selectors, and the four helpers
 * every action is built from.
 *
 * Split out of `canvasStore.ts` so that file stays what it claims to be: a list of
 * named actions, each a thin shell over a pure function. Everything here is pure
 * too — it takes a state and returns a state or a partial, with no `set`, no `get`
 * and no Zustand anywhere.
 *
 * The house rule those helpers exist to hold: **return the ORIGINAL state object
 * when nothing changed.** Zustand skips notifying subscribers when an updater
 * returns the state it was given, which is what makes a no-op gesture free — no
 * React re-render, no undo step, no autosave.
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

  /**
   * `''` empties the slot (and clears the filename with it). The description is
   * kept either way. `originalFilename` is the client's own file name, verbatim —
   * the export manifest needs it and cannot recover it later (§4.6).
   */
  setBlockImage: (id: string, imageData: string, originalFilename?: string) => void
  setBlockImageFit: (id: string, fit: ImageFit) => void
  setBlockImageDescription: (id: string, description: string) => void

  /** One finished stroke = one undo step; the in-progress trail never comes here. */
  addPenStroke: (stroke: PenStroke) => void
  removePenStroke: (strokeId: string) => void

  setBlockCopyMode: (id: string, mode: CopyMode) => void
  setBlockGenerateDescription: (id: string, description: string) => void
  setBlockLengthHint: (id: string, hint: string) => void
  setBlockLink: (id: string, link: BlockLink) => void

  addNavItem: (blockId: string, label: string) => void
  setNavItemLabel: (blockId: string, itemId: string, label: string) => void
  setNavItemLink: (blockId: string, itemId: string, link: BlockLink) => void
  removeNavItem: (blockId: string, itemId: string) => void

  /**
   * PAGE LENGTH. One click of each, one undo step each — history stores whole-document
   * snapshots keyed on `pages` identity, so no extra wiring is needed.
   */
  addPageSpace: (pageId: string) => void
  /** Gives back ALL the empty room at once — one click to "crop it back". */
  trimPageSpace: (pageId: string) => void
  /** The drag handle's commit point: an exact amount, clamped on the way in. */
  setPageSpace: (pageId: string, extraBottomPx: number) => void

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
const NO_STROKES: readonly PenStroke[] = []

export function initialState(): CanvasState {
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

export function selectCurrentStrokes(state: CanvasState): readonly PenStroke[] {
  return selectCurrentPage(state)?.penStrokes ?? NO_STROKES
}

/**
 * How much empty room the page on screen is holding open below its content. A plain
 * number rather than the page object so the canvas re-renders on the value, not on
 * every edit to the page it belongs to. Absent means none (`Page.extraBottomPx`).
 */
export function selectCurrentExtraBottom(state: CanvasState): number {
  return selectCurrentPage(state)?.extraBottomPx ?? 0
}

/** Is there anything for "Start over" to clear — on ANY page, or in the settings? */
export function selectHasContent(state: CanvasState): boolean {
  return (
    state.pages.length > MIN_PAGE_COUNT ||
    state.pages.some((page) => page.blocks.length > 0 || page.penStrokes.length > 0) ||
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
 *
 * THIS IS ALSO WHERE `fromTemplate` IS CLEARED, and deliberately the only place.
 * Every per-block action in the store — text, geometry, copy mode, link, nav
 * items, photo, fit, description — is `updateCurrentBlock` over this function, so
 * "the client edited this block's content" has exactly one definition instead of
 * fifteen that could drift apart. The rule itself, and why the line is drawn
 * where it is, lives with `withTemplateFlagClearedOnEdit`.
 *
 * Z-order never reaches here: `bringForward`/`sendBackward` reorder the array
 * without producing a new block object. Nor does adding or deleting one.
 */
export function withUpdatedBlock(
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
  updated[index] = withTemplateFlagClearedOnEdit(current, next)
  return updated
}

export type StateUpdate = CanvasState | Partial<CanvasState>

/** Apply a blocks transform to the current page; identity in, identity out. */
export function updateCurrentBlocks(
  state: CanvasState,
  update: (blocks: readonly Block[]) => readonly Block[],
): StateUpdate {
  const next = withPageBlocks(documentOf(state), state.currentPageId, update)
  return next.pages === state.pages ? state : { pages: next.pages }
}

/** Apply a strokes transform to the current page; identity in, identity out. */
export function updateCurrentStrokes(
  state: CanvasState,
  update: (strokes: readonly PenStroke[]) => readonly PenStroke[],
): StateUpdate {
  const next = withPageStrokes(documentOf(state), state.currentPageId, update)
  return next.pages === state.pages ? state : { pages: next.pages }
}

export function updateCurrentBlock(
  state: CanvasState,
  id: string,
  update: (block: Block) => Block,
): StateUpdate {
  return updateCurrentBlocks(state, (blocks) => withUpdatedBlock(blocks, id, update))
}

export function applyDocument(state: CanvasState, next: CanvasDocument): StateUpdate {
  if (documentsEqual(next, documentOf(state))) return state
  return { siteSettings: next.siteSettings, pages: next.pages }
}

export function updateSettings(
  state: CanvasState,
  update: (settings: SiteSettings) => SiteSettings,
): StateUpdate {
  return applyDocument(state, withSiteSettings(documentOf(state), update(state.siteSettings)))
}

export type PageFocus = Pick<CanvasState, 'currentPageId' | 'selectedBlockId' | 'editingBlockId'>

/** Moving to a page always lands deselected, with no editor open. */
export function focusOn(pageId: string): PageFocus {
  return { currentPageId: pageId, selectedBlockId: null, editingBlockId: null }
}
