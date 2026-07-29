import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  addBlock,
  blockOfType,
  dismissStartSurfaces,
  editBlockText,
  openCanvas,
  readDocument,
} from './support/canvas.ts'
import {
  boxOf,
  probePoint,
  rectGap,
  TOUR_STORAGE_KEY,
  tourBubble,
  watchConsoleErrors,
} from './support/chrome.ts'

/**
 * THIRTY SECONDS OF POINTERS THAT NEVER BLOCK A CLICK.
 *
 * The blocking question is the one that needs a real browser: a bubble that looks
 * harmless can still swallow a click through an invisible full-screen layer, and
 * only a hit test at the canvas centre proves it does not. So the centrepiece here
 * is the probe that builds a heading and types into it with pointer 1 wide open.
 *
 * Everything in this spec runs WITHOUT the "already seen" seed that
 * `openCanvas` gives every other spec — this is the one that is about the tour.
 */

/** The five targets, in the order the reading path visits them. */
const EXPECTED_TARGETS = ['palette', 'canvas', 'pen-tool', 'side-panel', 'submit']

/** A bubble may be beside its target, never adrift from it. */
const MAX_ANCHOR_GAP_PX = 120

const TYPED_HEADING = 'North Star Dog Grooming'
const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 900 }

async function openWithTour(page: Page): Promise<void> {
  await openCanvas(page, { keepTour: true })
  await expect(tourBubble(page)).toBeVisible()
}

async function expectStep(page: Page, index: number): Promise<void> {
  await expect(tourBubble(page)).toHaveAttribute('data-tour-step', String(index + 1))
  await expect(tourBubble(page)).toHaveAttribute('data-tour-target', EXPECTED_TARGETS[index] ?? '')
}

function storedFlag(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), TOUR_STORAGE_KEY)
}

