import { DESIGN_FILE_MIME } from '../canvas/designFile.ts'

/**
 * THE BROWSER SIDE OF THE DESIGN FILE: saving one to the client's disk, and
 * reading one back off it.
 *
 * A thin adapter over `Blob`, `URL.createObjectURL` and `Blob.text()` — none of
 * which jsdom implements usefully — so it lives in `src/platform/**` beside
 * `browserImagePorts.ts`, under the same rule that file's header states: the
 * DECISIONS live in `src/canvas/designFile.ts` (which is unit-tested), and this
 * stays free of them. It is proven by `e2e/design-file.spec.ts` in all three
 * engines instead.
 */

/**
 * Object URLs are revoked on a timer, not immediately.
 *
 * Revoking in the same tick is the usual advice and it is wrong here: WebKit
 * starts the download asynchronously after the synthetic click, and pulling the
 * URL out from under it cancels the save with no error anywhere. A minute is far
 * longer than any browser needs and still bounds the leak to one design.
 */
const OBJECT_URL_LIFETIME_MS = 60_000

/** Save text to the client's downloads folder under `fileName`. */
export function downloadTextFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: DESIGN_FILE_MIME }))

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  // Firefox only fires the download for an anchor that is in the document.
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, OBJECT_URL_LIFETIME_MS)
}

/** The chosen file's contents as text. Rejects exactly as the browser does. */
export function readTextFile(file: File): Promise<string> {
  return file.text()
}
