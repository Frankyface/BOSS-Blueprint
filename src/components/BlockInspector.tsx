import { isCopyBlock, linkOf } from '../canvas/blockEdits.ts'
import type { BlockLink } from '../canvas/types.ts'
import { getBlockTypeDefinition } from '../constants/blockTypes.ts'
import { selectSelectedBlock, useCanvasStore } from '../store/canvasStore.ts'

import { CopyModeEditor } from './CopyModeEditor.tsx'
import { ImageSettings } from './ImageSettings.tsx'
import { LinkPicker } from './LinkPicker.tsx'
import { NavItemsEditor } from './NavItemsEditor.tsx'

const NOTHING_SELECTED = 'Click a block on the page to change what it says and where it goes.'
const NOTHING_TO_SET = 'This block has nothing to fill in — drag and resize it on the page.'

/** Everything about the block the client currently has selected. */
export function BlockInspector() {
  const block = useCanvasStore(selectSelectedBlock)
  const pages = useCanvasStore((state) => state.pages)
  const setBlockLink = useCanvasStore((state) => state.setBlockLink)

  if (!block) {
    return (
      <p className="side-panel__hint" data-testid="block-inspector-empty">
        {NOTHING_SELECTED}
      </p>
    )
  }

  const definition = getBlockTypeDefinition(block.type)
  const handleLink = (link: BlockLink) => {
    setBlockLink(block.id, link)
  }

  const hasSettings =
    isCopyBlock(block) ||
    block.type === 'button' ||
    block.type === 'nav-bar' ||
    block.type === 'image'

  return (
    <div className="side-panel__body" data-testid="block-inspector" data-block-type={block.type}>
      <p className="side-panel__subject" data-testid="block-inspector-subject">
        {definition.label}
      </p>

      {isCopyBlock(block) && <CopyModeEditor block={block} />}

      {block.type === 'button' && (
        <section className="side-panel__section" data-testid="button-link-editor">
          <h3 className="side-panel__heading">Where it goes</h3>
          <LinkPicker
            link={linkOf(block)}
            pages={pages}
            onChange={handleLink}
            testId="button"
            label="Links to"
          />
        </section>
      )}

      {block.type === 'image' && <ImageSettings block={block} />}

      {block.type === 'nav-bar' && <NavItemsEditor block={block} pages={pages} />}

      {!hasSettings && <p className="side-panel__hint">{NOTHING_TO_SET}</p>}
    </div>
  )
}