test.describe('a first visit', () => {
  test('waits for the starting-point choice, then points at the palette', async ({ page }) => {
    const errors = watchConsoleErrors(page)
    await openCanvas(page, { keepTour: true, keepStart: true })

    // Two first-run experiences stacked on each other is exactly the overload this
    // feature exists to remove: the picker owns the screen until it is resolved.
    await expect(page.getByTestId('template-picker')).toBeVisible()
    await expect(tourBubble(page)).toBeHidden()

    await page.getByTestId('template-card-blank').click()
    await expect(page.getByTestId('blank-start-coach')).toBeVisible()
    await expect(tourBubble(page)).toBeHidden()

    await page.getByTestId('blank-start-coach-dismiss').click()

    await expect(tourBubble(page)).toBeVisible()
    await expectStep(page, 0)
    await expect(tourBubble(page)).toContainText('Click a block to add it.')
    await expect(tourBubble(page)).toHaveAttribute('data-tour-count', '5')

    await test.info().attach('tour-step-1.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
    expect(errors).toEqual([])
  })

  test('is marked seen the moment it appears', async ({ page }) => {
    await openWithTour(page)

    // Written on first render, not on completion: a half-read tour has still been
    // seen, and re-showing it is more annoying than useful.
    expect(await storedFlag(page)).toBe('dismissed')
  })
})

test.describe('it never blocks', () => {
  test.beforeEach(async ({ page }) => {
    await openWithTour(page)
  })

  test('a block can be added and typed into with pointer 1 open', async ({ page }) => {
    const errors = watchConsoleErrors(page)

    await addBlock(page, 'heading')
    await expect(blockOfType(page, 'heading')).toBeVisible()

    await editBlockText(page, blockOfType(page, 'heading'), TYPED_HEADING)

    const document = await readDocument(page)
    expect(document.blocks.find((block) => block.type === 'heading')?.text).toBe(TYPED_HEADING)
    // …and the tour was up for the whole thing.
    await expect(tourBubble(page)).toBeVisible()
    expect(errors).toEqual([])
  })

  test('the middle of the canvas belongs to the canvas', async ({ page }) => {
    const canvas = await boxOf(page.getByTestId('canvas-area'))

    const probe = await probePoint(page, canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)

    expect(probe.insideTour, `hit ${probe.testId ?? probe.tagName}`).toBe(false)
    expect(probe.insideCanvas).toBe(true)
  })

  test('has no backdrop, no modal semantics and no focus trap', async ({ page }) => {
    const layerEvents = await page
      .getByTestId('onboarding-tour')
      .evaluate((element) => getComputedStyle(element).pointerEvents)
    expect(layerEvents).toBe('none')

    // The bubble itself is the only part that takes a click.
    const bubbleEvents = await tourBubble(page).evaluate(
      (element) => getComputedStyle(element).pointerEvents,
    )
    expect(bubbleEvents).toBe('auto')

    expect(await page.locator('[aria-modal]').count()).toBe(0)
    expect(await page.locator('[inert]').count()).toBe(0)
    await expect(tourBubble(page)).toHaveAttribute('role', 'note')

    // Skip and Next are real, focusable buttons…
    await tourBubble(page).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('tour-skip')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('tour-next')).toBeFocused()

    // …and focus given to the app STAYS in the app. A focus trap is implemented by
    // dragging focus back on `focusin`, so this is the assertion that catches one —
    // deliberately not "Tab off the end of the document", which each engine hands
    // to its own browser chrome differently.
    await page.getByTestId('palette-heading').focus()
    await expect(page.getByTestId('palette-heading')).toBeFocused()
    await page.keyboard.press('Tab')

    const trapped = await page.evaluate(
      () => document.activeElement?.closest('[data-testid="onboarding-tour"]') !== null,
    )
    expect(trapped).toBe(false)
    await expect(tourBubble(page)).toBeVisible()
  })

  test('the canvas still scrolls', async ({ page }) => {
    for (let index = 0; index < 6; index += 1) {
      await addBlock(page, 'section')
    }

    const viewport = page.getByTestId('canvas-viewport')
    await viewport.hover()
    await page.mouse.wheel(0, 400)

    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect(tourBubble(page)).toBeVisible()

    // And the pointer is still pointing at the right thing afterwards.
    const bubbleBox = await boxOf(tourBubble(page))
    const targetBox = await boxOf(page.locator('[data-tour="palette"]'))
    expect(rectGap(bubbleBox, targetBox)).toBeLessThanOrEqual(MAX_ANCHOR_GAP_PX)
  })
})

test.describe('stepping through', () => {
  test('anchors all five pointers beside their targets, inside the window', async ({ page }) => {
    const errors = watchConsoleErrors(page)
    await openWithTour(page)
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()

    for (const [index, target] of EXPECTED_TARGETS.entries()) {
      await expectStep(page, index)

      const bubbleBox = await boxOf(tourBubble(page))
      const targetBox = await boxOf(page.locator(`[data-tour="${target}"]`))

      expect(rectGap(bubbleBox, targetBox), `${target} bubble is adrift`).toBeLessThanOrEqual(
        MAX_ANCHOR_GAP_PX,
      )
      expect(bubbleBox.x, `${target} bubble off the left`).toBeGreaterThanOrEqual(0)
      expect(bubbleBox.y, `${target} bubble off the top`).toBeGreaterThanOrEqual(0)
      expect(bubbleBox.x + bubbleBox.width, `${target} bubble off the right`).toBeLessThanOrEqual(
        viewport?.width ?? 0,
      )
      expect(bubbleBox.y + bubbleBox.height, `${target} bubble off the bottom`).toBeLessThanOrEqual(
        viewport?.height ?? 0,
      )

      const isLast = index === EXPECTED_TARGETS.length - 1
      await page.getByTestId(isLast ? 'tour-done' : 'tour-next').click()
    }

    await expect(tourBubble(page)).toBeHidden()
    expect(errors).toEqual([])
  })

  test('re-anchors when the window is resized', async ({ page }) => {
    await openWithTour(page)
    await page.getByTestId('tour-next').click()
    await expectStep(page, 1)

    const before = await boxOf(tourBubble(page))
    await page.setViewportSize(DESKTOP)

    await expect
      .poll(async () => (await boxOf(tourBubble(page))).x)
      .not.toBe(before.x)
    const after = await boxOf(tourBubble(page))
    expect(after.x + after.width).toBeLessThanOrEqual(DESKTOP.width)
  })
})

