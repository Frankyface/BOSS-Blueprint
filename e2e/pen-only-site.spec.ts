import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { attachPageScreenshot, blocks, openCanvas, readDocument } from './support/canvas.ts'
import type { StoredStroke } from './support/canvas.ts'
import { expectedPageHeight, luma, PAGE_WIDTH, readIhdr, samplePixels } from './support/exportPng.ts'
import {
  drawStroke,
  pageHeight,
  putPenAway,
  readStrokes,
  scribbleAt,
  scrollCanvasTo,
  strokes,
  usePen,
} from './support/media.ts'
import {
  capturePackage,
  entryBytes,
  expectedEntries,
  fillLead,
  openSubmit,
  readEntry,
  runPackageGate,
  sendButton,
} from './support/submit.ts'

/**
 * THE HEADLINE CLAIM, END TO END — "you should be able to build a site just from the
 * pen alone, with no blocks".
 *
 * Until this release the case was IMPOSSIBLE: `v09EmptySite` BLOCKed a homepage that
 * carried no non-`section` BLOCK, so a client who drew their whole site could not get
 * it out of the browser at all. Everything that proved the fix was a bench test of a
 * rule function; nothing drove the real Send button on a page drawn with the pen.
 * This is that journey, and it is the V9 regression guard: if the block requirement
 * ever comes back, the first test stops on the BLOCK screen and never downloads.
 *
 * Drawn the way a client draws, through `support/media.ts`, which is also the reason
 * the ink is drawn rather than seeded: the pen layer calls `setPointerCapture`, which
 * throws on a synthetic pointer id, so those helpers' real mouse input is the only
 * input that exercises the layer at all.
 *
 * The package assertions are DERIVED FROM THE SHIPPED BYTES, never from a list
 * written here — the BUILD-THIS-FROM-INK count is compared against the top-level
 * regions the package's own `site.json` carries, so the test cannot pass by agreeing
 * with a classifier that changed its mind about a shape.
 */

const CLIENT = { name: 'Dana Whitfield', email: 'dana@bluebirdbakery.ca' }
const BUSINESS = 'Bluebird Bakery'

/**
 * §3.3 rule 2's counted marker, RESTATED rather than imported: the E2E project
 * compiles under `tsconfig.e2e.json`, whose `include` is `e2e/**` only. Anchored to a
 * bullet exactly as V30 anchors it, so boilerplate that merely names the marker is
 * not counted.
 */
const BUILD_FROM_INK_RE = /^[ \t]*- \*\*[^\n]*?\*\*BUILD THIS FROM INK\*\*/gm

/** §3.2 — the two lines a pen-only page's brief must carry, verbatim. */
const PEN_ONLY_SENTENCE = 'This page has no blocks — the client drew it instead.'
const INK_SECTION_HEADER = '**What the client drew on this page** — build every one of these:'

/** The page the editor gives a client who has drawn nothing yet. */
const EMPTY_PAGE_HEIGHT = 1600
/** One press of "Add space". */
const SPACE_STEP = 400

/** The two luma gates `e2e/export-png.spec.ts` already probes a render with. */
const INK_LUMA_MAX = 200
const PAPER_LUMA_MIN = 240

/* ------------------------------------------------------------------------- */
/* The drawing                                                                */
/* ------------------------------------------------------------------------- */

interface Point {
  readonly x: number
  readonly y: number
}

/** A hand-drawn card, comfortably past the size at which a shape is a letter. */
const BOX = { x: 200, y: 220, w: 380, h: 240 } as const
/** How far short of its own start the trace stops — the corner gap a hand leaves. */
const BOX_GAP_PX = 24

/** A handwritten word: four "V" glyphs on one baseline, above everything else. */
const WORD = { x: 140, y: 90, glyphHeight: 44, glyphWidth: 22, pitch: 34, count: 4 } as const

/** The long horizontal rule — and, being dead straight, the PNG's ink probe. */
const RULE = { y: 560, from: 120, to: 1080 } as const

/** The mark drawn down in the room "Add space" adds, in the second test. */
const LOW_RULE = { y: 1740, from: 200, to: 900 } as const

/** Eight pen-downs: four glyphs, the box, two lines inside it, and the rule. */
const STROKE_COUNT = WORD.count + 4

/** A rectangle traced corner to corner, stopping `BOX_GAP_PX` short of the start. */
function drawnBoxPath(): Point[] {
  const { x, y, w, h } = BOX
  return [
    { x, y },
    { x: x + w / 2, y },
    { x: x + w, y },
    { x: x + w, y: y + h / 2 },
    { x: x + w, y: y + h },
    { x: x + w / 2, y: y + h },
    { x, y: y + h },
    { x, y: y + h / 2 },
    { x, y: y + BOX_GAP_PX },
  ]
}

