/**
 * SAVING A BLOB TO THE CLIENT'S DISK — the one browser mechanism behind both
 * "Save design" and the submit gate's package download.
 *
 * Extracted from `designFileIo.ts` when submit needed the identical dance, so the
 * two hard-won details below exist once rather than twice. Same rule as its
 * neighbours: no decisions live here, only the browser API. It is proven by
 * `e2e/design-file.spec.ts` and `e2e/submit.spec.ts` in all three engines.
 */

/**
 * Object URLs are revoked on a timer, not immediately.
 *
 * Revoking in the same tick is the usual advice and it is wrong here: WebKit
 * starts the download asynchronously after the synthetic click, and pulling the
 * URL out from under it cancels the save with no error anywhere. A minute is far
 * longer than any browser needs and still bounds the leak to one file.
 */
export const OBJECT_URL_LIFETIME_MS = 60_000

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)

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
