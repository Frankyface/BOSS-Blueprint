import { parseBlueprint } from './blueprintFile.ts'
import type { CanvasDocument } from './types.ts'

/**
 * THE `.blueprint` FILE AS A FILE — naming it on the way out, and deciding what a
 * dropped one means on the way in.
 *
 * There is no backend and no account, so this file IS the client's portable save:
 * the thing they email themselves, keep in a folder, or carry to another machine.
 * It is the very same payload autosave writes (`blueprintFile.ts` — one format,
 * three uses: storage, file, and Stage 3's export input), so nothing here
 * serialises or validates anything itself. This module is only the boundary rules
 * a FILE adds on top: what it should be called, whether this is even a design
 * file, and what to say to the client when it isn't.
 *
 * Pure: no DOM, no download, no FileReader. Those live in
 * `src/platform/designFileIo.ts`, which jsdom cannot run.
 */

export const DESIGN_FILE_EXTENSION = '.blueprint'

/** What the file picker offers, and what a `.blueprint` is served as. */
export const DESIGN_FILE_ACCEPT = `${DESIGN_FILE_EXTENSION},application/json`
export const DESIGN_FILE_MIME = 'application/json'

/** The name a design gets when the client has not told us the business name yet. */
export const FALLBACK_DESIGN_NAME = 'my-site'

/** Long enough for a real business name, short enough for any file system. */
const MAX_NAME_LENGTH = 60

/**
 * A design with a dozen photos in it is a few MB; twenty is far past anything the
 * browser could then autosave (the 5MB localStorage quota), and reading a
 * multi-gigabyte file the client dropped by accident would hang the tab. Refusing
 * up front is cheaper than finding out after the read.
 */
export const MAX_DESIGN_FILE_BYTES = 20_000_000
const BYTES_PER_MB = 1_000_000

/**
 * Business name → file stem, by the export's own `slugify` rule
 * (`docs/export-format.md` §4.1): fold accents, lower-case, everything that is not
 * a letter or digit becomes a hyphen, no leading/trailing hyphens. A name with no
 * usable characters at all (or no name yet — templates deliberately ship it empty)
 * falls back rather than producing a file called `.blueprint`.
 *
 * FOLDING ACCENTS IS TWO STEPS, and the second one was missing (batch-3 review).
 * `normalize('NFKD')` only SPLITS "é" into "e" + a combining acute; something then
 * has to throw the mark away. Without that line the mark fell through to the
 * "anything that is not a letter or digit becomes a hyphen" rule, so `Café Noël`
 * came out as `cafe-noe-l` — a hyphen in the middle of a word, from an accent the
 * client cannot see in their own file name. It went unnoticed because the only
 * accented test case ended in the accented letter (`Café Ubuntu` → the stray
 * hyphen landed where a hyphen belonged anyway).
 */
export function designFileSlug(businessName: string): string {
  const slug = businessName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/-+$/, '')

  return slug.length > 0 ? slug : FALLBACK_DESIGN_NAME
}

export function designFileName(businessName: string): string {
  return `${designFileSlug(businessName)}${DESIGN_FILE_EXTENSION}`
}

export function isDesignFileName(name: string): boolean {
  return name.toLowerCase().endsWith(DESIGN_FILE_EXTENSION)
}

/** The facts about a chosen file that can be checked BEFORE reading it. */
export interface DesignFileMeta {
  readonly name: string
  readonly size: number
}

/**
 * Refuse a file we should not even read, and say why in the client's own terms.
 * `null` means "go ahead and read it".
 *
 * The extension check is what makes dropping a holiday photo onto the editor a
 * sentence instead of a silent nothing — and it is also why a 900MB video never
 * reaches `FileReader`. It is NOT the validation: `parseBlueprint` is, and a file
 * called `.blueprint` full of nonsense is still refused below.
 */
export function rejectionForDesignFile(file: DesignFileMeta): string | null {
  if (!isDesignFileName(file.name)) {
    return (
      `“${file.name}” isn't a BOSS Blueprint design file. Look for the one you downloaded ` +
      `from here — its name ends in ${DESIGN_FILE_EXTENSION}.`
    )
  }

  if (file.size > MAX_DESIGN_FILE_BYTES) {
    const megabytes = Math.round(file.size / BYTES_PER_MB)
    return (
      `“${file.name}” is too big to open (${String(megabytes)}MB). A design file should be a ` +
      `few MB at most — this one looks like something else.`
    )
  }

  if (file.size === 0) {
    return `“${file.name}” is empty, so there is no design in it to open.`
  }

  return null
}

export type DesignFileOutcome =
  | {
      readonly status: 'ok'
      readonly document: CanvasDocument
      /** The schema it was written as, when older than this build's. */
      readonly migratedFrom: number | null
    }
  | { readonly status: 'rejected'; readonly message: string }

/**
 * Read a chosen file's text as a design.
 *
 * Everything crossing this line is untrusted — a hand-edited file, one written by
 * a future build, one that is not a design at all — so it goes through the SAME
 * `parseBlueprint` that guards autosave, including the schema-1 migration and the
 * data-URL check that keeps a `data:text/html` "photo" out of an `<img>` on our
 * own origin. The only thing added here is the sentence the client reads.
 */
export function interpretDesignFile(raw: string, fileName: string): DesignFileOutcome {
  const result = parseBlueprint(raw)

  if (result.status === 'ok') {
    return { status: 'ok', document: result.document, migratedFrom: result.migratedFrom }
  }

  return {
    status: 'rejected',
    message:
      `We couldn't open “${fileName}”. ${result.reason} ` +
      'Your current design is exactly as you left it.',
  }
}

/** What to say once a file has been opened. */
export function openedDesignMessage(fileName: string, migratedFrom: number | null): string {
  const opened = `Opened “${fileName}”.`
  return migratedFrom === null
    ? opened
    : `${opened} It was made by an earlier version of BOSS Blueprint, so we brought it up to date.`
}

/** The two-step overwrite prompt: what the client is about to lose, named. */
export function overwritePrompt(fileName: string): string {
  return `Open “${fileName}” instead of the design you have open now?`
}