/** A squiggled line inside the box — a client's stand-in for a line of body copy. */
function bodyLineInBox(row: number): Point[] {
  const left = BOX.x + 40
  const top = BOX.y + 90 + row * 50
  return [
    { x: left, y: top },
    { x: left + 60, y: top + 12 },
    { x: left + 130, y: top - 10 },
    { x: left + 200, y: top + 10 },
    { x: left + 260, y: top },
  ]
}

/**
 * One glyph of printed handwriting: a "V", drawn as its own pen-down.
 *
 * The shape matters less than the statistics the classifier reads — many small
 * strokes, each a small fraction of the word's width, with level bottoms.
 */
function glyphStroke(index: number): Point[] {
  const left = WORD.x + index * WORD.pitch
  return [
    { x: left, y: WORD.y },
    { x: left + WORD.glyphWidth / 2, y: WORD.y + WORD.glyphHeight },
    { x: left + WORD.glyphWidth, y: WORD.y },
  ]
}

function straightRule(rule: { y: number; from: number; to: number }): Point[] {
  return [
    { x: rule.from, y: rule.y },
    { x: rule.to, y: rule.y },
  ]
}

/**
 * THE WHOLE SITE, by hand: a word, a card with two lines of copy in it, and a rule
 * across the page. Not one block.
 *
 * The rule is drawn last and with the BOLD nib on purpose. It is the page's ink
 * probe, and `perfect-freehand` streamlines and smooths every path — so a scribble's
 * rendered outline does not pass through its own recorded points, and a pixel aimed
 * at one would miss the ink it went looking for. On a dead-straight run the smoothed
 * path IS the line, and a 12px nib leaves no doubt which pixel row it landed on.
 */
async function drawTheWholePage(page: Page): Promise<void> {
  await usePen(page, 'draw')

  for (let index = 0; index < WORD.count; index += 1) {
    await drawStroke(page, glyphStroke(index))
  }
  await drawStroke(page, drawnBoxPath())
  await drawStroke(page, bodyLineInBox(0))
  await drawStroke(page, bodyLineInBox(1))

  await page.getByTestId('pen-width-bold').click()
  await drawStroke(page, straightRule(RULE))

  await expect(strokes(page)).toHaveCount(STROKE_COUNT)
  await putPenAway(page)
}

/* ------------------------------------------------------------------------- */
/* Reading the package                                                        */
/* ------------------------------------------------------------------------- */

/**
 * §2.2/§2.5 of the export contract, restated for the same reason the marker regex
 * is. Only the fields this spec asserts on are named, and the shape stays assignable
 * to `SiteJsonShape` so the shared `expectedEntries` still applies to it.
 */
interface PackagedRegion {
  id: string
  kind: string
  parentRegionId: string | null
  setId: string | null
  bbox: { x: number; y: number; w: number; h: number }
  strokeIds: string[]
}

/** §2.4 — an exported stroke's points are `[x, y]` PAIRS, not `{x, y}` objects. */
interface PackagedStroke {
  id: string
  points: [number, number][]
}

interface PackagedPage {
  id: string
  name: string
  slug: string
  height: number
  extraBottomPx?: number
  screenshot: string
  blocks: unknown[]
  penStrokes: PackagedStroke[]
  penRegions?: PackagedRegion[]
}

interface PackagedSite {
  submission: { id: string; client: { name: string; email: string }; appVersion: string }
  siteSettings: { businessName: string }
  pages: PackagedPage[]
  assets: { id: string; path: string }[]
}

function topLevel(page: PackagedPage): PackagedRegion[] {
  return (page.penRegions ?? []).filter((region) => region.parentRegionId === null)
}

function countMarkers(brief: string): number {
  return (brief.match(new RegExp(BUILD_FROM_INK_RE.source, BUILD_FROM_INK_RE.flags)) ?? []).length
}

/** The lowest point of one exported stroke, in page pixels. */
function bottomOf(stroke: PackagedStroke): number {
  return stroke.points.reduce((low, point) => Math.max(low, point[1]), 0)
}

interface Probe {
  readonly onInk: number
  readonly onPaper: number
}

/**
 * Sample THE PAGE PNG THE ZIP SHIPS at a straight stroke, and again on clear paper.
 *
 * A COLUMN of rows rather than one, darkest taken: the recorded y of a mouse-drawn
 * line can sit a fraction off a pixel row, and the question being asked is "did this
 * stroke paint here at all", not "which of three rows holds its exact centre".
 */
