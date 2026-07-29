import { expect, test } from '@playwright/test'

import {
  addBlock,
  blockOfType,
  dismissStartSurfaces,
  editBlockText,
  openCanvas,
  reloadCanvas,
  seedBlocks,
} from './support/canvas.ts'
import {
  boxOf,
  expectNothingBlocked,
  guardBanner,
  probePoint,
  SMALL_VIEWPORT_QUERY,
  TOUR_STORAGE_KEY,
  tourBubble,
  watchConsoleErrors,
} from './support/chrome.ts'
import { addPage, switchToPage } from './support/site.ts'

/**
 * "BLUEPRINT WORKS BEST ON A COMPUTER" — and everything the notice is NOT allowed
 * to do.
 *
 * The threshold is the easy half. Most of this spec is about what still works
 * underneath the banner — the canvas has real width, it scrolls, the words are
 * readable, a point on the page still hit-tests to the page, the page tabs still
 * switch — because the criteria were written so that a lockout implementation
 * fails them.
 */

const MOBILE = { width: 390, height: 844 }
const TABLET = { width: 768, height: 1024 }
const DESKTOP = { width: 1440, height: 900 }

/** The notice may never eat more than a quarter of the window. */
const MAX_BANNER_FRACTION = 0.25

/** Controls a "read-only on mobile" implementation would have taken away. */
const CONTROLS_THAT_STAY = ['palette-heading', 'pen-toggle', 'page-add', 'submit-open', 'tour-help']

const SEEDED_HEADING = 'Cedar & Stone'
const WHEEL_DISTANCE_PX = 300
const PROBE_CLEARANCE_PX = 20

test.describe('below the threshold', () => {
  test.use({ viewport: MOBILE })

  test('a phone is told once, in plain English', async ({ page }) => {
    const errors = watchConsoleErrors(page)
    await openCanvas(page, { keepStart: true })

    const banner = guardBanner(page)
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Blueprint works best on a computer')
    await expect(banner).toContainText(/look around and scroll here/i)
    await expect(banner).toContainText(/bigger screen/i)
    await expect(banner).toHaveAttribute('role', 'status')
    await expect(banner).toHaveAttribute('aria-live', 'polite')

    await test.info().attach('desktop-guard-390.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
    expect(errors).toEqual([])
  })
})

test.describe('reading still works underneath it', () => {
  // Built at a desktop size the way a client would, then carried to a phone: the
  // guard's promise is about a sketch that already exists.
  test.use({ viewport: DESKTOP })

  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
    await addBlock(page, 'heading')
    await editBlockText(page, blockOfType(page, 'heading'), SEEDED_HEADING)
    // Eight stacked bands make the page taller than any phone window, so
    // "the canvas scrolls" is a real question rather than a vacuous one.
    await seedBlocks(page, 'section', 8)
    await addPage(page, 'Menu')
    await switchToPage(page, 'Home')

    await page.setViewportSize(MOBILE)
    await expect(guardBanner(page)).toBeVisible()
  })

  test('the sketch is still there, still scrollable, still hit-testable', async ({ page }) => {
    const errors = watchConsoleErrors(page)

    // 1. The canvas has real width. Three fixed columns used to squeeze it to zero
    //    at 390px, which is what made the guard's promise a lie.
    const canvasBox = await boxOf(page.getByTestId('canvas-page'))
    expect(canvasBox.width).toBeGreaterThan(0)
    expect(canvasBox.height).toBeGreaterThan(0)

    // 2. The words the client typed are on screen.
    await expect(blockOfType(page, 'heading')).toBeVisible()
    await expect(blockOfType(page, 'heading')).toContainText(SEEDED_HEADING)

    // 3. It scrolls.
    const viewport = page.getByTestId('canvas-viewport')
    await viewport.hover()
    await page.mouse.wheel(0, WHEEL_DISTANCE_PX)
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

    // 4. A point on the canvas, clear of the banner, still belongs to the canvas.
    const bannerBox = await boxOf(guardBanner(page))
    const pageBox = await boxOf(page.getByTestId('canvas-page'))
    const probeY = Math.min(
      pageBox.y + pageBox.height / 2,
      bannerBox.y - PROBE_CLEARANCE_PX,
    )
    const probe = await probePoint(page, pageBox.x + pageBox.width / 2, probeY)
    expect(probe.insideCanvas, `hit ${probe.testId ?? probe.tagName}`).toBe(true)
    expect(probe.insideGuard).toBe(false)

    // 5. Page tabs still switch.
    await switchToPage(page, 'Menu')
    await expect(page.getByTestId('canvas-page')).toBeVisible()
    await switchToPage(page, 'Home')

    expect(errors).toEqual([])
  })

  test('it warns about editing without disabling anything', async ({ page }) => {
    await expectNothingBlocked(page)

    for (const testId of CONTROLS_THAT_STAY) {
      await expect(page.getByTestId(testId), `${testId} must still be offered`).toBeEnabled()
    }

    // It does not take the focus when it appears, either.
    const stoleFocus = await page.evaluate(
      () => document.activeElement?.closest('[data-testid="desktop-guard"]') !== null,
    )
    expect(stoleFocus).toBe(false)
  })

  test('a keyboard can dismiss it', async ({ page }) => {
    await page.getByTestId('desktop-guard-dismiss').focus()
    await expect(page.getByTestId('desktop-guard-dismiss')).toBeFocused()

    await page.keyboard.press('Enter')

    await expect(guardBanner(page)).toBeHidden()
  })

  test('it is small, fixed, and hides nothing permanently', async ({ page }) => {
    const bannerBox = await boxOf(guardBanner(page))
    expect(bannerBox.height).toBeLessThanOrEqual(MOBILE.height * MAX_BANNER_FRACTION)

    const position = await guardBanner(page).evaluate(
      (element) => getComputedStyle(element).position,
    )
    expect(position).toBe('fixed')

    // The canvas scroller pads by at least the banner's height, so the bottom of
    // the page can always be scrolled clear of it.
    const paddingBottom = await page
      .getByTestId('canvas-viewport')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBottom))
    expect(paddingBottom).toBeGreaterThanOrEqual(bannerBox.height)
  })

  test('"Got it" holds for the tab session, and no longer', async ({ page, browser }) => {
    await page.getByTestId('desktop-guard-dismiss').click()
    await expect(guardBanner(page)).toBeHidden()

    // Same tab, reloaded: sessionStorage survives, so it stays dismissed.
    const url = page.url()
    await reloadCanvas(page, { keepStart: true })
    await expect(guardBanner(page)).toBeHidden()

    // A brand-new session is warned again — a real risk, not a cookie banner.
    const fresh = await browser.newContext({ viewport: MOBILE })
    const freshPage = await fresh.newPage()
    await freshPage.goto(url)
    await expect(guardBanner(freshPage)).toBeVisible()
    await fresh.close()
  })
})

