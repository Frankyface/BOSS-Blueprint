import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTOSAVE_DEBOUNCE_MS, createAutosave } from './autosave.ts'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the autosave debounce', () => {
  it('waits roughly a second after the last change before writing', () => {
    const write = vi.fn()
    const autosave = createAutosave<string>({ write })

    autosave.schedule('a')

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1)
    expect(write).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(write).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('writes once for a burst of changes, keeping only the newest', () => {
    const write = vi.fn()
    const autosave = createAutosave<string>({ write, delayMs: 100 })

    autosave.schedule('a')
    vi.advanceTimersByTime(50)
    autosave.schedule('b')
    vi.advanceTimersByTime(50)
    autosave.schedule('c')
    vi.advanceTimersByTime(100)

    expect(write).toHaveBeenCalledExactlyOnceWith('c')
  })

  it('writes again for changes made after a quiet period', () => {
    const write = vi.fn()
    const autosave = createAutosave<string>({ write, delayMs: 100 })

    autosave.schedule('a')
    vi.advanceTimersByTime(100)
    autosave.schedule('b')
    vi.advanceTimersByTime(100)

    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith('b')
  })

  it('honours a custom delay', () => {
    const write = vi.fn()
    const autosave = createAutosave<string>({ write, delayMs: 5 })

    autosave.schedule('a')
    vi.advanceTimersByTime(5)

    expect(write).toHaveBeenCalledOnce()
  })
})

describe('flush and cancel', () => {
  it('flush writes the queued value immediately and only once', () => {
    const write = vi.fn()
    const autosave = createAutosave<string>({ write, delayMs: 100 })

    autosave.schedule('a')
    autosave.flush()

    expect(write).toHaveBeenCalledExactlyOnceWith('a')

    vi.advanceTimersByTime(1000)
    expect(write).toHaveBeenCalledOnce()
  })

  it('flush does nothing when nothing is queued', () => {
    const write = vi.fn()
    const autosave = createAutosave<string>({ write })

    autosave.flush()

    expect(write).not.toHaveBeenCalled()
  })

  it('cancel drops the queued value so a stale write can never land', () => {
    const write = vi.fn()
    const autosave = createAutosave<string>({ write, delayMs: 100 })

    autosave.schedule('a')
    autosave.cancel()
    vi.advanceTimersByTime(1000)

    expect(write).not.toHaveBeenCalled()
    expect(autosave.isPending()).toBe(false)
  })

  it('reports whether a write is still owed', () => {
    const write = vi.fn()
    const autosave = createAutosave<string>({ write, delayMs: 100 })

    expect(autosave.isPending()).toBe(false)

    autosave.schedule('a')
    expect(autosave.isPending()).toBe(true)

    vi.advanceTimersByTime(100)
    expect(autosave.isPending()).toBe(false)
  })
})
