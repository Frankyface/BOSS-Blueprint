import { expect, test } from '@playwright/test'
import type { Page, Response } from '@playwright/test'

import { addBlock, blockOfType, editBlockText, openCanvas, seedBlocks } from './support/canvas.ts'

/**
 * THE FRONT DOOR — everything a client or a search engine sees before they see
 * the canvas, plus the UX audit's cosmetic tail.
 *
 * Literals are duplicated from `src/meta/headTags.ts` on purpose: this suite
 * cannot import from `src/` (same rule as the desktop guard's storage key), and
 * a second, independent copy is what makes this a check rather than a tautology.
 * `src/meta/headTags.test.ts` pins `index.html` to that module; this pins the
 * SERVED page to the same strings. Change the copy, change all three.
 */

const DEPLOYED_BASE_URL = 'https://sketch.bossolutions.pro/'
const CARD_URL = `${DEPLOYED_BASE_URL}og-card.png`
const PAGE_TITLE = 'Sketch your website — BOSS Blueprint'
const PAGE_DESCRIPTION =
  'Lay out your future website page by page in your browser — blocks, notes and photos — then send BOSS a ready-to-build package. Free, no account.'
const CARD_ALT = 'BOSS Blueprint — sketch your website page by page'

const TITLE_MAX_LENGTH = 60
const DESCRIPTION_MIN_LENGTH = 110
const DESCRIPTION_MAX_LENGTH = 160

const CARD_WIDTH = 1200
const CARD_HEIGHT = 630

const BOSS_SITE_URL = 'https://bossolutions.pro'

const ICON_FILES = ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']

const OG_TAGS: Readonly<Record<string, string>> = {
  'og:type': 'website',
  'og:site_name': 'BOSS Blueprint',
  'og:title': PAGE_TITLE,
  'og:description': PAGE_DESCRIPTION,
  'og:url': DEPLOYED_BASE_URL,
  'og:image': CARD_URL,
  'og:image:width': String(CARD_WIDTH),
  'og:image:height': String(CARD_HEIGHT),
  'og:image:alt': CARD_ALT,
}

const TWITTER_TAGS: Readonly<Record<string, string>> = {
  'twitter:card': 'summary_large_image',
  'twitter:title': PAGE_TITLE,
  'twitter:description': PAGE_DESCRIPTION,
  'twitter:image': CARD_URL,
  'twitter:image:alt': CARD_ALT,
}

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

/** Enough to walk the whole shell; the assertion fails long before this bites. */
const MAX_TAB_STEPS = 80

const PNG_IHDR_WIDTH_OFFSET = 16
const SECTIONS_TALLER_THAN_ANY_WINDOW = 8

function metaContent(page: Page, attribute: 'name' | 'property', key: string): Promise<string | null> {
  return page.locator(`meta[${attribute}="${key}"]`).getAttribute('content')
}

/** PNG dimensions straight out of the IHDR chunk, which is always first. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return {
    width: bytes.readUInt32BE(PNG_IHDR_WIDTH_OFFSET),
    height: bytes.readUInt32BE(PNG_IHDR_WIDTH_OFFSET + 4),
  }
}

/** Where the focus ring is now, named by the region of the shell it sits in. */
const REGION_SELECTOR = [
  '[data-testid="app-header"]',
  '[data-testid="block-palette"]',
  '[data-testid="page-strip"]',
  '[data-testid="canvas-area"]',
  '[data-testid="side-panel"]',
  '[data-testid="app-footer"]',
].join(', ')

async function focusedRegion(page: Page): Promise<string | null> {
  return page.evaluate((selector) => {
    const active = document.activeElement
    if (!active || active === document.body) return null
    return active.closest(selector)?.getAttribute('data-testid') ?? null
  }, REGION_SELECTOR)
}

/**
 * The regions the focus ring visits from a named starting control, in order,
 * with repeats collapsed.
 *
 * It starts from an element rather than from "the top of the document" because
 * neither exists reliably: tab order is a cycle, where a cycle is entered
 * depends on what was clicked last (dismissing the start card leaves the
 * browser's sequential-navigation point where that card used to be), and Firefox
 * hands focus to its own chrome at the end and does not come back. Starting at
 * the header's first control is deterministic in all three engines.
 */