async function probePng(
  page: Page,
  bytes: Uint8Array,
  stroke: StoredStroke,
  clearY: number,
): Promise<Probe> {
  const xs = stroke.points.map((point) => point.x)
  const ys = stroke.points.map((point) => point.y)
  const x = Math.round((Math.min(...xs) + Math.max(...xs)) / 2)
  const y = Math.round(ys.reduce((total, value) => total + value, 0) / ys.length)

  const [above, on, below, paper] = await samplePixels(
    page,
    Buffer.from(bytes).toString('base64'),
    [
      { x, y: y - 1 },
      { x, y },
      { x, y: y + 1 },
      { x, y: clearY },
    ],
  )

  if (!above || !on || !below || !paper) throw new Error('the exported PNG would not sample')
  return { onInk: Math.min(luma(above), luma(on), luma(below)), onPaper: luma(paper) }
}

/**
 * Bring a page coordinate roughly into the middle of the canvas viewport.
 *
 * Derived from the page's own live placement rather than a fixed scroll offset: the
 * toolbar wraps at some widths and the visible band moves with it, and a mouse move
 * outside the visible canvas lands nowhere at all.
 */
async function scrollToPageY(page: Page, y: number): Promise<void> {
  const scale = Number(await page.getByTestId('canvas-page').getAttribute('data-page-scale')) || 1
  const viewport = await page.getByTestId('canvas-viewport').boundingBox()
  const target = Math.round(y * scale - (viewport?.height ?? 0) / 2)
  if (target > 0) await scrollCanvasTo(page, target)
}

/** The real submit flow, driven to completion, with the shipped bytes handed back. */
async function sendIt(page: Page): Promise<{ site: PackagedSite; zip: string; entries: string[] }> {
  await openSubmit(page)
  await fillLead(page, { ...CLIENT, business: BUSINESS })

  const captured = await capturePackage(page, async () => {
    await sendButton(page).click()
  })

  // Reaching a download AT ALL is the V9 regression guard: before this release the
  // journey ended on the BLOCK screen with "your home page is empty".
  await expect(page.getByTestId('submit-complete')).toBeVisible()
  await expect(page.getByTestId('submit-filename')).toHaveText(captured.suggestedFilename)

  const site = JSON.parse(readEntry(captured.path, 'site.json')) as PackagedSite
  expect(captured.entries).toEqual(expectedEntries(site))

  return { site, zip: captured.path, entries: captured.entries }
}

/* ------------------------------------------------------------------------- */

