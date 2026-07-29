import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * E2E vocabulary for the FIRST-RUN CHROME: the onboarding tour and the
 * small-viewport desktop guard.
 *
 * Both are pure chrome — neither can touch the document, the `.blueprint` file or
 * the export — so everything here is about presence, reach and the two storage
 * flags that decide whether they come back.
 */

/**
 * Must match `TOUR_STORAGE_KEY` in src/store/tourStore.ts and `GUARD_STORAGE_KEY`
 * in src/components/DesktopGuard.tsx, which both carry a pointer back to here.
 * Duplicated rather than imported because the E2E suite compiles under
 * tsconfig.e2e.json, whose `include` is `e2e/**` only.
 */
export const TOUR_STORAGE_KEY = 'boss-blueprint:tour:v1'
export const GUARD_STORAGE_KEY = 'boss-blueprint:guard:v1'

/** Must match `SMALL_VIEWPORT_QUERY` in src/constants/viewport.ts. */
export const SMALL_VIEWPORT_QUERY = '(max-width: 1023px), (pointer: coarse) and (max-width: 1279px)'

export const DISMISSED = 'dismissed'

/**
 * Mark the tour as already seen, BEFORE the first paint.
 *
 * `addInitScript` rather than a `page.evaluate` after `goto`: the tour decides
 * whether to auto-start on its first effect, so a flag written afterwards would be
 * a race the suite loses on a slow machine. It also survives every reload in the
 * same page, which is what the specs that reload need.
 *
 * Every spec that is about something else gets this from `openCanvas`, because the
 * tour is deliberately in front of the palette on a fresh profile and would
 * otherwise intercept the first click of 500-odd tests.
 */
export async function seedTourDismissed(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // A context without storage cannot show the tour anyway.
      }
    },
    { key: TOUR_STORAGE_KEY, value: DISMISSED },
  )
}

export function tourBubble(page: Page): Locator {
  return page.getByTestId('tour-bubble')
}

export function guardBanner(page: Page): Locator {
  return page.getByTestId('desktop-guard')
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export async function boxOf(target: Locator): Promise<Box> {
  const box = await target.boundingBox()
  if (!box) throw new Error('That element has no bounding box')
  return box
}

/** Shortest distance between two rectangles; 0 when they touch or overlap. */
export function rectGap(a: Box, b: Box): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width))
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height))
  return Math.hypot(dx, dy)
}

/** What `document.elementFromPoint` finds there, described by its ancestry. */
export interface PointProbe {
  /** `data-testid` of the nearest ancestor that has one, including itself. */
  readonly testId: string | null
  readonly insideTour: boolean
  readonly insideGuard: boolean
  readonly insideCanvas: boolean
  readonly tagName: string
}

export function probePoint(page: Page, x: number, y: number): Promise<PointProbe> {
  return page.evaluate(
    ({ pointX, pointY }) => {
      const element = document.elementFromPoint(pointX, pointY)
      if (!element) {
        return {
          testId: null,
          insideTour: false,
          insideGuard: false,
          insideCanvas: false,
          tagName: 'none',
        }
      }
      const owner = element.closest('[data-testid]')
      return {
        testId: owner?.getAttribute('data-testid') ?? null,
        insideTour: element.closest('[data-testid="onboarding-tour"]') !== null,
        insideGuard: element.closest('[data-testid="desktop-guard"]') !== null,
        insideCanvas: element.closest('[data-testid="canvas-area"]') !== null,
        tagName: element.tagName,
      }
    },
    { pointX: x, pointY: y },
  )
}

/**
 * Nothing in the app has been made unreachable — the criterion both features share.
 * `inert` and an `aria-hidden` ancestor are the two ways a lockout implementation
 * would show up, and `aria-modal` is the third.
 */
export async function expectNothingBlocked(page: Page): Promise<void> {
  expect(await page.locator('[inert]').count(), 'nothing may be inert').toBe(0)
  expect(await page.locator('[aria-modal]').count(), 'nothing may be aria-modal').toBe(0)

  const hiddenAncestor = await page.getByTestId('canvas-area').evaluate((element) => {
    let node: Element | null = element
    while (node) {
      if (node.getAttribute('aria-hidden') === 'true') return node.tagName
      if (node.hasAttribute('inert')) return `${node.tagName} (inert)`
      node = node.parentElement
    }
    return null
  })
  expect(hiddenAncestor, 'the canvas must not be hidden from anyone').toBeNull()
}

/**
 * Collect every console error and uncaught page error for the life of a test.
 *
 * The 2026-07-28 UX audit recorded a zero-JavaScript-error session; both of these
 * features are chrome layered over a working app, and neither is allowed to be the
 * thing that spoils that.
 */
export function watchConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  return errors
}