async function tabFromHeader(page: Page, steps = MAX_TAB_STEPS): Promise<string[]> {
  await page.getByTestId('tour-help').focus()

  const visited: string[] = []
  const record = async () => {
    const region = await focusedRegion(page)
    if (region !== null && region !== visited.at(-1)) visited.push(region)
  }

  await record()
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press('Tab')
    await record()
  }
  return visited
}

interface TextStyle {
  fontSize: string
  fontWeight: string
  fontFamily: string
  color: string
  textAlign: string
}

const readTextStyle = (element: Element): TextStyle => {
  const style = getComputedStyle(element)
  return {
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontFamily: style.fontFamily,
    color: style.color,
    textAlign: style.textAlign,
  }
}

test.describe('the head a link preview reads', () => {
  test('carries the title, the description and every card tag', async ({ page }) => {
    await openCanvas(page)

    await expect(page).toHaveTitle(PAGE_TITLE)
    expect(PAGE_TITLE.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH)

    const description = await metaContent(page, 'name', 'description')
    expect(description).toBe(PAGE_DESCRIPTION)
    expect((description ?? '').length).toBeGreaterThanOrEqual(DESCRIPTION_MIN_LENGTH)
    expect((description ?? '').length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH)

    for (const [key, value] of Object.entries(OG_TAGS)) {
      expect(await metaContent(page, 'property', key), key).toBe(value)
    }
    for (const [key, value] of Object.entries(TWITTER_TAGS)) {
      expect(await metaContent(page, 'name', key), key).toBe(value)
    }
  })

  /**
   * A RELATIVE `og:image` IS A BLANK CARD, silently. The scraper is on another
   * host and resolves nothing; no browser warns and no test would notice, which
   * is exactly why this one is explicit.
   */
  test('gives absolute URLs for the page and its card', async ({ page }) => {
    await openCanvas(page)

    for (const key of ['og:url', 'og:image'] as const) {
      expect(await metaContent(page, 'property', key)).toMatch(/^https:\/\//)
    }
    expect(await metaContent(page, 'name', 'twitter:image')).toMatch(/^https:\/\//)
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(DEPLOYED_BASE_URL)
    expect(await page.locator('html').getAttribute('lang')).toBe('en')
  })
})

test.describe('the self-hosted icon set and card', () => {
  test('every icon returns 200', async ({ page }) => {
    await openCanvas(page)

    for (const name of ICON_FILES) {
      const response = await page.request.get(`./${name}`)
      expect(response.status(), name).toBe(200)
      expect((await response.body()).length, name).toBeGreaterThan(0)
    }
  })

  test('the social card is a 1200x630 PNG that is actually there', async ({ page }) => {
    await openCanvas(page)

    const response = await page.request.get('./og-card.png')
    expect(response.status()).toBe(200)

    const bytes = await response.body()
    expect(pngSize(bytes)).toEqual({ width: CARD_WIDTH, height: CARD_HEIGHT })
  })

  test('the first load asks for nothing that is not there', async ({ page }) => {
    const failures: string[] = []
    page.on('response', (response: Response) => {
      if (response.status() >= 400) failures.push(`${String(response.status())} ${response.url()}`)
    })

    await openCanvas(page)
    await expect(page.getByTestId('app-footer')).toBeVisible()

    expect(failures).toEqual([])
  })
})

test.describe('the BOSS footer', () => {
  test('sends people to bossolutions.pro, safely, at every size', async ({ page }) => {
    await openCanvas(page)

    for (const size of [DESKTOP, PHONE]) {
      await page.setViewportSize(size)
      // The guard's banner overlays the bottom strip while it is up; it is a
      // dismissible notice, and the footer is what is underneath it.
      const guardDismiss = page.getByTestId('desktop-guard-dismiss')
      if (await guardDismiss.isVisible()) await guardDismiss.click()

      const link = page.getByTestId('app-footer-link')
      await expect(link, `${String(size.width)}x${String(size.height)}`).toBeVisible()
      await expect(link).toContainText('Built by BOSS')
      await expect(link).toContainText('bossolutions.pro')
      await expect(link).toHaveAttribute('href', BOSS_SITE_URL)
      await expect(link).toHaveAttribute('target', '_blank')
      expect(await link.getAttribute('rel')).toContain('noopener')
    }
  })

  test('is in the tab order, not just clickable', async ({ page, browserName }) => {
    await openCanvas(page)
    const link = page.getByTestId('app-footer-link')

    // A real anchor with a real href, and nothing has taken it out of the order.
    expect(await link.getAttribute('tabindex')).toBeNull()
    await link.focus()
    await expect(link).toBeFocused()

    /*
     * Safari keeps LINKS out of the Tab sequence unless the user turns on "Press
     * Tab to highlight each item on a webpage", and WebKit ships that default —
     * so the round trip is asserted where the engine offers it rather than
     * asserting something this browser never claimed (the same rule the desktop
     * guard's coarse-pointer test follows). The markup is identical in all three
     * and is focusable in all three, which is what the assertions above cover.
     */
    test.skip(browserName === 'webkit', 'WebKit keeps links out of the Tab sequence by default')

    // Reachable, and escapable — both directions.
    await page.keyboard.press('Shift+Tab')
    await expect(link).not.toBeFocused()
    await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
  })

  /**
   * Open Question 1 of the feature file: the footer is app chrome and must never
   * be inside a page. `exportRoot` mounts its own root, and this is the belt to
   * that braces — the footer's words must not exist anywhere inside the element
   * the PNG renderer captures.
   */
  test('is nowhere inside the page the renderer captures', async ({ page }) => {
    await openCanvas(page)

    const pageText = await page.getByTestId('canvas-page').innerText()
    expect(pageText).not.toContain('Built by BOSS')
    expect(pageText).not.toContain('bossolutions.pro')
  })
})

test.describe('the palette (UX audit P2)', () => {
  test('does not open with Section, and says what one is', async ({ page }) => {
    await openCanvas(page)

    const buttons = page.getByTestId('block-palette').getByRole('button')
    const types = await buttons.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-block-type')),
    )

    expect(types[0]).toBe('heading')
    expect(types.at(-1)).toBe('section')
    await expect(page.getByTestId('palette-section')).toContainText(
      'A coloured background band behind other blocks',
    )
  })
})

test.describe('tab order follows reading order (UX audit N7)', () => {
  /**
   * The page strip renders ABOVE the canvas inside the stage column, so reading
   * order down the screen is header → palette → page strip → canvas → details
   * panel → footer. (The feature file lists the canvas before the page strip;
   * that is the two swapped, and the binding assertion it names — the palette
   * comes before the right-hand panel — is the one that matters.)
   */
  const READING_ORDER = [
    'app-header',
    'block-palette',
    'page-strip',
    'canvas-area',
    'side-panel',
  ]

  test('reaches the palette before the details panel', async ({ page }) => {
    await openCanvas(page)

    const visited = await tabFromHeader(page)

    expect(visited.slice(0, READING_ORDER.length), visited.join(' → ')).toEqual(READING_ORDER)
    expect(visited.indexOf('block-palette')).toBeLessThan(visited.indexOf('side-panel'))
    // The footer is chrome at the end of the shell, so where an engine tabs to
    // links at all it comes after everything — never before the palette.
    if (visited.includes('app-footer')) {
      expect(visited.indexOf('side-panel')).toBeLessThan(visited.indexOf('app-footer'))
    }
  })
})

test.describe('naming a page (UX audit N4)', () => {
  test('offers one "Add page" at a time and says why the confirm is greyed out', async ({
    page,
  }) => {
    await openCanvas(page)

    const addPage = page.getByRole('button', { name: 'Add page', exact: true })
    await expect(addPage).toHaveCount(1)
    await addPage.click()

    // Still exactly one — the confirm is a different verb now.
    await expect(page.getByRole('button', { name: 'Add page', exact: true })).toHaveCount(1)

    const confirm = page.getByTestId('page-add-confirm')
    await expect(confirm).toHaveText('Create page')
    await expect(confirm).toBeDisabled()

    const reason = page.getByTestId('page-add-disabled-reason')
    await expect(reason).toHaveText('Type a name first')
    await expect(page.getByTestId('page-add-name')).toHaveAttribute(
      'aria-describedby',
      'page-add-disabled-reason',
    )

    await page.getByTestId('page-add-name').fill('Menu')
    await expect(confirm).toBeEnabled()
    await expect(reason).toBeHidden()
  })
})

test.describe('the inline editor matches the block (UX audit P1)', () => {
  test('a Heading is typed in the font it is rendered in', async ({ page }) => {
    await openCanvas(page)
    await addBlock(page, 'heading')

    const block = blockOfType(page, 'heading')
    // The client's OWN words, not the placeholder: a placeholder is deliberately
    // muted on both sides, and it is the committed text the illusion is about.
    await editBlockText(page, block, 'Bread worth the walk')
    const rendered = await block.locator('.block-content').evaluate(readTextStyle)

    await block.dblclick()
    const editor = page.getByTestId('block-text-editor')
    await expect(editor).toBeVisible()
    const editing = await editor.evaluate(readTextStyle)

    expect(editing).toEqual(rendered)
    // The numbers, not just the agreement — 18px/400 was the old editor.
    expect(editing.fontSize).toBe('40px')
    expect(editing.fontWeight).toBe('700')
  })

  test('a Button keeps the pill’s own colours while it is being typed', async ({ page }) => {
    await openCanvas(page)
    await addBlock(page, 'button')

    const block = blockOfType(page, 'button')
    await editBlockText(page, block, 'See the menu')
    const rendered = await block.locator('.block-content__pill').evaluate(readTextStyle)

    await block.dblclick()
    const editor = page.getByTestId('block-text-editor')
    await expect(editor).toBeVisible()

    expect(await editor.evaluate(readTextStyle)).toEqual(rendered)
  })
})

test.describe('the page continues below (UX audit P5)', () => {
  test('fades the bottom edge while there is more, and stops when there is not', async ({
    page,
  }) => {
    await openCanvas(page)
    await seedBlocks(page, 'section', SECTIONS_TALLER_THAN_ANY_WINDOW)

    /*
     * `toHaveCSS` RATHER THAN A ONE-SHOT `getComputedStyle`, IN BOTH DIRECTIONS.
     *
     * The cue is a 120ms opacity transition, so a single read can land mid-fade:
     * this line asserted `'1'` and got `0.998593` on a CI runner. Playwright's web
     * -first assertions re-read until they agree or time out, which is the only
     * honest way to say "it ends up opaque" about a value that is on its way there.
     */
    const cue = page.getByTestId('canvas-more')
    await expect(cue).toHaveAttribute('data-more', 'true')
    await expect(cue).toHaveCSS('opacity', '1')

    const viewport = page.getByTestId('canvas-viewport')
    await viewport.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })

    await expect(cue).toHaveAttribute('data-more', 'false')
    await expect(cue).toHaveCSS('opacity', '0')
  })
})

