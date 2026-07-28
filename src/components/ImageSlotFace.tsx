import type { HTMLAttributes, ReactNode } from 'react'

import { imageDataOf, imageDescriptionOf, imageFitOf } from '../canvas/blockEdits.ts'
import type { Block } from '../canvas/types.ts'

const IMAGE_GLYPH = '⛰'
const EMPTY_CAPTION = 'Image'

interface ImageSlotFaceProps {
  block: Block
  /** Editor-only: the drag-over highlight. The export render never sets it. */
  isDropTarget?: boolean
  /** Editor-only wiring (the drop handlers) spread onto the slot container. */
  containerProps?: HTMLAttributes<HTMLDivElement>
  /** Editor-only chrome (the upload button and its file input). */
  children?: ReactNode
}

/**
 * THE VISIBLE FACE OF AN IMAGE SLOT — the photo if there is one, the dashed
 * placeholder frame plus the client's description if there isn't.
 *
 * Split out of `ImageSlot` so the Stage 3 export root can mount THE SAME markup
 * and classes with none of the upload wiring (`src/export/png/exportRoot.tsx`).
 * The export contract is explicit that an empty slot renders its placeholder
 * frame and description exactly as the editor shows it (§4.3) — the only way to
 * keep that true through every future restyle is for both renderers to be this
 * one component. Everything the editor adds on top (the picker button, the file
 * input, the drop handlers) arrives as props, so the export render is chrome-free
 * by construction rather than by remembering to strip things.
 */
export function ImageSlotFace({ block, isDropTarget = false, containerProps, children }: ImageSlotFaceProps) {
  const imageData = imageDataOf(block)
  const description = imageDescriptionOf(block)
  const fit = imageFitOf(block)
  const hasPhoto = imageData.length > 0

  return (
    <div
      {...containerProps}
      className={`block-content block-content--image${hasPhoto ? ' block-content--image-filled' : ''}`}
      data-testid="image-slot"
      data-placeholder={hasPhoto ? 'false' : 'true'}
      data-has-image={hasPhoto ? 'true' : 'false'}
      data-fit={fit}
      data-drop-target={isDropTarget ? 'true' : 'false'}
    >
      {hasPhoto ? (
        <img
          className="block-content__photo"
          data-testid="image-slot-photo"
          // Always a same-origin `data:` URI (Stage 2 compresses on ingest), which
          // is what keeps canvas tainting off the export's failure list entirely.
          src={imageData}
          // The client's description is meta-commentary, not alt text (§2.7): the
          // export writes real alt text FROM it at build time. Decorative here.
          alt=""
          style={{ objectFit: fit }}
          draggable={false}
        />
      ) : (
        <>
          <span className="block-content__glyph" aria-hidden="true">
            {IMAGE_GLYPH}
          </span>
          <span className="block-content__caption" data-testid="image-slot-caption">
            {description.length > 0 ? description : EMPTY_CAPTION}
          </span>
        </>
      )}

      {children}
    </div>
  )
}