test.describe('a site drawn with the pen alone', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
    // The premise of the whole spec: a blank page, and it stays blockless.
    await expect(blocks(page)).toHaveCount(0)
  })

  test('submits, and ships the ink as buildable content in the package', async ({ page }) => {
    test.slow()

    await drawTheWholePage(page)

    const design = await readDocument(page)
    expect(design.pages).toHaveLength(1)
    expect(design.pages[0]?.blocks).toHaveLength(0)
    await attachPageScreenshot(page, 'pen-only-page')

    const { site, zip, entries } = await sendIt(page)

    /* -------- it really is a site with no blocks in it ---------------------- */
    expect(site.pages).toHaveLength(1)
    const home = site.pages[0]
    expect(home).toBeDefined()
    if (!home) return
    expect(home.blocks).toHaveLength(0)
    expect(home.penStrokes).toHaveLength(STROKE_COUNT)
    expect(entries).toEqual(['site.json', 'brief.md', home.screenshot])

    /* -------- §2.5: the ink reached `site.json` AS READ CONTENT ------------- */
    expect(home.penRegions, 'a page drawn by hand must carry penRegions').toBeDefined()
    const regions = home.penRegions ?? []
    expect(regions.length).toBeGreaterThan(0)
    expect(
      regions.map((region) => region.kind),
      'the drawn box must reach the builder as a panel',
    ).toContain('panel')

    const top = topLevel(home)
    expect(top.length).toBeGreaterThan(0)

    // The reading itself, attached as evidence: which shapes the classifier found in
    // the client's hand-drawn page is exactly what a verification log wants to show.
    await test.info().attach('pen-only-reading.txt', {
      body: regions
        .map(
          (region) =>
            `${region.id} ${region.kind} ${JSON.stringify(region.bbox)}` +
            `${region.parentRegionId === null ? ' [top level]' : ` [inside ${region.parentRegionId}]`}`,
        )
        .join('\n'),
      contentType: 'text/plain',
    })

    // Every region cites ink that is really in this package — the premise §3.3 rule 5
    // rests on, checked against the shipped `penStrokes` rather than assumed.
    const strokeIds = new Set(home.penStrokes.map((stroke) => stroke.id))
    for (const region of regions) {
      expect(region.strokeIds.length).toBeGreaterThan(0)
      for (const id of region.strokeIds) expect(strokeIds.has(id)).toBe(true)
    }

    /* -------- §3.2 / V30: brief.md tells the builder to BUILD it ------------ */
    const brief = readEntry(zip, 'brief.md')
    expect(
      countMarkers(brief),
      `one BUILD THIS FROM INK per top-level region (${String(top.length)})`,
    ).toBe(top.length)
    expect(brief).toContain(PEN_ONLY_SENTENCE)
    expect(brief).toContain(INK_SECTION_HEADER)
    // …and each top-level bullet points at the ink it is asking for by id.
    for (const region of top) expect(brief).toContain(`\`${region.strokeIds[0] ?? ''}\``)

    /* -------- §4.3: the page PNG is not a blank sheet ----------------------- */
    const png = entryBytes(zip, home.screenshot)
    expect(readIhdr(Buffer.from(png))).toEqual({ width: PAGE_WIDTH, height: home.height })

    const drawn = await readStrokes(page)
    const rule = drawn[drawn.length - 1]
    expect(rule, 'the rule should be the last stroke drawn').toBeDefined()
    if (!rule) return

    const probe = await probePng(page, png, rule, RULE.y + 400)
    expect(probe.onInk, 'the drawn rule should be dark ink in the exported PNG').toBeLessThan(
      INK_LUMA_MAX,
    )
    expect(probe.onPaper, 'clear paper below it should still be white').toBeGreaterThan(
      PAPER_LUMA_MIN,
    )

    /* -------- and a zero-context session could build the result ------------- */
    const gate = runPackageGate(zip)
    expect(gate.status, gate.output).toBe(0)
    expect(gate.output).toContain('GATE PASSED')
  })

  /**
   * GAP #1 MEETS THE PEN-ONLY PAGE. `e2e/page-space.spec.ts` covers the editor side
   * of "add room, draw in it, trim it back"; nothing carried that room through a
   * SUBMIT, and a pen-only page is the one page whose entire height comes from ink.
   */
  test('carries the space the client added — and the mark drawn in it — into the package', async ({
    page,
  }) => {
    test.slow()

    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT)

    await usePen(page, 'draw')
    await drawStroke(page, scribbleAt(200, 300))
    await putPenAway(page)

    await page.getByTestId('page-space-add').click()
    await page.getByTestId('page-space-add').click()
    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT + SPACE_STEP * 2)

    // Draw BELOW where the page used to end — there was nowhere to put this before.
    await scrollToPageY(page, LOW_RULE.y)
    await usePen(page, 'draw')
    await page.getByTestId('pen-width-bold').click()
    await drawStroke(page, straightRule(LOW_RULE))
    await expect(strokes(page)).toHaveCount(2)
    await putPenAway(page)

    const stored = (await readDocument(page)).pages[0]
    expect(stored?.extraBottomPx).toBe(SPACE_STEP * 2)
    expect(stored?.blocks).toHaveLength(0)
    if (!stored) return

    const { site, zip } = await sendIt(page)
    const home = site.pages[0]
    expect(home).toBeDefined()
    if (!home) return

    /* -------- the room is design intent in the package, not an accident ----- */
    expect(home.blocks).toHaveLength(0)
    expect(home.extraBottomPx).toBe(SPACE_STEP * 2)
    // `expectedPageHeight` is `support/exportPng.ts`'s independent restatement of §4.2.
    expect(home.height).toBe(expectedPageHeight(stored))
    expect(home.height).toBeGreaterThan(EMPTY_PAGE_HEIGHT + SPACE_STEP * 2)

    /* -------- the mark drawn down there survived the round trip ------------- */
    const low = home.penStrokes.filter((stroke) => bottomOf(stroke) > EMPTY_PAGE_HEIGHT)
    expect(low, 'the mark drawn in the added room should be in site.json').toHaveLength(1)
    expect(bottomOf(low[0] ?? { id: '', points: [] })).toBeGreaterThan(LOW_RULE.y - 8)

    /* -------- …and it is ON the exported sheet, not off the bottom of it ---- */
    const png = entryBytes(zip, home.screenshot)
    expect(readIhdr(Buffer.from(png))).toEqual({ width: PAGE_WIDTH, height: home.height })

    const drawn = await readStrokes(page)
    const rule = drawn[drawn.length - 1]
    expect(rule).toBeDefined()
    if (!rule) return

    const probe = await probePng(page, png, rule, LOW_RULE.y - 300)
    expect(probe.onInk, 'the mark in the added room should be ink in the PNG').toBeLessThan(
      INK_LUMA_MAX,
    )
    expect(probe.onPaper, 'the page above it should still be white').toBeGreaterThan(PAPER_LUMA_MIN)

    const gate = runPackageGate(zip)
    expect(gate.status, gate.output).toBe(0)
  })
})