test.describe('site settings read as examples (UX audit N9)', () => {
  test('every placeholder is visibly a suggestion', async ({ page }) => {
    await openCanvas(page)
    await page.getByTestId('side-panel-tab-site').click()

    const placeholders = await page
      .getByTestId('site-settings')
      .locator('[placeholder]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('placeholder') ?? ''))

    expect(placeholders.length).toBeGreaterThan(0)
    for (const placeholder of placeholders) {
      expect(placeholder, placeholder).toMatch(/^e\.g\. /)
    }
  })

  /** P4's UI half: the picker leads the row, the hex field follows it. */
  test('preferred colours lead with the swatch picker', async ({ page }) => {
    await openCanvas(page)
    await page.getByTestId('side-panel-tab-site').click()

    const swatch = page.getByTestId('site-color-0-swatch')
    const field = page.getByTestId('site-color-0')

    await expect(swatch).toHaveAttribute('type', 'color')
    await expect(swatch).toHaveAttribute('data-empty', 'true')
    expect(
      await swatch.evaluate(
        (element, other) =>
          Boolean(element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING),
        await field.elementHandle(),
      ),
    ).toBe(true)

    // Picking commits, and the hex field is put straight to what was stored.
    // Driven through the prototype's own setter because React ignores an `input`
    // event whose value it believes it already knows (same idiom as the honeypot).
    await swatch.evaluate((element) => {
      const input = element as HTMLInputElement
      // eslint-disable-next-line @typescript-eslint/unbound-method -- called via `.call` on the very instance it came from.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '#2f5d50')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await expect(field).toHaveValue('#2f5d50')
    await expect(swatch).toHaveAttribute('data-empty', 'false')
  })
})
