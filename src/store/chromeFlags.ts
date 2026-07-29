/**
 * ONE-BIT MEMORIES ABOUT THE CHROME — "the tour has been seen", "the small-screen
 * notice has been acknowledged". Never about the design.
 *
 * Deliberately separate from `canvasStorage.ts`, which owns the client's work: a
 * flag that fails to persist costs a repeated tooltip, a document that fails to
 * persist costs their afternoon, and the two must not share error handling. These
 * helpers therefore have exactly one failure mode — they degrade to "not
 * remembered" — and no way to report it, because there is nothing useful to say.
 *
 * READING THE PROPERTY ITSELF THROWS in a blocked-cookies context, which is why
 * even resolving the area is wrapped. Private mode, disabled storage and a full
 * quota all land in the same place: the tour shows, the notice shows, and neither
 * ever throws on start-up.
 */

import type { StorageLike } from './canvasStorage.ts'

/** `localStorage` outlives the browser session; `sessionStorage` dies with the tab. */
export type FlagArea = 'local' | 'session'

/** The value every flag in the app is set to. One vocabulary, one spelling. */
export const FLAG_DISMISSED = 'dismissed'

function storageFor(area: FlagArea): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null
    return area === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function readFlag(area: FlagArea, key: string): string | null {
  try {
    return storageFor(area)?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeFlag(area: FlagArea, key: string, value: string): void {
  try {
    storageFor(area)?.setItem(key, value)
  } catch {
    // Shown but not remembered. Better than a crash on first paint.
  }
}

/** True when this flag has been set to `FLAG_DISMISSED` (and storage let us read it). */
export function isDismissed(area: FlagArea, key: string): boolean {
  return readFlag(area, key) === FLAG_DISMISSED
}

export function markDismissed(area: FlagArea, key: string): void {
  writeFlag(area, key, FLAG_DISMISSED)
}
