import { parseBlueprint, serialiseDocument } from '../canvas/blueprintFile.ts'
import type { CanvasDocument } from '../canvas/types.ts'

/**
 * The localStorage side of autosave: where the `.blueprint` payload is written,
 * how a bad one is quarantined, and how close we are to the quota.
 *
 * Storage is passed in rather than reached for, so the whole module is testable
 * against a fake and the app can still run when localStorage is unavailable
 * (private windows, storage disabled) instead of throwing on start-up.
 */

/**
 * The storage SLOT version, not the document schema version. It changes only if we
 * ever need a clean parallel slot; a document-shape change instead bumps
 * `BLUEPRINT_SCHEMA_VERSION` inside the payload. Keeping the key stable is what
 * lets this build find, read and quarantine a payload written by a future one.
 */
export const STORAGE_KEY = 'boss-blueprint:canvas:v1'

/** Quarantine slot: a payload we could not load is moved here, never overwritten. */
export const RECOVERY_KEY = `${STORAGE_KEY}-recovery`

/** localStorage stores UTF-16 code units, so a character costs two bytes. */
const BYTES_PER_CHARACTER = 2

/** Every evergreen browser gives an origin roughly 5 MB of localStorage. */
export const STORAGE_QUOTA_BYTES = 5_000_000

/** Warn from 80% of the quota, while there is still room to save. */
export const STORAGE_WARNING_BYTES = 4_000_000

/** The slice of the `Storage` interface this module uses. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LoadOutcome =
  /** Nothing saved yet (or storage is unusable) — start on a fresh canvas. */
  | { readonly status: 'empty' }
  | { readonly status: 'loaded'; readonly document: CanvasDocument }
  /** The payload could not be used; it now lives under RECOVERY_KEY. */
  | { readonly status: 'recovered'; readonly reason: string }
  | { readonly status: 'unavailable'; readonly reason: string }

export type SaveOutcome =
  | { readonly status: 'saved'; readonly bytes: number }
  /** Written, but the design is getting close to the browser's limit. */
  | { readonly status: 'near-quota'; readonly bytes: number }
  /** NOT written: the browser refused. The client must be told, not left guessing. */
  | { readonly status: 'quota-exceeded'; readonly bytes: number }
  | { readonly status: 'unavailable'; readonly reason: string }

export function payloadByteSize(payload: string): number {
  return payload.length * BYTES_PER_CHARACTER
}

/**
 * `window.localStorage` when it is usable, `null` otherwise. Merely READING the
 * property throws in a blocked-cookies context, hence the try.
 */
export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown storage error.'
}

/**
 * Firefox and WebKit each have their own name for a full quota, and older engines
 * only set the legacy numeric code.
 */
const QUOTA_ERROR_NAMES: ReadonlySet<string> = new Set([
  'QuotaExceededError',
  'NS_ERROR_DOM_QUOTA_REACHED',
])
const LEGACY_QUOTA_ERROR_CODE = 22

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { name?: unknown; code?: unknown }
  return (
    (typeof candidate.name === 'string' && QUOTA_ERROR_NAMES.has(candidate.name)) ||
    candidate.code === LEGACY_QUOTA_ERROR_CODE
  )
}

/**
 * Move an unusable payload out of the way WITHOUT destroying it: the client's work
 * may still be salvageable by hand, and the next autosave needs the main key free.
 */
function quarantine(storage: StorageLike, raw: string): void {
  try {
    storage.setItem(RECOVERY_KEY, raw)
    storage.removeItem(STORAGE_KEY)
  } catch {
    // A full or read-only store means we cannot quarantine. Leaving the original
    // payload where it is beats throwing during start-up.
  }
}

export function loadDocument(storage: StorageLike | null): LoadOutcome {
  if (!storage) {
    return {
      status: 'unavailable',
      reason: 'This browser is not letting BOSS Blueprint save your work locally.',
    }
  }

  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch (error) {
    return { status: 'unavailable', reason: describeError(error) }
  }

  if (raw === null) return { status: 'empty' }

  const result = parseBlueprint(raw)
  if (result.status === 'ok') return { status: 'loaded', document: result.document }

  quarantine(storage, raw)
  return { status: 'recovered', reason: result.reason }
}

export function saveDocument(storage: StorageLike | null, document: CanvasDocument): SaveOutcome {
  if (!storage) {
    return {
      status: 'unavailable',
      reason: 'This browser is not letting BOSS Blueprint save your work locally.',
    }
  }

  const payload = serialiseDocument(document)
  const bytes = payloadByteSize(payload)

  try {
    storage.setItem(STORAGE_KEY, payload)
  } catch (error) {
    if (isQuotaError(error)) return { status: 'quota-exceeded', bytes }
    return { status: 'unavailable', reason: describeError(error) }
  }

  return bytes >= STORAGE_WARNING_BYTES ? { status: 'near-quota', bytes } : { status: 'saved', bytes }
}

/** Start over: drop the saved design and any quarantined payload with it. */
export function clearStoredDocument(storage: StorageLike | null): void {
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
    storage.removeItem(RECOVERY_KEY)
  } catch {
    // Nothing useful to do — the design is already cleared on screen.
  }
}
