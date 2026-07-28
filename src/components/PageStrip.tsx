import { useState } from 'react'

import { MIN_PAGE_COUNT } from '../canvas/document.ts'
import { describeReverted } from '../canvas/pageNotices.ts'
import { PAGE_NAME_MAX_LENGTH } from '../canvas/pages.ts'
import { useCanvasStore } from '../store/canvasStore.ts'
import { useEditorStore } from '../store/editorStore.ts'

import { PageNameForm } from './PageNameForm.tsx'

import './PageStrip.css'

const STRIP_LABEL = 'Pages'
const DELETE_PROMPT = 'Delete this page?'

/** Only the page the client is looking at can be renamed, moved or deleted. */
type PendingAction = 'none' | 'add' | 'rename' | 'delete'

/**
 * THE PAGE STRIP — the site's pages as a row of tabs above the canvas.
 *
 * Reordering is by "Move left" / "Move right" buttons rather than drag-and-drop:
 * a drag between tabs is the one gesture that behaves differently in all three
 * engines, is awkward with a trackpad, and is impossible from a keyboard. Buttons
 * are unambiguous for the client and deterministic in Playwright.
 *
 * Deleting is the same two-step, in-app confirmation "Start over" uses — never
 * `window.confirm`, for the reasons recorded in the autosave feature file.
 */
export function PageStrip() {
  const pages = useCanvasStore((state) => state.pages)
  const currentPageId = useCanvasStore((state) => state.currentPageId)
  const setCurrentPage = useCanvasStore((state) => state.setCurrentPage)
  const addPage = useCanvasStore((state) => state.addPage)
  const renamePage = useCanvasStore((state) => state.renamePage)
  const duplicatePage = useCanvasStore((state) => state.duplicatePage)
  const deletePage = useCanvasStore((state) => state.deletePage)
  const movePage = useCanvasStore((state) => state.movePage)
  const setToast = useEditorStore((state) => state.setToast)

  const [pending, setPending] = useState<PendingAction>('none')

  const index = pages.findIndex((page) => page.id === currentPageId)
  const current = pages[index]
  const canDelete = pages.length > MIN_PAGE_COUNT

  const close = () => {
    setPending('none')
  }

  /**
   * The guard sits HERE, against the same rule the store refuses on, rather than
   * only on the button's `disabled` (review LOW-5). The store returns 0 reverted
   * links both when it deleted a page that nothing pointed at AND when it refused
   * to delete the last page — so announcing "…has been deleted" off the back of
   * that number alone would one day tell the client we deleted a page we still
   * have. Same condition, same place, no daylight between them.
   */
  const handleDelete = () => {
    if (!current || !canDelete) return

    const reverted = deletePage(current.id)
    setToast(describeReverted(current.name, reverted))
    close()
  }

  return (
    <nav className="page-strip" aria-label={STRIP_LABEL} data-testid="page-strip">
      <ul className="page-strip__tabs">
        {pages.map((page) => (
          <li key={page.id}>
            <button
              type="button"
              className="page-strip__tab"
              data-testid="page-tab"
              data-page-id={page.id}
              data-current={page.id === currentPageId ? 'true' : 'false'}
              aria-current={page.id === currentPageId ? 'page' : undefined}
              onClick={() => {
                setCurrentPage(page.id)
                close()
              }}
            >
              {page.name}
            </button>
          </li>
        ))}
      </ul>

      <div className="page-strip__actions">
        <button
          type="button"
          className="page-strip__button"
          data-testid="page-add"
          onClick={() => {
            setPending('add')
          }}
        >
          Add page
        </button>
        <button
          type="button"
          className="page-strip__button"
          data-testid="page-rename"
          disabled={!current}
          onClick={() => {
            setPending('rename')
          }}
        >
          Rename
        </button>
        <button
          type="button"
          className="page-strip__button"
          data-testid="page-duplicate"
          disabled={!current}
          onClick={() => {
            if (current) duplicatePage(current.id)
            close()
          }}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="page-strip__button"
          data-testid="page-move-left"
          disabled={index <= 0}
          onClick={() => {
            if (current) movePage(current.id, -1)
          }}
        >
          Move left
        </button>
        <button
          type="button"
          className="page-strip__button"
          data-testid="page-move-right"
          disabled={index < 0 || index >= pages.length - 1}
          onClick={() => {
            if (current) movePage(current.id, 1)
          }}
        >
          Move right
        </button>
        <button
          type="button"
          className="page-strip__button page-strip__button--danger"
          data-testid="page-delete"
          disabled={!canDelete}
          onClick={() => {
            setPending('delete')
          }}
        >
          Delete page
        </button>
      </div>

      {pending === 'add' && (
        <PageNameForm
          testId="page-add"
          label="Name the new page"
          placeholder="Menu"
          initialValue=""
          confirmLabel="Add page"
          maxLength={PAGE_NAME_MAX_LENGTH}
          onCancel={close}
          onConfirm={(name) => {
            addPage(name)
            close()
          }}
        />
      )}

      {pending === 'rename' && current && (
        <PageNameForm
          testId="page-rename"
          label={`Rename "${current.name}"`}
          placeholder={current.name}
          initialValue={current.name}
          confirmLabel="Save name"
          maxLength={PAGE_NAME_MAX_LENGTH}
          onCancel={close}
          onConfirm={(name) => {
            renamePage(current.id, name)
            close()
          }}
        />
      )}

      {pending === 'delete' && current && (
        <div className="page-strip__confirm" data-testid="page-delete-confirm">
          <span className="page-strip__confirm-prompt">{DELETE_PROMPT}</span>
          <button
            type="button"
            className="page-strip__button"
            data-testid="page-delete-cancel"
            onClick={close}
          >
            Keep it
          </button>
          <button
            type="button"
            className="page-strip__button page-strip__button--danger"
            data-testid="page-delete-confirmed"
            onClick={handleDelete}
          >
            Yes, delete it
          </button>
        </div>
      )}
    </nav>
  )
}
