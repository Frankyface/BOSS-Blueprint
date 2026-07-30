import { useEffect, useRef } from 'react'

import { PAGE_EXTRA_SPACE_MAX_PX } from '../canvas/constants.ts'
import { pageHeightForContent } from '../canvas/geometry.ts'
import type { Block, PenStroke } from '../canvas/types.ts'
import {
  selectCurrentBlocks,
  selectCurrentExtraBottom,
  selectCurrentStrokes,
  useCanvasStore,
} from '../store/canvasStore.ts'

import './PageSpaceControls.css'

const GROUP_LABEL = 'Page length'
const ADD_HINT = 'Make the page longer, so there is room to sketch below what you have.'

/** Why "Trim" is greyed out. Stated, not implied — the N4 precedent in `PageNameForm`. */
const TRIM_DISABLED_REASON =
  'Nothing to trim — the page is already as short as your content allows.'

const TRIM_HINT = 'Take the empty space back off the bottom of the page.'

/** Why "Add space" is greyed out, on the same N4 rule as the one above. */
const ADD_DISABLED_REASON =
  'That is as much empty space as one page can hold — try a new page instead.'

const REASON_ID = 'page-space-hint'

/**
 * THE SPACE THAT ACTUALLY LANDED — not the space that was asked for.
 *
 * `extraBottomPx` is the REQUEST; `pageHeightForContent` clamps the page to
 * `MAX_PAGE_HEIGHT_PX` AFTER adding it, so on a page whose content already fills the
 * sheet only part of the request — none of it, at the cap — becomes real height. The
 * button state and the hint are worded from THIS number so neither can claim room the
 * page never grew by. Byte-identical to the export validator's V31 definition
 * (`src/export/validate/rules/warnings.ts`: page height minus content-only height),
 * so the editor and the delivered package agree about what a request became.
 */
function appliedSpaceOf(
  blocks: readonly Block[],
  strokes: readonly PenStroke[],
  extraBottomPx: number,
): number {
  return (
    pageHeightForContent(blocks, strokes, extraBottomPx) - pageHeightForContent(blocks, strokes, 0)
  )
}

/**
 * The page can grow no further once even the LARGEST request the client is allowed to
 * make would add nothing more — whichever ceiling it meets first, the request cap
 * (`PAGE_EXTRA_SPACE_MAX_PX`) or the page-height cap (`MAX_PAGE_HEIGHT_PX`). At that
 * point "Add space" does nothing, so it greys out and says why on its own title.
 */
function isPageFull(
  blocks: readonly Block[],
  strokes: readonly PenStroke[],
  extraBottomPx: number,
): boolean {
  return (
    pageHeightForContent(blocks, strokes, extraBottomPx) >=
    pageHeightForContent(blocks, strokes, PAGE_EXTRA_SPACE_MAX_PX)
  )
}

/**
 * One line that always says where the page stands — worded from the space that
 * ACTUALLY landed, so "did that do anything?" is answerable without measuring the
 * sheet. The disabled REASONS sit on each button's own title (the N4 precedent),
 * leaving this line free to report only the result.
 */
function hintFor(appliedPx: number): string {
  if (appliedPx <= 0) return TRIM_DISABLED_REASON
  return `Added ${String(appliedPx)}px of space below your page.`
}

/** The three numbers both halves of this control read the page's length from. */
function usePageSpace(): { appliedPx: number; hasSpace: boolean; isFull: boolean } {
  const blocks = useCanvasStore(selectCurrentBlocks)
  const strokes = useCanvasStore(selectCurrentStrokes)
  const extraBottomPx = useCanvasStore(selectCurrentExtraBottom)

  const appliedPx = appliedSpaceOf(blocks, strokes, extraBottomPx)
  return {
    appliedPx,
    hasSpace: appliedPx > 0,
    isFull: isPageFull(blocks, strokes, extraBottomPx),
  }
}

/**
 * THE SENTENCE, AND WHY IT IS NOT INSIDE THE BUTTON GROUP.
 *
 * It used to sit next to the buttons, which made the group as wide as its longest
 * message — 593px of toolbar for 217px of controls — and a toolbar row costs the
 * client drawing area (`CanvasToolbar.css`). Worse, it made the row's height a
 * function of how wide a platform's font renders one sentence. It lives on the
 * toolbar's fixed line now, beside whatever else has something to say, tied back to
 * the buttons by `aria-describedby` rather than by position.
 *
 * A polite live region (Fix F): when the page grows or is trimmed on the click that
 * disables the button, the change is announced rather than lost with the focus.
 * `role="status"` is the same wiring `PenSettings` uses for its reading.
 */
