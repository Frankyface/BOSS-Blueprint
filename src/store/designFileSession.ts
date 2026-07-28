import { serialiseDocument } from '../canvas/blueprintFile.ts'
import {
  designFileName,
  interpretDesignFile,
  openedDesignMessage,
  rejectionForDesignFile,
} from '../canvas/designFile.ts'
import { downloadTextFile, readTextFile } from '../platform/designFileIo.ts'

import { openDesign } from './canvasSession.ts'
import { getCanvasDocument, selectHasContent, useCanvasStore } from './canvasStore.ts'
import { useEditorStore } from './editorStore.ts'
import type { PendingImport } from './editorStore.ts'

/**
 * DOWNLOAD AND OPEN, as store actions.
 *
 * The decisions all live in `src/canvas/designFile.ts` (what a file is called,
 * whether this is one, what to say when it isn't) and `parseBlueprint` (whether it
 * is readable). This module is the wiring between those, the two stores and the
 * browser — which is why both browser calls are injectable: the whole flow,
 * including the refusal paths, is unit-tested in jsdom against fakes, and the real
 * `<a download>` and `Blob.text()` are proven by the cross-engine E2E.
 */

export type SaveTextFile = (fileName: string, text: string) => void
export type ReadTextFile = (file: File) => Promise<string>

const READ_FAILED =
  "We couldn't read that file — your computer wouldn't hand it over. Try choosing it again."

/**
 * Write the whole design out as one file, named after the business.
 *
 * The SAME serialiser autosave uses, deliberately: one format, three uses
 * (storage, file, Stage 3's export input), so a file the client keeps for a month
 * is exactly a payload this build already knows how to read. Photos ride along as
 * the `data:` URLs the document already holds — there is nothing to gather.
 *
 * Returns the file name so the caller can say what was saved.
 */
export function downloadCurrentDesign(save: SaveTextFile = downloadTextFile): string {
  const document = getCanvasDocument()
  const fileName = designFileName(document.siteSettings.businessName)

  save(fileName, serialiseDocument(document))
  return fileName
}

function complain(message: string): void {
  useEditorStore.getState().setToast(message)
}

/**
 * Take a file the client chose or dropped, and either open it, ask first, or
 * refuse it out loud.
 *
 * CONFIRMATION COMES AFTER PARSING, not before: there is no point asking a client
 * to risk their work for a file that turns out to be a photo, and a refusal that
 * arrives after they have already said "yes, overwrite" reads like something went
 * wrong. So the order is always validate → read → parse → (ask) → apply, and the
 * current design is not touched until the very last step.
 */
export async function requestDesignImport(
  file: File | null | undefined,
  read: ReadTextFile = readTextFile,
): Promise<void> {
  if (!file) return

  const rejection = rejectionForDesignFile(file)
  if (rejection !== null) {
    complain(rejection)
    return
  }

  let raw: string
  try {
    raw = await read(file)
  } catch {
    complain(READ_FAILED)
    return
  }

  const outcome = interpretDesignFile(raw, file.name)
  if (outcome.status === 'rejected') {
    complain(outcome.message)
    return
  }

  const pending = {
    document: outcome.document,
    fileName: file.name,
    migratedFrom: outcome.migratedFrom,
  }

  // An empty page has nothing to lose, so asking would be ceremony. Anything else
  // — blocks, pen marks, a second page, even just a business name — gets the
  // two-step confirmation the rest of the editor uses for destructive actions.
  if (!selectHasContent(useCanvasStore.getState())) {
    applyImport(pending)
    return
  }

  useEditorStore.getState().setPendingImport(pending)
}

function applyImport(pending: PendingImport): void {
  openDesign(pending.document)
  complain(openedDesignMessage(pending.fileName, pending.migratedFrom))
}

/** The client said yes to overwriting. */
export function confirmPendingImport(): void {
  const { pendingImport } = useEditorStore.getState()
  if (!pendingImport) return

  applyImport(pendingImport)
}

/** The client backed out. Nothing was ever touched, so there is nothing to undo. */
export function cancelPendingImport(): void {
  useEditorStore.getState().setPendingImport(null)
}
