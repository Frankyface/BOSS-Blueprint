import { expect, test } from '@playwright/test'

import { blockById, editBlockText, openCanvas, readDocument } from './support/canvas.ts'
import {
  capturePackage,
  entryBytes,
  openCanvasWithStub,
  expectedEntries,
  fillHoneypot,
  fillLead,
  openSubmit,
  readEntry,
  runPackageGate,
  seedFixturePhoto,
  seedSubmitDesign,
  sendButton,
  submitFixturePages,
  withExtraEntry,
  type SiteJsonShape,
} from './support/submit.ts'

/**
 * THE APP'S ENDING, end to end.
 *
 * This spec is where Stage 3's Definition of Done is discharged: a design goes
 * through the real submit UI, the zip DOWNLOADS, the test unzips it and asserts
 * §1's layout against the package's own `site.json`, and then hands the file to
 * `scripts/roundtrip/gate.mjs` — a separate program that imports no app code —
 * and requires exit 0.
 */

test.slow(({ browserName }) => browserName === 'webkit')

const CLIENT = { name: 'Dana Whitfield', email: 'dana@bluebirdbakery.ca' }
const BUSINESS = 'Bluebird Bakery'
const FILENAME_PATTERN = /^blueprint_[a-z0-9-]+_[0-9a-f]{8}\.zip$/
const BYTES_PER_KB = 1024

