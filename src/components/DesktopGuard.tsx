import { useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { useSmallViewport } from '../hooks/useSmallViewport.ts'
import { isDismissed, markDismissed } from '../store/chromeFlags.ts'

import './DesktopGuard.css'

/**
 * `sessionStorage` ON PURPOSE. A `localStorage` dismissal would silence this
 * forever after one accidental tap — including for the client who opens the tool on
 * their phone months later expecting to work on it. It survives a reload of the
 * same tab, and nothing more.
 *
 * `e2e/desktop-guard.spec.ts` duplicates this literal (the E2E suite cannot import
 * from `src/`); change one, change the other.
 */
export const GUARD_STORAGE_KEY = 'boss-blueprint:guard:v1'

/** Published on `<html>` while the banner is up; the layout pads by exactly this. */
const GUARD_INSET_PROPERTY = '--boss-guard-inset'

const HEADLINE = 'Blueprint works best on a computer.'
const BODY =
  'You can look around and scroll here, but adding blocks, dragging and drawing need a bigger ' +
  "screen. Open this on a laptop or desktop when you're ready to build."
const DISMISS_LABEL = 'Got it'

/**
 * Keep the app's bottom padding equal to the banner's real height, whatever the
 * copy wraps to on this particular phone.
 *
 * Measured rather than guessed: the alternative is a constant that is too small on
 * a 320px screen (content permanently hidden under a fixed banner) or too big
 * everywhere else. Cleared the moment the banner goes, so a desktop layout carries
 * no trace of it.
 */
function useGuardInset(ref: RefObject<HTMLDivElement | null>, isShowing: boolean): void {
  useLayoutEffect(() => {
    const root = document.documentElement

    if (!isShowing) {
      root.style.removeProperty(GUARD_INSET_PROPERTY)
      return
    }

    const banner = ref.current
    if (!banner) return

    const publish = () => {
      root.style.setProperty(GUARD_INSET_PROPERTY, `${String(banner.offsetHeight)}px`)
    }
    publish()

    // jsdom has no ResizeObserver, and there the one measurement is all there is.
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        root.style.removeProperty(GUARD_INSET_PROPERTY)
      }
    }

    const observer = new ResizeObserver(publish)
    observer.observe(banner)
    return () => {
      observer.disconnect()
      root.style.removeProperty(GUARD_INSET_PROPERTY)
    }
  }, [ref, isShowing])
}

/**
 * "BLUEPRINT WORKS BEST ON A COMPUTER" — told once, taking nothing away.
 *
 * A good phone sketching experience is an explicit v1 non-goal and the canvas is a
 * fixed 1200px design surface, so a phone visitor will have a bad time dragging and
 * drawing. They will NOT have a bad time reading: the banner warns about editing
 * and never blocks reading, which is why there is no backdrop, nothing goes
 * `inert`, nothing is disabled and no route changes. Informed consent, not a
 * lockout — a determined client on a tablet may still try, and the app lets them.
 *
 * Structurally not a dialog: `role="status"`, no `aria-modal`, no focus trap, no
 * focus steal. It is a fixed strip at the BOTTOM so the toolbar and page strip —
 * already cramped at these widths — keep every pixel they have.
 */
export function DesktopGuard() {
  const isSmallViewport = useSmallViewport()
  const [isAcknowledged, setAcknowledged] = useState(() =>
    isDismissed('session', GUARD_STORAGE_KEY),
  )
  const bannerRef = useRef<HTMLDivElement | null>(null)

  const isShowing = isSmallViewport && !isAcknowledged
  useGuardInset(bannerRef, isShowing)

  if (!isShowing) return null

  return (
    <div
      className="desktop-guard"
      data-testid="desktop-guard"
      role="status"
      aria-live="polite"
      ref={bannerRef}
    >
      <div className="desktop-guard__text">
        <p className="desktop-guard__headline">{HEADLINE}</p>
        <p className="desktop-guard__body">{BODY}</p>
      </div>
      <button
        type="button"
        className="desktop-guard__dismiss"
        data-testid="desktop-guard-dismiss"
        onClick={() => {
          markDismissed('session', GUARD_STORAGE_KEY)
          setAcknowledged(true)
        }}
      >
        {DISMISS_LABEL}
      </button>
    </div>
  )
}
