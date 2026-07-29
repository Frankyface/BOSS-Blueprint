import { copyModeOf, isGenerateBlock, linkOf, navItemsOf } from '../canvas/blockEdits.ts'
import { displayText, isShowingPlaceholder, parseNavItems } from '../canvas/blockText.ts'
import type { Block, BlockLink } from '../canvas/types.ts'

import { ImageSlot } from './ImageSlot.tsx'
import { ImageSlotFace } from './ImageSlotFace.tsx'

const LINKED_GLYPH = '↪'
const EXTERNAL_GLYPH = '↗'

const GENERATE_PROMPT_PLACEHOLDER = 'Tell us what this should say…'

/**
 * Who is rendering this block. `edit` is the live canvas; `export` is the Stage 3
 * PNG export root, which mounts these same components at 1:1 with no wiring
 * (`src/export/png/exportRoot.tsx`). The two modes differ in exactly one place —
 * an image slot's upload affordances — which is the whole reason the flag exists
 * rather than a parallel set of export-only components that could drift.
 */
export type BlockRenderMode = 'edit' | 'export'

interface BlockContentProps {
  block: Block
  mode?: BlockRenderMode
}

/**
 * A copy block in "write it for me" mode shows the CLIENT'S DESCRIPTION, not the
 * words — because there are no words yet. It reads as a note to us rather than as
 * content, which is exactly what it is; the hatched, dashed styling in
 * `BlockView.css` completes the distinction.
 */
function GenerateFace({ block }: BlockContentProps) {
  const description = block.generateDescription ?? ''
  const hasDescription = description.length > 0

  return (
    <div
      className={`block-content block-content--${block.type} block-content--generate`}
      data-placeholder={hasDescription ? 'false' : 'true'}
      data-testid="generate-face"
    >
      <em className="block-content__generate-text">
        {hasDescription ? description : GENERATE_PROMPT_PLACEHOLDER}
      </em>
    </div>
  )
}

/** Glyph marking a wired destination, so linking is visible on the page itself. */
function LinkMark({ link }: { link: BlockLink }) {
  if (link.kind === 'none') return null

  return (
    <span className="block-content__link-mark" data-testid="link-mark" aria-hidden="true">
      {link.kind === 'external' ? EXTERNAL_GLYPH : LINKED_GLYPH}
    </span>
  )
}

/**
 * The visible face of a block. Every type gets a distinct silhouette so the page
 * reads as a page at a glance, and readable placeholder copy until the client
 * types their own.
 */
export function BlockContent({ block, mode = 'edit' }: BlockContentProps) {
  const text = displayText(block)
  const placeholderFlag = isShowingPlaceholder(block) ? 'true' : 'false'

  if (isGenerateBlock(block)) return <GenerateFace block={block} />

  // The image slot owns its own upload wiring, so it is a component rather than
  // markup — everything else here stays a pure function of the block. The export
  // render takes the face without the wiring (§4.3: no editor chrome).
  if (block.type === 'image') {
    return mode === 'export' ? <ImageSlotFace block={block} /> : <ImageSlot block={block} />
  }


  if (block.type === 'section') {
    return (
      <div className="block-content block-content--section" data-placeholder="true">
        <span className="block-content__tag">{text}</span>
      </div>
    )
  }

  if (block.type === 'nav-bar') {
    const items = navItemsOf(block)

    // No items yet = the client has not touched this nav bar, so its face is the
    // type's placeholder menu, exactly as it was before structured items existed.
    if (items.length === 0) {
      return (
        <nav className="block-content block-content--nav" data-placeholder="true">
          {parseNavItems(text).map((label, index) => (
            <span
              // Nav labels can repeat, so position is the only stable identity here.
              key={`${label}-${String(index)}`}
              className="block-content__nav-item"
              data-testid="nav-item"
              data-link-kind="none"
            >
              {label}
            </span>
          ))}
        </nav>
      )
    }

    return (
      <nav className="block-content block-content--nav" data-placeholder="false">
        {items.map((item) => (
          <span
            key={item.id}
            className="block-content__nav-item"
            data-testid="nav-item"
            data-link-kind={item.link.kind}
          >
            {item.label}
            <LinkMark link={item.link} />
          </span>
        ))}
      </nav>
    )
  }

  if (block.type === 'heading') {
    return (
      <div
        className="block-content block-content--heading"
        data-placeholder={placeholderFlag}
        data-copy-mode={copyModeOf(block)}
      >
        {text}
      </div>
    )
  }

  if (block.type === 'button') {
    const link = linkOf(block)
    return (
      <div className="block-content block-content--button" data-placeholder={placeholderFlag}>
        <span className="block-content__pill" data-link-kind={link.kind}>
          {text}
          <LinkMark link={link} />
        </span>
      </div>
    )
  }

  return (
    <div
      className="block-content block-content--text"
      data-placeholder={placeholderFlag}
      data-copy-mode={copyModeOf(block)}
    >
      {text}
    </div>
  )
}
