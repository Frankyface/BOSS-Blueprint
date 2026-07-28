import { PAGE_WIDTH_PX } from '../canvas/constants.ts'
import type { TemplatePage } from '../templates/index.ts'

/** Width of the preview frame in CSS pixels; the page is scaled down to fit it. */
const THUMBNAIL_WIDTH_PX = 288
/** How much of the page's height the frame shows — nav, hero and a hint of what follows. */
const THUMBNAIL_HEIGHT_PX = 180

const SCALE = THUMBNAIL_WIDTH_PX / PAGE_WIDTH_PX
const VISIBLE_PAGE_HEIGHT_PX = THUMBNAIL_HEIGHT_PX / SCALE

interface TemplateThumbnailProps {
  page: TemplatePage
}

/**
 * A LIVE MINIATURE of a template's home page — the real fixture blocks, scaled.
 *
 * Chosen over shipping four PNGs, and it is not a close call: a picture would be a
 * second copy of the layout that no test can compare against the data, and it
 * would go stale the first time a heading moved. This renders the same blocks in
 * the same paint order at the same coordinates as the canvas does, so the picker
 * card cannot show a design the client will not get.
 *
 * The blocks are deliberately WORDLESS: at 0.24 scale real copy is a grey smudge,
 * and the card already carries a sentence saying what the template is. What the
 * miniature is for is the SHAPE — a menu strip, a big picture, three columns —
 * which is exactly what survives being shrunk.
 */
export function TemplateThumbnail({ page }: TemplateThumbnailProps) {
  return (
    <span
      className="template-thumb"
      data-testid="template-thumbnail"
      aria-hidden="true"
      style={{ width: `${String(THUMBNAIL_WIDTH_PX)}px`, height: `${String(THUMBNAIL_HEIGHT_PX)}px` }}
    >
      <span
        className="template-thumb__page"
        style={{
          width: `${String(PAGE_WIDTH_PX)}px`,
          height: `${String(VISIBLE_PAGE_HEIGHT_PX)}px`,
          transform: `scale(${String(SCALE)})`,
        }}
      >
        {page.blocks.map((block, index) => (
          <span
            key={block.id}
            className="template-thumb__block"
            data-block-type={block.type}
            style={{
              left: `${String(block.x)}px`,
              top: `${String(block.y)}px`,
              width: `${String(block.width)}px`,
              height: `${String(block.height)}px`,
              zIndex: index + 1,
            }}
          />
        ))}
      </span>
    </span>
  )
}
