import { BLOCK_TYPES } from '../constants/blockTypes.ts'

import './BlockPalette.css'

const PALETTE_LABEL = 'Block palette'
const PALETTE_NOTICE = 'Coming next — blocks are not draggable yet.'

/**
 * Inert placeholder palette listing the six block types.
 * Every entry is disabled until `feature-block-canvas` makes them real.
 */
export function BlockPalette() {
  return (
    <aside className="block-palette" aria-label={PALETTE_LABEL} data-testid="block-palette">
      <h2 className="block-palette__title">Blocks</h2>
      <ul className="block-palette__list">
        {BLOCK_TYPES.map((blockType) => (
          <li key={blockType.id} className="block-palette__item">
            <button type="button" className="block-palette__button" disabled data-block-type={blockType.id}>
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
