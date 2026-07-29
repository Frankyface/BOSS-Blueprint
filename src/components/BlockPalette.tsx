import { PALETTE_BLOCK_TYPES } from '../constants/blockTypes.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

import './BlockPalette.css'

const PALETTE_LABEL = 'Block palette'
const PALETTE_NOTICE = 'Click a block to drop it on the page, then drag it where you want it.'

/**
 * The six structured block types. Clicking one adds it to the page and selects it.
 *
 * THE INSTRUCTION SITS ABOVE THE BLOCKS, not below them (UX audit N1). It used to
 * be the last line of the column — roughly 700px under the first palette entry, off
 * the bottom of a laptop window — so the client in the audit tried to drag, got
 * nothing, and had no way to learn the one gesture that works. The onboarding tour
 * teaches this once; this line has to keep saying it forever, where the eye lands.
 */
export function BlockPalette() {
  const addBlock = useCanvasStore((state) => state.addBlock)

  return (
    <aside
      className="block-palette"
      aria-label={PALETTE_LABEL}
      data-testid="block-palette"
      data-tour="palette"
    >
      <h2 className="block-palette__title">Blocks</h2>
      <p className="block-palette__notice" data-testid="palette-notice">
        {PALETTE_NOTICE}
      </p>
      <ul className="block-palette__list">
        {PALETTE_BLOCK_TYPES.map((blockType) => (
          <li key={blockType.id} className="block-palette__item">
            <button
              type="button"
              className="block-palette__button"
              data-block-type={blockType.id}
              data-testid={`palette-${blockType.id}`}
              onClick={() => addBlock(blockType.id)}
            >
              <span className="block-palette__label">{blockType.label}</span>
              <span className="block-palette__hint">{blockType.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