test.describe('the full journey', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
    await seedSubmitDesign(page, { pages: submitFixturePages({ withBlockers: true }) })
    // A real photo in the slot, so the package this journey ships carries a real
    // `assets/` entry and the gate at the end reads real bytes (F2).
    await seedFixturePhoto(page)
  })

  test('gates the form, blocks, fixes, warns, downloads, and passes the round-trip gate', async ({
    page,
  }) => {
    await openSubmit(page)

    /* -------- the form gate: a missing business name stops it, calmly -------- */
    await fillLead(page, CLIENT)
    await sendButton(page).click()

    await expect(page.getByTestId('submit-error-businessName')).toBeVisible()
    await expect(page.getByTestId('submit-error-businessName')).toHaveAttribute('role', 'alert')
    await expect(page.getByTestId('submit-view')).toHaveAttribute('data-screen', 'form')
    // Nothing was rendered and nothing was sent — this is a form, not a failure.
    await expect(page.getByTestId('submit-progress')).toBeHidden()

    /* -------- the V23 pre-flight names the untouched template block --------- */
    await expect(page.getByTestId('submit-filler')).toBeVisible()
    await expect(page.getByTestId('submit-filler-item')).toHaveCount(1)
    await expect(page.getByTestId('submit-filler-item')).toContainText('123 Agricola St')

    /* -------- the BLOCK path: two client-fixable findings, with jumps ------- */
    await fillLead(page, { business: BUSINESS })
    await sendButton(page).click()

    await expect(page.getByTestId('submit-view')).toHaveAttribute('data-screen', 'blocked')
    const findings = page.getByTestId('submit-finding')
    await expect(findings).toHaveCount(2)

    // A client who pressed Send and stayed put has no idea anything happened, so
    // focus moves to the first finding — asserted, not assumed (F1).
    await expect(findings.first()).toBeFocused()
    // …and the list is still a list: the urgency lives on the message, not on the
    // <li>, so a screen reader still reports "2 items" (F7).
    await expect(findings.first().getByRole('alert')).toBeVisible()
    await expect(findings.first()).toHaveJSProperty('tagName', 'LI')
    await expect(findings.filter({ hasText: 'Tell us what to write here' })).toBeVisible()
    await expect(findings.filter({ hasText: 'This text box is empty' })).toBeVisible()
    for (const rule of ['V05', 'V19']) {
      await expect(page.locator(`[data-testid="submit-finding"][data-rule="${rule}"]`)).toHaveCount(1)
    }

    // Jump to the offending block: back on the canvas, right page, right block.
    await page
      .locator('[data-testid="submit-finding"][data-rule="V19"]')
      .getByTestId('submit-jump')
      .click()
    await expect(page.getByTestId('canvas-page')).toBeVisible()
    await expect(blockById(page, 'home-heading')).toHaveAttribute('data-selected', 'true')
    expect((await readDocument(page)).currentPageId).toBe('page-home')

    /* -------- fix both in the UI, then send for real ------------------------ */
    await editBlockText(page, blockById(page, 'home-heading'), 'Bread worth the walk')

    await blockById(page, 'home-blurb').click()
    await page.getByTestId('side-panel-tab-block').click()
    await page.getByTestId('copy-description').fill('A warm two-sentence welcome for a family bakery')
    await page.getByTestId('copy-description').blur()

    await openSubmit(page)
    const captured = await capturePackage(page, async () => {
      await sendButton(page).click()
    })

    /* -------- §1: the filename and the exact entry list --------------------- */
    expect(captured.suggestedFilename).toMatch(FILENAME_PATTERN)
    expect(captured.suggestedFilename).toBe('blueprint_bluebird-bakery_' + captured.suggestedFilename.slice(-12))

    const siteJsonText = readEntry(captured.path, 'site.json')
    const site = JSON.parse(siteJsonText) as SiteJsonShape

    expect(captured.entries).toEqual(expectedEntries(site))

    // The uploaded photo reached the archive as a real staged file (F2): one
    // asset, numbered and named by §4.6, and its bytes are in the zip. The path
    // is read off `site.json` rather than hard-coded because the extension
    // follows whatever MIME the engine's own encoder produced on ingest.
    expect(site.assets).toHaveLength(1)
    const assetPath = site.assets[0]?.path ?? ''
    expect(assetPath).toMatch(/^assets\/img_001\.(jpg|png|webp)$/)
    expect(entryBytes(captured.path, assetPath).length).toBeGreaterThan(0)

    expect(captured.entries).toEqual([
      'site.json',
      'brief.md',
      'pages/01-home.png',
      'pages/02-contact.png',
      assetPath,
    ])
    expect(captured.entries.some((entry) => entry.includes('\\') || entry.startsWith('./'))).toBe(false)

    /* -------- §1 file conventions, on the shipped bytes --------------------- */
    expect(siteJsonText.startsWith('﻿')).toBe(false)
    expect(siteJsonText).not.toContain('\r')
    expect(`${JSON.stringify(JSON.parse(siteJsonText), null, 2)}\n`).toBe(siteJsonText)

    /* -------- the UUID is stamped in all three places ----------------------- */
    const uuid8 = site.submission.id.replace(/-/g, '').slice(0, 8)
    expect(captured.suggestedFilename).toContain(uuid8)
    expect(readEntry(captured.path, 'brief.md')).toContain(`submission ${site.submission.id}`)
    await expect(page.getByTestId('submit-uuid')).toHaveText(uuid8)

    /* -------- THE STAGE 3 DoD: the external gate exits 0 -------------------- */
    const gate = runPackageGate(captured.path)
    expect(gate.status, gate.output).toBe(0)
    expect(gate.output).toContain('GATE PASSED')

    // Negative control: an extra entry must make the same gate fail on V12.
    const polluted = runPackageGate(withExtraEntry(captured.path, 'notes.txt', 'hello'))
    expect(polluted.status).not.toBe(0)
    expect(polluted.output).toContain('V12')

    /* -------- the completion screen ----------------------------------------- */
    await expect(page.getByTestId('submit-complete')).toBeVisible()
    await expect(page.getByTestId('submit-filename')).toHaveText(captured.suggestedFilename)
    await expect(page.getByTestId('submit-size')).toContainText(
      `~${String(Math.round(captured.sizeBytes / BYTES_PER_KB))} KB`,
    )

    const mailto = page.getByTestId('submit-mailto')
    const href = await mailto.getAttribute('href')
    expect(href?.startsWith('mailto:')).toBe(true)
    expect(decodeURIComponent(href ?? '')).toContain(uuid8)
    expect(decodeURIComponent(href ?? '')).toContain(captured.suggestedFilename)

    // The address is copyable, and always readable in the visible fallback.
    const address = page.getByTestId('submit-address')
    await expect(address).toHaveValue(/@/)
    await page.getByTestId('submit-copy-address').click()

    // The relay stub NEVER claims an email was sent.
    await expect(page.getByTestId('submit-relay-note')).toBeHidden()
    await expect(page.getByTestId('submit-complete')).toContainText('stays saved here')

    /* -------- the WARNs shipped rather than blocked -------------------------- */
    const warnings = page.getByTestId('submit-warning')
    await expect(warnings.filter({ hasText: 'Nothing links to "Contact"' })).toBeVisible()
    await expect(warnings.filter({ hasText: 'template placeholder text' })).toBeVisible()

    /* -------- "download it again" re-issues the SAME package ---------------- */
    const again = await capturePackage(page, async () => {
      await page.getByTestId('submit-download-again').click()
    })
    expect(again.suggestedFilename).toBe(captured.suggestedFilename)
    expect(again.sizeBytes).toBe(captured.sizeBytes)
  })
})

