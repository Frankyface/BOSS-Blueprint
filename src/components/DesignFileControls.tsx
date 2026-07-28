import { useRef } from 'react'
import type { ChangeEvent } from 'react'

import { DESIGN_FILE_ACCEPT, DESIGN_FILE_EXTENSION } from '../canvas/designFile.ts'
import { downloadDesignAndAnnounce, requestDesignImport } from '../store/designFileSession.ts'

import './DesignFileControls.css'

const OPEN_LABEL = 'Open design'
const DOWNLOAD_LABEL = 'Download design'

/**
 * THE DESIGN FILE, in the header — the client's only way to move work between
 * machines, and their only backup.
 *
 * Placed in the header bar rather than the canvas toolbar on purpose. The toolbar
 * is about the thing currently selected and the page being drawn; these two are
 * about the WHOLE design, they are used once at the start and once at the end of a
 * session, and burying them behind a menu would hide the one control that answers
 * "what if I close this tab?". The header was empty on the right, is always
 * visible (it never scrolls — see App.css), and is where every other tool a client
 * has used puts Open and Save.
 *
 * The confirmation for overwriting lives in `DesignImportConfirm`, not here: a
 * dropped file has to get the same prompt as a chosen one.
 */
export function DesignFileControls() {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleDownload = () => {
    downloadDesignAndAnnounce()
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    void requestDesignImport(event.target.files?.item(0))
    // Cleared so choosing the SAME file twice still fires a change event.
    event.target.value = ''
  }

  return (
    <div className="design-file" data-testid="design-file-controls">
      <button
        type="button"
        className="design-file__button"
        data-testid="design-open"
        onClick={() => inputRef.current?.click()}
      >
        {OPEN_LABEL}
      </button>
      <button
        type="button"
        className="design-file__button design-file__button--primary"
        data-testid="design-download"
        onClick={handleDownload}
      >
        {DOWNLOAD_LABEL}
      </button>

      <input
        ref={inputRef}
        type="file"
        className="design-file__input"
        data-testid="design-file-input"
        accept={DESIGN_FILE_ACCEPT}
        aria-label={`Open a ${DESIGN_FILE_EXTENSION} design file`}
        onChange={handleChange}
      />
    </div>
  )
}
