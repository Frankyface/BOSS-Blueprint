import { DESIGN_FILE_MIME } from '../canvas/designFile.ts'

import { downloadBlob } from './downloadFile.ts'

/**
 * THE BROWSER SIDE OF THE DESIGN FILE: saving one to the client's disk, and
 * reading one back off it.
 *
 * A thin adapter over `Blob` and `Blob.text()` — neither of which jsdom
 * implements usefully — so it lives in `src/platform/**` beside
 * `browserImagePorts.ts`, under the same rule that file's header states: the
 * DECISIONS live in `src/canvas/designFile.ts` (which is unit-tested), and this
 * stays free of them. It is proven by `e2e/design-file.spec.ts` in all three
 * engines instead.
 *
 * The anchor-click dance moved to `downloadFile.ts` when the submit gate needed
 * exactly the same one — including the WebKit revoke delay, which is the kind of
 * detail that must not exist in two copies.
 */

/** Save text to the client's downloads folder under `fileName`. */
export function downloadTextFile(fileName: string, text: string): void {
  downloadBlob(fileName, new Blob([text], { type: DESIGN_FILE_MIME }))
}

/** The chosen file's contents as text. Rejects exactly as the browser does. */
export function readTextFile(file: File): Promise<string> {
  return file.text()
}
