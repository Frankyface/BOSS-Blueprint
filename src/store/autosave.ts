/**
 * A trailing-edge debouncer for autosave.
 *
 * Every keystroke, drag and resize commits a new document; writing each one would
 * serialise the whole page dozens of times a second. `schedule` keeps only the
 * newest value and writes it once the client has paused.
 *
 * Generic and timer-agnostic on purpose: the unit tests drive it with Vitest fake
 * timers rather than sleeping.
 */

/** "A second after the last change" — the pause that reads as "I've stopped". */
export const AUTOSAVE_DEBOUNCE_MS = 1000

export interface AutosaveOptions<T> {
  readonly write: (value: T) => void
  readonly delayMs?: number
}

export interface Autosave<T> {
  /** Queue `value`, replacing anything already queued, and restart the timer. */
  schedule: (value: T) => void
  /**
   * Write the queued value now. Wired to `pagehide` and `visibilitychange` by
   * `startCanvasSession`, so a change made a fraction of a second before the tab
   * closes still lands instead of dying in the timer.
   */
  flush: () => void
  /** Drop the queued value without writing it (used by "start over"). */
  cancel: () => void
  isPending: () => boolean
}

export function createAutosave<T>({
  write,
  delayMs = AUTOSAVE_DEBOUNCE_MS,
}: AutosaveOptions<T>): Autosave<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let queued: { value: T } | null = null

  const clearTimer = (): void => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  const flush = (): void => {
    clearTimer()
    const pending = queued
    if (!pending) return
    queued = null
    write(pending.value)
  }

  return {
    schedule: (value) => {
      queued = { value }
      clearTimer()
      timer = setTimeout(flush, delayMs)
    },
    flush,
    cancel: () => {
      clearTimer()
      queued = null
    },
    isPending: () => queued !== null,
  }
}