export function PageSpaceHint() {
  const { appliedPx } = usePageSpace()

  return (
    <p
      className="canvas-toolbar__message page-space__hint"
      id={REASON_ID}
      data-testid="page-space-hint"
      role="status"
    >
      {hintFor(appliedPx)}
    </p>
  )
}

/**
 * PAGE LENGTH — "add more to the bottom of the page, then crop it back".
 *
 * TWO BUTTONS, NOT A DRAG ONLY. There is a grab handle on the page's bottom edge too
 * (`PageSpaceHandle`), but it is pointer-only chrome and its entire function is
 * duplicated here: this repo has already ruled once in writing that a drag "behaves
 * differently in all three engines, is awkward with a trackpad, and is impossible from
 * a keyboard" (`PageStrip.tsx`), and `ResizeHandles.tsx` records the
 * unreachable-from-the-keyboard grip as a known accessibility defect not to widen.
 * Buttons are reachable by Tab, pressable with Enter or Space, and announce their own
 * state — so the feature is not gated on being able to aim at a 12px strip.
 *
 * NO KEY BINDING. `useCanvasKeyboard` deliberately leaves Space and the arrow keys to
 * the browser, because they are how a keyboard client scrolls a 1600px page.
 */
export function PageSpaceControls() {
  const currentPageId = useCanvasStore((state) => state.currentPageId)
  const extraBottomPx = useCanvasStore(selectCurrentExtraBottom)
  const addPageSpace = useCanvasStore((state) => state.addPageSpace)
  const trimPageSpace = useCanvasStore((state) => state.trimPageSpace)

  const addRef = useRef<HTMLButtonElement>(null)
  const trimRef = useRef<HTMLButtonElement>(null)
  /** Which button the client just pressed, so focus can be rescued AFTER it greys out. */
  const pressedRef = useRef<'add' | 'trim' | null>(null)

  const { hasSpace, isFull } = usePageSpace()

  const handleAdd = () => {
    pressedRef.current = 'add'
    addPageSpace(currentPageId)
  }

  const handleTrim = () => {
    pressedRef.current = 'trim'
    trimPageSpace(currentPageId)
  }

  /**
   * KEEP FOCUS IN THE GROUP (Fix F). A button that disables itself on the very click
   * that fires it is blurred by the browser, dropping keyboard focus to <body> — a
   * screen-reader client is left with silence and must re-navigate the toolbar. So
   * AFTER the render that disables the pressed button, hand focus to its still-live
   * sibling. Runs only after a press (the ref is cleared each time), and every valid
   * press changes `extraBottomPx`, so it never misses one.
   */
  useEffect(() => {
    const pressed = pressedRef.current
    if (pressed === null) return
    pressedRef.current = null

    if (pressed === 'add' && isFull) trimRef.current?.focus()
    else if (pressed === 'trim' && !hasSpace && !isFull) addRef.current?.focus()
  }, [extraBottomPx, isFull, hasSpace])

  return (
    <div
      className="page-space"
      role="group"
      aria-label={GROUP_LABEL}
      data-testid="page-space"
      data-extra-bottom={extraBottomPx}
    >
      {/* The group already carries this as its accessible name, so the visible copy
          is hidden from the tree rather than announced twice. */}
      <span className="page-space__label" aria-hidden="true">
        {GROUP_LABEL}
      </span>
      <button
        ref={addRef}
        type="button"
        className="canvas-toolbar__button"
        data-testid="page-space-add"
        disabled={isFull}
        title={isFull ? ADD_DISABLED_REASON : ADD_HINT}
        aria-describedby={REASON_ID}
        onClick={handleAdd}
      >
        Add space
      </button>
      <button
        ref={trimRef}
        type="button"
        className="canvas-toolbar__button"
        data-testid="page-space-trim"
        disabled={!hasSpace}
        // A disabled button is out of the accessibility tree's reach, so the reason
        // is on the title for a pointer user hovering it as well as in the hint.
        title={hasSpace ? TRIM_HINT : TRIM_DISABLED_REASON}
        aria-describedby={REASON_ID}
        onClick={handleTrim}
      >
        Trim
      </button>
    </div>
  )
}
