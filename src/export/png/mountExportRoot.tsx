import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { PAGE_WIDTH_PX } from '../../canvas/constants.ts'
import type { Page } from '../../canvas/types.ts'

import { EXPORT_ROOT_TEST_ID, PageExportRoot } from './exportRoot.tsx'

/**
 * Mount the export root offscreen, hand back the node the engines capture, and
 * take it down again.
 *
 * OFFSCREEN, NOT HIDDEN. The host is `position: fixed; left: -20000px; top: 0` —
 * pushed out of sight but fully LAID OUT, which is what capture needs.
 * `display: none` has no layout at all and `visibility: hidden` is rendered as
 * blank by some capture paths; either would produce a PNG that passes its
 * dimension checks and shows nothing. This is the single most likely way to get
 * a silently blank export, so the positioning is not a detail.
 *
 * The root is mounted with `flushSync` so the DOM exists the moment this
 * function returns — a concurrent render would let the capture run against an
 * empty container.
 */

/** Far enough left that no engine's "is it visible?" heuristic can see it. */
const OFFSCREEN_LEFT_PX = -20_000

export interface MountedExportRoot {
  /** The `1200 × height` element with `overflow: hidden` — what gets captured. */
  readonly node: HTMLElement
  /** Unmounts React and removes the host. Safe to call twice. */
  readonly dispose: () => void
}

export function mountExportRoot(page: Page, height: number): MountedExportRoot {
  const host = document.createElement('div')
  host.dataset.testid = 'export-root-host'
  host.setAttribute('aria-hidden', 'true')
  host.style.position = 'fixed'
  host.style.left = `${String(OFFSCREEN_LEFT_PX)}px`
  host.style.top = '0'
  host.style.width = `${String(PAGE_WIDTH_PX)}px`
  host.style.height = `${String(height)}px`
  host.style.margin = '0'
  host.style.padding = '0'
  host.style.pointerEvents = 'none'

  document.body.append(host)

  const root = createRoot(host)
  flushSync(() => {
    root.render(<PageExportRoot page={page} height={height} />)
  })

  const node = host.querySelector<HTMLElement>(`[data-testid="${EXPORT_ROOT_TEST_ID}"]`)
  if (!node) {
    root.unmount()
    host.remove()
    throw new Error('The export root did not mount — nothing to capture.')
  }

  let disposed = false

  return {
    node,
    dispose: () => {
      if (disposed) return
      disposed = true
      root.unmount()
      host.remove()
    },
  }
}
