import { PAGE_WIDTH_PX } from '../../canvas/constants.ts'
import { pathDataOfStroke } from '../../canvas/penPath.ts'
import type { Block, Page, PenStroke } from '../../canvas/types.ts'
import { BlockContent } from '../../components/BlockContent.tsx'
import { PAGE_BACKGROUND } from './constants.ts'

/**
 * THE EXPORT ROOT — the page, and nothing but the page.
 *
 * WHY THIS IS NOT A SCREENSHOT OF THE LIVE CANVAS. The editor page is
 * transform-scaled to fit the window, wrapped in scrolling containers, decorated
 * with selection outlines, resize handles and a ruled grid, and it sits inside an
 * app shell. Capturing it would mean fighting all of that with CSS overrides at
 * capture time — exactly the silent drift the tri-engine visual regression exists
 * to catch. So the export re-mounts the SAME block components at 1:1 into their
 * own root sized straight from `pageHeightForContent` (§4.2), which is the same
 * function the editor sizes itself with. That shared function is what makes
 * §4.3's "the page exactly as the editor shows it" literally true.
 *
 * THE CLIP IS ONE CSS PROPERTY. `width: 1200px; height: H; overflow: hidden` is
 * the whole of §4.3's rectangle rule: a block dragged to `x = 1000, w = 400`
 * keeps its true left and width in the DOM (and in `site.json`) and is cut at
 * pixel column 1199 by the container. No per-block clamping, no scale-to-fit, no
 * widening — any of which would either lose the client's real geometry or break
 * the "the PNG is 1200 wide" invariant V6, the brief and Stage 4 all rest on.
 * `exportRoot.test.tsx` asserts the computed style directly, so the rule cannot
 * be disabled without a test going red.
 */

/** Blocks paint in array order, exactly as the canvas paints them. */
const FIRST_Z_INDEX = 1

/**
 * Far above any block's z-index, matching `PenLayer.css`: pen strokes always
 * paint above the blocks (§2.9, §4.3).
 */
const PEN_LAYER_Z_INDEX = 100_000

interface ExportBlockProps {
  block: Block
  zIndex: number
}

/**
 * One block, positioned and styled exactly as `BlockView` positions it — minus
 * the gesture handlers, the selection outline and the resize handles. The class
 * names and the data attributes CSS keys on are identical, which is what keeps
 * the two renders pixel-identical without a second stylesheet.
 */
function ExportBlock({ block, zIndex }: ExportBlockProps) {
  return (
    <div
      className={`canvas-block canvas-block--${block.type}`}
      data-testid="export-block"
      data-block-id={block.id}
      data-block-type={block.type}
      // Explicitly false: `.canvas-block[data-selected='true']` draws the
      // selection outline, and "no editor chrome" is a success criterion.
      data-selected="false"
      data-editing="false"
      style={{
        left: `${String(block.x)}px`,
        top: `${String(block.y)}px`,
        width: `${String(block.width)}px`,
        height: `${String(block.height)}px`,
        zIndex,
      }}
    >
      <BlockContent block={block} mode="export" />
    </div>
  )
}

interface ExportPenLayerProps {
  strokes: readonly PenStroke[]
  height: number
}

/**
 * The pen layer, baked in.
 *
 * Rendered from the page's IN-MEMORY strokes — the ones the editor committed and
 * already thinned once (§4.5) — and deliberately NOT from the export's own
 * ε = 0.75 RDP pass, which is a JSON-only reduction. Reading the reduced strokes
 * here would double-thin them and make "the PNG shows exactly what the editor
 * showed" false.
 *
 * Same `pathDataOfStroke` as `PenLayer`, so the outline geometry is the same
 * function, not a second implementation. The eraser hit-lines and the live-stroke
 * element are editor chrome and are absent.
 */
function ExportPenLayer({ strokes, height }: ExportPenLayerProps) {
  if (strokes.length === 0) return null

  return (
    <svg
      className="pen-layer"
      data-testid="export-pen-layer"
      data-stroke-count={strokes.length}
      width={PAGE_WIDTH_PX}
      height={height}
      viewBox={`0 0 ${String(PAGE_WIDTH_PX)} ${String(height)}`}
      style={{ position: 'absolute', inset: 0, zIndex: PEN_LAYER_Z_INDEX, overflow: 'visible' }}
      aria-hidden="true"
    >
      {strokes.map((stroke) => (
        <path key={stroke.id} d={pathDataOfStroke(stroke)} fill={stroke.color} data-stroke-id={stroke.id} />
      ))}
    </svg>
  )
}

export interface PageExportRootProps {
  page: Page
  /** From `pageHeightForContent` — never measured off the DOM (§4.2). */
  height: number
}

/** The element the capture engines are pointed at. */
export const EXPORT_ROOT_TEST_ID = 'export-root'

export function PageExportRoot({ page, height }: PageExportRootProps) {
  return (
    <div
      className="export-page"
      data-testid={EXPORT_ROOT_TEST_ID}
      data-page-id={page.id}
      data-page-width={PAGE_WIDTH_PX}
      data-page-height={height}
      style={{
        position: 'relative',
        // The clip rule, in three declarations. Do not "fix" these.
        width: `${String(PAGE_WIDTH_PX)}px`,
        height: `${String(height)}px`,
        overflow: 'hidden',
        background: PAGE_BACKGROUND,
        // The editor's page has a drop shadow; a sheet of paper in a picture of
        // itself does not. Explicitly cleared rather than merely unset, because
        // `.canvas-page` is one careless class change away from applying here.
        boxShadow: 'none',
        margin: 0,
        padding: 0,
      }}
    >
      {page.blocks.map((block, index) => (
        <ExportBlock key={block.id} block={block} zIndex={FIRST_Z_INDEX + index} />
      ))}
      <ExportPenLayer strokes={page.penStrokes} height={height} />
    </div>
  )
}
