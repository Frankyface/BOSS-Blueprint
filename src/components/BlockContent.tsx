import { displayText, isShowingPlaceholder, parseNavItems } from '../canvas/blockText.ts'
import type { Block } from '../canvas/types.ts'

const IMAGE_GLYPH = '⛰'

interface BlockContentProps {
  block: Block
}

/**
 * The visible face of a block. Every type gets a distinct silhouette so the page
 * reads as a page at a glance, and readable placeholder copy until the client
 * types their own.
 */
export function BlockContent({ block }: BlockContentProps) {
  const text = displayText(block)
  const placeholderFlag = isShowingPlaceholder(block) ? 'true' : 'false'

  if (block.type === 'image') {
    return (
      <div className="block-content block-content--image" data-placeholder="true">
        <span className="block-content__glyph" aria-hidden="true">
          {IMAGE_GLYPH}
        </span>
        <span className="block-content__caption">{text}</span>
      </div>
    )
  }

  if (block.type === 'section') {
    return (
      <div className="block-content block-content--section" data-placeholder="true">
        <span className="block-content__tag">{text}</span>
      </div>
    )
  }

  if (block.type === 'nav-bar') {
    return (
      <nav className="block-content block-content--nav" data-placeholder={placeholderFlag}>
        {parseNavItems(text).map((item, index) => (
          <span
            // Nav labels can repeat, so position is the only stable identity here.
            key={`${item}-${index}`}
            className="block-content__nav-item"
            data-testid="nav-item"
          >
            {item}
          </span>
        ))}
      </nav>
    )
  }

  if (block.type === 'heading') {
    return (
      <div className="block-content block-content--heading" data-placeholder={placeholderFlag}>
        {text}
      </div>
    )
  }

  if (block.type === 'button') {
    return (
      <div className="block-content block-content--button" data-placeholder={placeholderFlag}>
        <span className="block-content__pill">{text}</span>
      </div>
    )
  }

  return (
    <div className="block-content block-content--text" data-placeholder={placeholderFlag}>
      {text}
    </div>
  )
}