test.describe('getting rid of it', () => {
  test('Escape closes it, and it does not come back', async ({ page }) => {
    await openWithTour(page)
    await page.getByTestId('tour-next').click()
    await expectStep(page, 1)

    await page.keyboard.press('Escape')
    await expect(tourBubble(page)).toBeHidden()
    expect(await storedFlag(page)).toBe('dismissed')

    // Not after a reload — and asserted from the editing state, where it WOULD
    // have opened, rather than from behind the picker where anything is hidden.
    await page.reload()
    await expect(page.getByTestId('canvas-page')).toBeVisible()
    await dismissStartSurfaces(page)
    await expect(tourBubble(page)).toBeHidden()

    // …and not in a new tab of the same browser, which shares the flag.
    const url = page.url()
    const secondTab = await page.context().newPage()
    await secondTab.goto(url)
    await expect(secondTab.getByTestId('canvas-page')).toBeVisible()
    await dismissStartSurfaces(secondTab)
    await expect(tourBubble(secondTab)).toBeHidden()
    await secondTab.close()
  })

  test('Skip closes it from any step', async ({ page }) => {
    await openWithTour(page)
    await page.getByTestId('tour-next').click()
    await page.getByTestId('tour-next').click()
    await expectStep(page, 2)

    await page.getByTestId('tour-skip').click()

    await expect(tourBubble(page)).toBeHidden()
    expect(await storedFlag(page)).toBe('dismissed')
  })
})

test.describe('the help control', () => {
  test('brings the whole thing back from pointer 1, whenever it is asked', async ({ page }) => {
    const errors = watchConsoleErrors(page)
    await openWithTour(page)
    await page.getByTestId('tour-skip').click()
    await expect(tourBubble(page)).toBeHidden()

    await page.getByTestId('tour-help').click()

    await expect(tourBubble(page)).toBeVisible()
    await expectStep(page, 0)
    // Asking for help once must not sign a client up for it on every future visit.
    expect(await storedFlag(page)).toBe('dismissed')

    await page.getByTestId('tour-skip').click()
    await page.reload()
    await expect(page.getByTestId('canvas-page')).toBeVisible()
    await dismissStartSurfaces(page)
    await expect(tourBubble(page)).toBeHidden()

    // Still there, on a page of the sketch that was never the first one.
    await page.getByTestId('page-add').click()
    await page.getByTestId('page-add-name').fill('Menu')
    await page.getByTestId('page-add-confirm').click()
    await page.getByTestId('tour-help').click()
    await expectStep(page, 0)

    expect(errors).toEqual([])
  })
})

test.describe('when the guard has precedence', () => {
  test.use({ viewport: MOBILE })

  test('no pointers on a phone, and they return with the window', async ({ page }) => {
    await openCanvas(page, { keepTour: true })

    await expect(page.getByTestId('desktop-guard')).toBeVisible()
    await expect(tourBubble(page)).toBeHidden()
    // Suppressed rather than spent: nothing has been marked seen.
    expect(await storedFlag(page)).toBeNull()

    await page.setViewportSize(DESKTOP)
    await expect(page.getByTestId('desktop-guard')).toBeHidden()

    await page.getByTestId('tour-help').click()
    await expect(tourBubble(page)).toBeVisible()
    await expectStep(page, 0)
  })
})

test.describe('with reduced motion asked for', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('the bubble does not animate at all', async ({ page }) => {
    await openWithTour(page)

    const duration = await tourBubble(page).evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    )
    expect(duration).toBe('0s')
  })
})

test.describe('with motion allowed', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  test('the bubble does animate — so the reduced-motion assertion has teeth', async ({ page }) => {
    await openWithTour(page)

    const duration = await tourBubble(page).evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    )
    expect(duration).not.toBe('0s')
  })
})
