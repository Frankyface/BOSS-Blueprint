import { PAGE_WIDTH_PX } from '../../canvas/constants.ts'
import { pageHeightForContent } from '../../canvas/geometry.ts'
import type { CanvasDocument, Page } from '../../canvas/types.ts'
import { captureWithEngine, inspectPngBlob, settleForCapture } from '../../platform/browserPngPorts.ts'

import { resolveEngineOrder } from './engineOrder.ts'
import { expectsVisibleInk } from './inkExpectation.ts'
import { mountExportRoot } from './mountExportRoot.tsx'
import { runRenderLadder } from './renderLadder.ts'
import type { RenderLadderPorts } from './renderLadder.ts'
import type { PageRenderResult } from './types.ts'

/**
 * RENDER ONE PAGE TO ONE PNG — the only way anything in this app produces a page
 * PNG (§4.3, and the "one interface, two engines" criterion).
 *
 * The height comes from `pageHeightForContent`, the SHARED §4.2 function the
 * editor canvas sizes itself with; the width is the fixed 1200px page. Neither
 * is ever measured off the DOM, so the PNG's dimensions are a pure function of
 * the document and `site.json` cannot disagree with the picture.
 */

/**
 * How tall this page's PNG will be — the same answer the editor canvas gives.
 *
 * The page's own `extraBottomPx` goes in as the third argument, so a client who
 * added room at the bottom gets that room in the deliverable too; `siteJson.ts`
 * feeds the identical number to the identical function, which is what keeps
 * `page.height` and the PNG's IHDR in agreement (V6 blocks the submission if they
 * ever differ).
 */
export function exportHeightForPage(page: Page): number {
  return pageHeightForContent(page.blocks, page.penStrokes, page.extraBottomPx)
}

function pageOf(document: CanvasDocument, pageId: string): Page {
  const page = document.pages.find((candidate) => candidate.id === pageId)
  if (!page) throw new Error(`Cannot render page "${pageId}": no such page in this design.`)
  return page
}

/**
 * `async` rather than a plain `Promise`-returning function on purpose: a bad
 * page id must REJECT, not throw synchronously past a caller's `.catch`.
 *
 * @throws {PngRenderError} once the ladder (primary → retry → fallback) is spent,
 * carrying the client-facing V6 wording and the per-attempt engine detail.
 */
export async function renderPagePng(
  document: CanvasDocument,
  pageId: string,
): Promise<PageRenderResult> {
  const page = pageOf(document, pageId)
  const height = exportHeightForPage(page)

  const ports: RenderLadderPorts = {
    mount: () => mountExportRoot(page, height),
    settle: settleForCapture,
    capture: captureWithEngine,
    inspect: inspectPngBlob,
  }

  return runRenderLadder(
    {
      pageId,
      expected: { width: PAGE_WIDTH_PX, height },
      // STROKES COUNT AS CONTENT HERE TOO — but only once they promise enough ink
      // for the floor to be able to judge the capture at all (`inkExpectation.ts`
      // holds the reasoning). Without this arm, the one page where ink IS the
      // whole deliverable was the one page whose ink nothing verified.
      requiresInk: page.blocks.length > 0 || expectsVisibleInk(page.penStrokes, height),
      hasStrokes: page.penStrokes.length > 0,
      engines: resolveEngineOrder(),
    },
    ports,
  )
}
