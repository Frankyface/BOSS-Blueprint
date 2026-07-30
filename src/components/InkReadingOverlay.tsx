import { inkReadingTag } from '../canvas/inkReading.ts'
import type { InkRegion } from '../canvas/ink/types.ts'

import './InkReadingOverlay.css'

/**
 * WHAT WE READ, DRAWN ON TOP OF THE DRAWING.
 *
 * One faint dashed box per region and one lowercase word naming it. That is the
 * whole feature: the client can see that their box became a `card`, their
 * handwriting became `words`, and — the case that started this — that the wave they
 * drew across the top became a `drawing` rather than vanishing into the notes pile.
 *
 * IT IS A `<g>`, NOT ITS OWN LAYER, on purpose. Painted inside `PenLayer`'s SVG it
 * inherits the page's coordinate system for free: region frames are already in
 * unscaled page pixels, so a box drawn at x=120 is outlined at x=120 with no
 * bookkeeping and no second fit-to-window transform to keep in step.
 *
 * IT IS EDITOR CHROME AND ONLY EDITOR CHROME. The exported PNG is captured from
 * `mountExportRoot`'s own offscreen root, which renders `page.penStrokes` itself and
 * never mounts `PenLayer` — the same reason `canvas-area__more` sits outside
 * `.canvas-page`. Chrome that could reach the deliverable is chrome the client did
 * not ask us to build.
 *
 * DECORATION, NOT CONTENT: `aria-hidden` and `pointer-events: none`. The reading it
 * shows is spoken instead by the summary sentence in `PenControls`, which is real
 * text in the toolbar and reachable by keyboard and screen reader.
 */

interface InkReadingOverlayProps {
  readonly regions: readonly InkRegion[]
}

/** Page pixels, so it survives the ~0.6 fit-to-window scale a laptop renders at. */
const TAG_FONT_SIZE_PX = 18

/** How far above its box a tag sits, measured from the tag's baseline. */
const TAG_OFFSET_PX = 6

/** A tag for a region at the very top of the page drops inside it instead. */
function tagBaseline(top: number): number {
  return Math.max(top - TAG_OFFSET_PX, TAG_FONT_SIZE_PX)
}

export function InkReadingOverlay({ regions }: InkReadingOverlayProps) {
  if (regions.length === 0) return null

  return (
    <g className="ink-reading" data-testid="ink-reading" aria-hidden="true">
      {regions.map((region) => (
        <g key={region.id} data-region-id={region.id}>
          <rect
            className="ink-reading__frame"
            data-testid="ink-reading-frame"
            data-ink-kind={region.kind}
            data-ink-confidence={region.confidence}
            x={region.frame.x}
            y={region.frame.y}
            width={region.frame.w}
            height={region.frame.h}
          />
          <text
            className="ink-reading__tag"
            data-testid="ink-reading-tag"
            data-ink-confidence={region.confidence}
            x={region.frame.x}
            y={tagBaseline(region.frame.y)}
            fontSize={TAG_FONT_SIZE_PX}
          >
            {inkReadingTag(region)}
          </text>
        </g>
      ))}
    </g>
  )
}
