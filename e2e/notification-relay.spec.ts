import { expect, test, type Page } from '@playwright/test'

import { PREVIEW_BASE_URL, PREVIEW_HOST, PREVIEW_PORT } from '../site.config.ts'

import { openCanvas } from './support/canvas.ts'
import {
  capturePackage,
  fillLead,
  openCanvasWithStub,
  openSubmit,
  seedSubmitDesign,
  sendButton,
  submitFixturePages,
} from './support/submit.ts'

/**
 * THE NOTIFICATION RELAY, in three engines.
 *
 * Two halves, and the FIRST one is the load-bearing one:
 *
 *  1. WITH NO CONFIG — how this repo ships — submit must be exactly what it was
 *     before the relay existed. Not "works fine": identical, with **zero** new
 *     network calls. Everything the Stage 3 DoD, the live gauntlet and the
 *     round-trip runs proved rests on that path, so it is asserted by recording
 *     every single request the page makes during a full submit.
 *
 *  2. WITH A CONFIG injected through the E2E-only seam (`?submit-stub=relay-live`,
 *     folded out of production like the other seams), the REAL adapter runs — real
 *     config validation, real degrade ladder, real fetch, real status mapping —
 *     against a same-origin route this spec fulfils. Same origin on purpose: no
 *     CORS, and no preflight for `page.route` to miss.
 *
 * The relay is never allowed to be visible as a failure. `sent` adds one line;
 * everything else says nothing at all.
 */

test.slow(({ browserName }) => browserName === 'webkit')

const CLIENT = { name: 'Dana Whitfield', email: 'dana@bluebirdbakery.ca' }
const BUSINESS = 'Bluebird Bakery'
const RELAY_PATH = '**/__relay-e2e'
const ORIGIN = `http://${PREVIEW_HOST}:${String(PREVIEW_PORT)}`

/** The expected body keys — a closed set is what "no PII we were not given" means. */
const EXPECTED_BODY_KEYS = ['access_key', 'botcheck', 'email', 'message', 'name', 'subject']

async function seedValidDesign(page: Page): Promise<void> {
  await seedSubmitDesign(page, { pages: submitFixturePages() })
  await openSubmit(page)
  await fillLead(page, { ...CLIENT, business: BUSINESS })
}

function relayNote(page: Page) {
  return page.getByTestId('submit-relay-note')
}

test.describe('with no relay configured — the shipped state', () => {
  test('submits with zero new network calls and says nothing about a notification', async ({
    page,
  }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      requests.push(request.url())
    })

    await openCanvas(page)
    await seedValidDesign(page)

    const captured = await capturePackage(page, async () => {
      await sendButton(page).click()
    })

    await expect(page.getByTestId('submit-complete')).toBeVisible()
    expect(captured.suggestedFilename).toMatch(/^blueprint_[a-z0-9-]+_[0-9a-f]{8}\.zip$/)

    // THE PROOF. Every http(s) request the page made belongs to the app itself.
    const foreign = requests.filter(
      (url) => /^https?:/.test(url) && !url.startsWith(PREVIEW_BASE_URL) && !url.startsWith(ORIGIN),
    )
    expect(foreign, `unexpected outbound requests: ${foreign.join(', ')}`).toEqual([])
    expect(requests.filter((url) => url.includes('__relay-e2e'))).toEqual([])

    // The stub resolves `skipped`, so the screen must not mention a notification.
    await expect(relayNote(page)).toHaveCount(0)
    // …and nothing about it is an error either.
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
  })
})

test.describe('with a relay configured', () => {
  test('notifies AFTER the download, and only a real 200 puts a line on screen', async ({
    page,
  }) => {
    const posted: string[] = []
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    await page.route(RELAY_PATH, async (route) => {
      posted.push(route.request().postData() ?? '')
      // Held open rather than delayed by a timer: the assertion below is about
      // ORDER, and a timing race would make it prove nothing on a slow engine.
      await held
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    await openCanvasWithStub(page, 'relay-live')
    await seedValidDesign(page)

    const captured = await capturePackage(page, async () => {
      await sendButton(page).click()
    })

    /* The client is DONE while the relay is still in flight — that is the point. */
    await expect(page.getByTestId('submit-complete')).toBeVisible()
    await expect(page.getByTestId('submit-filename')).toHaveText(captured.suggestedFilename)
    await expect(relayNote(page)).toHaveCount(0)

    release()
    await expect(relayNote(page)).toBeVisible()
    await expect(relayNote(page)).toContainText('been notified')

    /* What actually went over the wire. */
    const uuid8 = await page.getByTestId('submit-uuid').innerText()
    expect(posted).toHaveLength(1)
    const raw = posted[0] ?? ''
    const body = JSON.parse(raw) as Record<string, string>

    expect(Object.keys(body).sort()).toEqual(EXPECTED_BODY_KEYS)
    expect(body.access_key).toBe('e2e-not-a-real-key')
    expect(body.subject).toContain(uuid8)
    expect(body.subject).toContain(BUSINESS)
    expect(body.name).toBe(CLIENT.name)
    expect(body.email).toBe(CLIENT.email)
    expect(body.botcheck).toBe('')
    expect(body.message).toContain(uuid8)
    expect(body.message).toContain(captured.suggestedFilename)
    // Text-only, always: the zip never rides the relay (debate #2).
    expect(raw.length).toBeLessThan(captured.sizeBytes)
  })

  test('a refusing relay changes nothing the client sees', async ({ page }) => {
    let hits = 0
    await page.route(RELAY_PATH, async (route) => {
      hits += 1
      await route.fulfill({ status: 500, contentType: 'text/plain', body: 'nope' })
    })

    await openCanvasWithStub(page, 'relay-live')
    await seedValidDesign(page)

    const captured = await capturePackage(page, async () => {
      await sendButton(page).click()
    })

    await expect(page.getByTestId('submit-complete')).toBeVisible()
    await expect(page.getByTestId('submit-filename')).toHaveText(captured.suggestedFilename)

    // The relay really was called, and really failed.
    await expect.poll(() => hits).toBe(1)

    // No claim, no error, and step 2 — the path that actually delivers — is intact.
    await expect(relayNote(page)).toHaveCount(0)
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
    await expect(page.getByTestId('submit-mailto')).toHaveAttribute('href', /^mailto:/)
    await expect(page.getByTestId('submit-address')).toHaveValue(/@/)
  })
})
