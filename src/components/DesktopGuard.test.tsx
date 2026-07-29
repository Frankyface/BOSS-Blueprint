import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SMALL_VIEWPORT_QUERY } from '../constants/viewport.ts'
import { FLAG_DISMISSED } from '../store/chromeFlags.ts'
import { installFakeMediaQuery } from '../test/fakeMediaQuery.ts'
import type { FakeMediaQuery } from '../test/fakeMediaQuery.ts'

import { DesktopGuard, GUARD_STORAGE_KEY } from './DesktopGuard.tsx'

let media: FakeMediaQuery

beforeEach(() => {
  window.sessionStorage.clear()
  media = installFakeMediaQuery(false)
})

afterEach(() => {
  media.restore()
  window.sessionStorage.clear()
})

/** Open the window already too small — before anything renders. */
function startSmall(): void {
  media.restore()
  media = installFakeMediaQuery(true)
}

/** Drag the window narrower while the app is running. */
function shrinkWindow(): void {
  act(() => {
    media.setMatches(true)
  })
}

describe('the small-viewport threshold', () => {
  it('is exactly the query the E2E boundary tests assert', () => {
    // 1024px is the decision line and the coarse-pointer clause catches tablets.
    // e2e/desktop-guard.spec.ts duplicates this literal — change one, change both.
    expect(SMALL_VIEWPORT_QUERY).toBe(
      '(max-width: 1023px), (pointer: coarse) and (max-width: 1279px)',
    )
  })

  it('is what the guard actually asks the browser about', () => {
    render(<DesktopGuard />)

    expect(media.queries).toContain(SMALL_VIEWPORT_QUERY)
  })
})

describe('DesktopGuard', () => {
  it('says nothing at a desktop size', () => {
    render(<DesktopGuard />)

    expect(screen.queryByTestId('desktop-guard')).not.toBeInTheDocument()
  })

  it('tells the truth once below the threshold', () => {
    startSmall()
    render(<DesktopGuard />)

    const guard = screen.getByTestId('desktop-guard')
    expect(guard).toHaveTextContent('Blueprint works best on a computer.')
    expect(guard).toHaveTextContent(/look around and scroll here/i)
    expect(guard).toHaveTextContent(/bigger screen/i)
  })

  it('is a status, not a dialog', () => {
    startSmall()
    render(<DesktopGuard />)

    const guard = screen.getByTestId('desktop-guard')
    expect(guard).toHaveAttribute('role', 'status')
    expect(guard).toHaveAttribute('aria-live', 'polite')
    expect(guard).not.toHaveAttribute('aria-modal')
    expect(document.querySelector('[aria-modal]')).toBeNull()
    // Nothing is taken away: no focus steal on appearance.
    expect(document.activeElement).toBe(document.body)
  })

  it('appears and disappears live, with no reload', () => {
    render(<DesktopGuard />)
    expect(screen.queryByTestId('desktop-guard')).not.toBeInTheDocument()

    shrinkWindow()
    expect(screen.getByTestId('desktop-guard')).toBeInTheDocument()

    act(() => {
      media.setMatches(false)
    })
    expect(screen.queryByTestId('desktop-guard')).not.toBeInTheDocument()
  })

  it('subscribes once and lets go on unmount', () => {
    const view = render(<DesktopGuard />)
    expect(media.listenerCount).toBe(1)

    view.unmount()
    expect(media.listenerCount).toBe(0)
  })

  it('stays dismissed for the tab session, and only the tab session', () => {
    startSmall()
    const first = render(<DesktopGuard />)

    fireEvent.click(screen.getByTestId('desktop-guard-dismiss'))

    expect(screen.queryByTestId('desktop-guard')).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem(GUARD_STORAGE_KEY)).toBe(FLAG_DISMISSED)
    // NOT localStorage: one accidental tap must not silence it forever.
    expect(window.localStorage.getItem(GUARD_STORAGE_KEY)).toBeNull()

    // A reload of the same tab keeps sessionStorage, so it stays dismissed.
    first.unmount()
    const reloaded = render(<DesktopGuard />)
    expect(screen.queryByTestId('desktop-guard')).not.toBeInTheDocument()

    // A new tab starts with empty sessionStorage, and is warned again.
    reloaded.unmount()
    window.sessionStorage.clear()
    render(<DesktopGuard />)
    expect(screen.getByTestId('desktop-guard')).toBeInTheDocument()
  })

  it('shows without remembering when storage throws', () => {
    startSmall()
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('The operation is insecure.')
      },
    })

    try {
      render(<DesktopGuard />)
      expect(screen.getByTestId('desktop-guard')).toBeInTheDocument()

      expect(() => {
        fireEvent.click(screen.getByTestId('desktop-guard-dismiss'))
      }).not.toThrow()
      expect(screen.queryByTestId('desktop-guard')).not.toBeInTheDocument()
    } finally {
      if (original) Object.defineProperty(window, 'sessionStorage', original)
    }
  })

  it('publishes its height so nothing sits permanently underneath it', () => {
    startSmall()
    const view = render(<DesktopGuard />)

    // jsdom lays nothing out, so the measured value is 0px — what matters here is
    // that the property is published while the banner is up, and gone when it is not.
    expect(document.documentElement.style.getPropertyValue('--boss-guard-inset')).toMatch(/px$/)

    view.unmount()
    expect(document.documentElement.style.getPropertyValue('--boss-guard-inset')).toBe('')
  })
})
