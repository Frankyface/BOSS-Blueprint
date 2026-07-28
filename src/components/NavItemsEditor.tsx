import { navItemsOf } from '../canvas/blockEdits.ts'
import { NAV_ITEMS_UI_MAX } from '../canvas/navItems.ts'
import type { Block, BlockLink, NavItem, Page } from '../canvas/types.ts'
import { useCommittedField } from '../hooks/useCommittedField.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

import { LinkPicker } from './LinkPicker.tsx'

const NEW_ITEM_LABEL = 'New link'
const EMPTY_HINT = 'No menu items yet. Add one for each page you want in the menu.'
const CAP_HINT = `A menu holds up to ${String(NAV_ITEMS_UI_MAX)} items.`

interface NavItemRowProps {
  blockId: string
  item: NavItem
  index: number
  pages: readonly Page[]
}

/**
 * One menu entry. Its own component because the label field owns a draft (one undo
 * step per rename, not one per keystroke) and hooks cannot live inside a `map`.
 */
function NavItemRow({ blockId, item, index, pages }: NavItemRowProps) {
  const setNavItemLabel = useCanvasStore((state) => state.setNavItemLabel)
  const setNavItemLink = useCanvasStore((state) => state.setNavItemLink)
  const removeNavItem = useCanvasStore((state) => state.removeNavItem)

  const label = useCommittedField(item.label, (next) => {
    setNavItemLabel(blockId, item.id, next)
  })

  const handleLink = (link: BlockLink) => {
    setNavItemLink(blockId, item.id, link)
  }

  return (
    <li className="nav-items__row" data-testid="nav-item-row" data-link-kind={item.link.kind}>
      <label className="side-panel__label">
        <span className="side-panel__label-text">Menu item {index + 1}</span>
        <input
          type="text"
          className="side-panel__control"
          data-testid={`nav-item-${String(index)}-label`}
          {...label}
        />
      </label>

      <LinkPicker
        link={item.link}
        pages={pages}
        onChange={handleLink}
        testId={`nav-item-${String(index)}`}
        label="Goes to"
      />

      <button
        type="button"
        className="side-panel__button side-panel__button--danger"
        data-testid={`nav-item-${String(index)}-remove`}
        onClick={() => {
          removeNavItem(blockId, item.id)
        }}
      >
        Remove
      </button>
    </li>
  )
}

interface NavItemsEditorProps {
  block: Block
  pages: readonly Page[]
}

/**
 * The nav bar's menu, as structured items rather than one comma string.
 *
 * Typing straight into the block still works and still rebuilds these items — the
 * store keeps the two in step — but links can only live on items, which is what
 * the export needs (`docs/export-format.md` §2.7).
 */
export function NavItemsEditor({ block, pages }: NavItemsEditorProps) {
  const addNavItem = useCanvasStore((state) => state.addNavItem)
  const items = navItemsOf(block)

  return (
    <section className="side-panel__section" data-testid="nav-items-editor">
      <h3 className="side-panel__heading">Menu items</h3>

      {items.length === 0 && <p className="side-panel__hint">{EMPTY_HINT}</p>}

      <ul className="nav-items">
        {items.map((item, index) => (
          <NavItemRow key={item.id} blockId={block.id} item={item} index={index} pages={pages} />
        ))}
      </ul>

      <button
        type="button"
        className="side-panel__button"
        data-testid="nav-add-item"
        disabled={items.length >= NAV_ITEMS_UI_MAX}
        onClick={() => {
          addNavItem(block.id, NEW_ITEM_LABEL)
        }}
      >
        Add menu item
      </button>
      <p className="side-panel__hint">{CAP_HINT}</p>
    </section>
  )
}
