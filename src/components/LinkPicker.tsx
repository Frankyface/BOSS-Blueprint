import { useState } from 'react'

import { EXTERNAL_URL_HINT, externalLink, isValidExternalUrl, NO_LINK, pageLink } from '../canvas/links.ts'
import type { BlockLink, Page } from '../canvas/types.ts'

const NONE_VALUE = 'none'
const EXTERNAL_VALUE = 'external'
const PAGE_VALUE_PREFIX = 'page:'

const NONE_LABEL = 'Not linked yet'
const EXTERNAL_LABEL = 'A web address…'
const URL_PLACEHOLDER = 'https://instagram.com/yourbusiness'

interface LinkPickerProps {
  link: BlockLink
  pages: readonly Page[]
  onChange: (link: BlockLink) => void
  /** Prefix for this picker's test ids, so two on screen never collide. */
  testId: string
  label: string
}

/**
 * "Links to" — one picker, used by buttons and by every nav item.
 *
 * A native `<select>` rather than a custom menu: it is the one control that
 * behaves identically in all three engines, is keyboard- and screen-reader-correct
 * for free, and is trivially driveable from Playwright.
 *
 * An external address is only written to the store once it is VALID (http(s) with
 * a host — the export schema's own rule). Until then the picker holds the draft
 * and shows the hint, so a half-typed URL can never reach the package.
 */
export function LinkPicker({ link, pages, onChange, testId, label }: LinkPickerProps) {
  const [isWritingUrl, setIsWritingUrl] = useState(link.kind === 'external')
  const [draftUrl, setDraftUrl] = useState(link.kind === 'external' ? link.url : '')
  const [error, setError] = useState<string | null>(null)
  const [lastLink, setLastLink] = useState(link)

  // Re-sync when the stored link changes underneath us (an undo, a page delete
  // reverting this very link, or the client selecting another block). Adjusted
  // during render rather than in an effect — the store hands out a new link object
  // only when the link actually changed, so this runs at most once per change.
  if (link !== lastLink) {
    setLastLink(link)
    setIsWritingUrl(link.kind === 'external')
    setDraftUrl(link.kind === 'external' ? link.url : '')
    setError(null)
  }

  const selectValue = isWritingUrl
    ? EXTERNAL_VALUE
    : link.kind === 'page'
      ? `${PAGE_VALUE_PREFIX}${link.pageId}`
      : NONE_VALUE

  const handleSelect = (value: string) => {
    setError(null)

    if (value === EXTERNAL_VALUE) {
      setIsWritingUrl(true)
      return
    }

    setIsWritingUrl(false)
    onChange(value === NONE_VALUE ? NO_LINK : pageLink(value.slice(PAGE_VALUE_PREFIX.length)))
  }

  const commitUrl = () => {
    const value = draftUrl.trim()

    if (value.length === 0) {
      setError(null)
      if (link.kind === 'external') onChange(NO_LINK)
      return
    }

    if (!isValidExternalUrl(value)) {
      setError(EXTERNAL_URL_HINT)
      return
    }

    setError(null)
    onChange(externalLink(value))
  }

  return (
    <div className="link-picker" data-testid={`${testId}-link`}>
      <label className="side-panel__label">
        <span className="side-panel__label-text">{label}</span>
        <select
          className="side-panel__control"
          data-testid={`${testId}-link-target`}
          value={selectValue}
          onChange={(event) => {
            handleSelect(event.target.value)
          }}
        >
          <option value={NONE_VALUE}>{NONE_LABEL}</option>
          {pages.map((page) => (
            <option key={page.id} value={`${PAGE_VALUE_PREFIX}${page.id}`}>
              {page.name}
            </option>
          ))}
          <option value={EXTERNAL_VALUE}>{EXTERNAL_LABEL}</option>
        </select>
      </label>

      {isWritingUrl && (
        <>
          <input
            type="text"
            className="side-panel__control"
            data-testid={`${testId}-link-url`}
            aria-label={`${label} web address`}
            placeholder={URL_PLACEHOLDER}
            value={draftUrl}
            onChange={(event) => {
              setDraftUrl(event.target.value)
            }}
            onBlur={commitUrl}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              commitUrl()
            }}
          />
          {error && (
            <p className="side-panel__error" data-testid={`${testId}-link-error`} role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  )
}