test.describe('the threshold itself', () => {
  const MATRIX = [
    { size: MOBILE, shown: true, why: 'a phone' },
    { size: TABLET, shown: true, why: 'a tablet' },
    { size: { width: 1023, height: 800 }, shown: true, why: 'one pixel under the line' },
    { size: { width: 1024, height: 800 }, shown: false, why: 'exactly the line' },
    // The criteria name 1024x768 specifically: the size the audit measured the
    // toolbar clipping at, and the narrowest window the app still claims to serve.
    { size: { width: 1024, height: 768 }, shown: false, why: 'the narrowest desktop we serve' },
    { size: { width: 1280, height: 800 }, shown: false, why: 'a laptop' },
    { size: DESKTOP, shown: false, why: 'a desktop' },
  ] as const

  for (const entry of MATRIX) {
    const label = `${String(entry.size.width)}x${String(entry.size.height)}`
    test(`${entry.shown ? 'warns' : 'says nothing'} at ${label} (${entry.why})`, async ({
      page,
    }) => {
      const errors = watchConsoleErrors(page)
      await page.setViewportSize(entry.size)
      await openCanvas(page, { keepStart: true })

      if (entry.shown) await expect(guardBanner(page)).toBeVisible()
      else await expect(guardBanner(page)).toBeHidden()

      // …and the browser agrees with the one query string the component reads.
      const matches = await page.evaluate(
        (query) => window.matchMedia(query).matches,
        SMALL_VIEWPORT_QUERY,
      )
      expect(matches).toBe(entry.shown)
      expect(errors).toEqual([])
    })
  }

  test('reacts to a window being dragged, with no reload', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await openCanvas(page)
    await expect(guardBanner(page)).toBeHidden()

    await page.setViewportSize(MOBILE)
    await expect(guardBanner(page)).toBeVisible()

    await page.setViewportSize(DESKTOP)
    await expect(guardBanner(page)).toBeHidden()
  })
})

test.describe('one piece of first-run chrome at a time', () => {
  test('the tour never opens while the guard is showing', async ({ page, browser }) => {
    // A context with NOTHING seeded — the tour has never been seen here, so only
    // the guard's precedence can be keeping it away.
    await openCanvas(page)
    const url = page.url()

    const fresh = await browser.newContext({ viewport: MOBILE })
    const freshPage = await fresh.newPage()
    await freshPage.goto(url)
    await expect(freshPage.getByTestId('canvas-page')).toBeVisible()
    await dismissStartSurfaces(freshPage)

    await expect(guardBanner(freshPage)).toBeVisible()
    await expect(tourBubble(freshPage)).toBeHidden()
    // Suppressed, not burned: the flag is untouched, so a laptop visit still gets it.
    expect(
      await freshPage.evaluate((key) => window.localStorage.getItem(key), TOUR_STORAGE_KEY),
    ).toBeNull()

    await fresh.close()
  })
})

/**
 * The coarse-pointer clause: a 1180px touch tablet is wide enough to survive on
 * width alone and is precisely the device where a client will try to drag-resize
 * and conclude the tool is broken.
 *
 * Emulating a coarse pointer is the engines' business, not ours — where an engine
 * does not report one under `hasTouch`, this skips with the reason rather than
 * asserting something the browser never claimed (feature file, Open Question 1).
 */
test.describe('a touch tablet above 1024px', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true })

  test('is warned as well', async ({ page }) => {
    await openCanvas(page, { keepStart: true })

    const isCoarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)
    test.skip(!isCoarse, 'this engine does not emulate a coarse pointer under hasTouch')

    await expect(guardBanner(page)).toBeVisible()
  })
})