test.describe('the honeypot', () => {
  test('refuses a filled decoy and still hands over the address', async ({ page }) => {
    await openCanvas(page)
    await seedSubmitDesign(page, { businessName: BUSINESS, pages: submitFixturePages() })
    await openSubmit(page)
    await fillLead(page, CLIENT)

    await fillHoneypot(page, 'https://buy-cheap-things.example')

    let downloaded = false
    page.on('download', () => {
      downloaded = true
    })
    await sendButton(page).click()

    const refusal = page.getByTestId('submit-refusal')
    await expect(refusal).toBeVisible()
    await expect(refusal).toHaveAttribute('role', 'alert')
    await expect(refusal).toContainText('@')
    expect(downloaded).toBe(false)
  })

  test('is never touched by a normal client run', async ({ page }) => {
    await openCanvas(page)
    await seedSubmitDesign(page, { businessName: BUSINESS, pages: submitFixturePages() })
    await openSubmit(page)
    await fillLead(page, CLIENT)

    // Untouched, unfocusable, and pushed off-screen — protocol §1.4 rule 4. It
    // is deliberately NOT `display: none`: a bot that skips hidden inputs is
    // exactly the bot this decoy is for.
    const honeypot = page.getByTestId('submit-honeypot')
    await expect(honeypot).toHaveValue('')
    await expect(honeypot).toHaveAttribute('tabindex', '-1')
    await expect(honeypot).toHaveAttribute('aria-hidden', 'true')
    expect((await honeypot.boundingBox())?.x ?? 0).toBeLessThan(0)

    // Tabbing through the form never lands in it.
    await page.getByTestId('submit-client-name').focus()
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('Tab')
      expect(await honeypot.evaluate((element) => element === document.activeElement)).toBe(false)
    }
  })
})

test.describe('failure paths', () => {
  test('a failing relay changes nothing the client sees', async ({ page }) => {
    await openCanvasWithStub(page, 'relay-fail')
    await seedSubmitDesign(page, { businessName: BUSINESS, pages: submitFixturePages() })

    await openSubmit(page)
    await fillLead(page, CLIENT)

    const captured = await capturePackage(page, async () => {
      await sendButton(page).click()
    })

    await expect(page.getByTestId('submit-complete')).toBeVisible()
    await expect(page.getByTestId('submit-filename')).toHaveText(captured.suggestedFilename)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(runPackageGate(captured.path).status).toBe(0)
  })

  test('a renderer failure surfaces the typed error and offers a retry', async ({ page }) => {
    await openCanvasWithStub(page, 'render-fail')
    await seedSubmitDesign(page, { businessName: BUSINESS, pages: submitFixturePages() })

    await openSubmit(page)
    await fillLead(page, CLIENT)

    let downloaded = false
    page.on('download', () => {
      downloaded = true
    })
    await sendButton(page).click()

    await expect(page.getByTestId('submit-render-failed')).toBeVisible()
    await expect(page.getByTestId('submit-render-failed')).toContainText('hiccup')
    await expect(page.getByTestId('submit-retry')).toBeVisible()
    // All-or-nothing: no half package is offered as a consolation prize.
    await expect(page.getByTestId('submit-download-again')).toBeHidden()
    expect(downloaded).toBe(false)
  })
})

test.describe('the business name commits the way a client commits it', () => {
  /**
   * The journey test blurs the field explicitly, which is a TEST convenience — a
   * real client types and goes straight for the button. The business name is a
   * committed field (one store write, one undo step), so "did the click's own
   * blur commit it?" is a real question and it is the difference between a
   * working submit and a form that refuses a name the client can see in the box.
   * No explicit blur here on purpose. Uses the blockers fixture so the assertion
   * costs no page renders: getting as far as the BLOCK screen already proves the
   * form gate was satisfied.
   */
  test('typing it and clicking Send is enough — no blur of our own', async ({ page }) => {
    await openCanvas(page)
    await seedSubmitDesign(page, { pages: submitFixturePages({ withBlockers: true }) })
    await openSubmit(page)

    await page.getByTestId('submit-client-name').click()
    await page.keyboard.type(CLIENT.name)
    await page.getByTestId('submit-client-email').click()
    await page.keyboard.type(CLIENT.email)
    await page.getByTestId('submit-business-name').click()
    await page.keyboard.type(BUSINESS)

    await sendButton(page).click()

    await expect(page.getByTestId('submit-error-businessName')).toHaveCount(0)
    await expect(page.getByTestId('submit-view')).toHaveAttribute('data-screen', 'blocked')
  })
})

test.describe('no nagging before the send', () => {
  test('an untouched form carries no alerts at all', async ({ page }) => {
    await openCanvas(page)
    await seedSubmitDesign(page, { pages: submitFixturePages() })
    await openSubmit(page)

    await expect(page.getByRole('alert')).toHaveCount(0)

    await sendButton(page).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
  })
})
