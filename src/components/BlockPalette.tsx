import { BLOCK_TYPES } from '../constants/blockTypes.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

import './BlockPalette.css'

const PALETTE_LABEL = 'Block palette'
const PALETTE_NOTICE = 'Click a block to drop it on the page, then drag it where you want it.'

/** The six structured block types. Clicking one adds it to the page and selects it. */
export function BlockPalette() {
  const addBlock = useCanvasStore((state) => state.addBlock)

  return (
    <aside className="block-palette" aria-label={PALETTE_LABEL} data-testid="block-palette">
      <h2 className="block-palette__title">Blocks</h2>
      <ul className="block-palette__list">
        {BLOCK_TYPES.map((blockType) => (
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
      <p className="block-palette__notice">{PALETTE_NOTICE}</p>
    </aside>
  )
}
