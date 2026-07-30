import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Browser, BrowserType, Page, TestInfo } from '@playwright/test'
import { chromium, expect, firefox, test, webkit } from '@playwright/test'

import type { StoredPage } from './support/canvas.ts'
import { openCanvas } from './support/canvas.ts'
import type { FillProbe, FillRole, Rect, SampledPixel } from './support/exportPng.ts'
import {
  exportFixturePages,
  expectedPageHeight,
  makePhotoDataUrl,
  PAGE_WIDTH,
  renderOrFail,
  samplePixels,
  seedDesign,
  solidFillProbes,
  waitForRenderBridge,
} from './support/exportPng.ts'

/**
 * VISUAL REGRESSION ON THE EXPORTED ARTIFACT — day-one, binding
 * (`docs/decisions.md` 2026-07-27, debate #1).
 *
 * The screenshot is taken of the DECODED PNG loaded back into a blank page, not
 * of the live editor: that is what makes this a test of the export path rather
 * than of the canvas. Two axes, because either alone has a blind spot:
 *
 *  1. PER ENGINE, against its own committed baseline — Chromium, Firefox and
 *     WebKit legitimately differ on font hinting and anti-aliasing, so one shared
 *     baseline would either be too loose to catch anything or permanently red.
 *     Playwright suffixes the file with the project and platform for us; a
 *     missing baseline fails loudly rather than passing silently.
 *  2. CROSS ENGINE, which no per-engine baseline can give: the three engines
 *     agree on the exact dimensions, and their ink ratios sit inside a named
 *     band of each other. This is the assertion that catches "WebKit rendered
 *     half the page" on the very first run.
 */

test.slow(({ browserName }) => browserName === 'webkit')

/** Room for anti-aliasing drift inside one engine, not for a missing block. */
const MAX_DIFF_PIXEL_RATIO = 0.02

/**
 * Cross-engine ink band, as a fraction of the median.
 *
 * MEASURED, not guessed: on the content-rich fixture pages the three engines
 * land within ~1.5% of each other (home 0.2812 / 0.2794 / 0.2772, gallery 0.0731
 * / 0.0719 / 0.0718). The band is set an order of magnitude wider so hinting
 * changes never flake it, and still an order of magnitude tighter than any real
 * "half the page is missing" failure.
 */
const INK_TOLERANCE = 0.25

/**
 * Sparse pages are excluded from the ink band on purpose: when a page is almost
 * all paper, nearly all of its ink is anti-aliased glyph edges, and the engines
 * legitimately differ by a third there (clip-control measured 0.0047 / 0.0036 /
 * 0.0036). Below this floor the blank gate is the check that matters.
 */
const INK_BAND_FLOOR = 0.01

/** The pages the cross-engine comparison uses — the ones with real content on them. */
const COMPARED_PAGES = ['page-home', 'page-gallery'] as const

async function seedAndOpen(page: Page): Promise<void> {
  await openCanvas(page)
  await waitForRenderBridge(page)
  await seedDesign(page, exportFixturePages(await makePhotoDataUrl(page)))
}

/** Put the exported bytes back on screen, at natural size, on a blank white page. */
async function showExportedPng(page: Page, base64: string, size: { width: number; height: number }) {
  await page.setContent(
    `<body style="margin:0;background:#fff">` +
      `<img id="exported" width="${String(size.width)}" height="${String(size.height)}" ` +
      `style="display:block" src="data:image/png;base64,${base64}">` +
      `</body>`,
  )

  const image = page.locator('#exported')
  await expect(image).toBeVisible()
  return image
}

/** Where Playwright keeps this spec's baselines, and how it names them. */
const SNAPSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'export-visual.spec.ts-snapshots')

const baselineFileFor = (name: string, browserName: string): string =>
  join(SNAPSHOT_DIR, `${name}-${browserName}-${process.platform}.png`)

/**
 * SKIP, LOUDLY, WHEN THIS DEVELOPER'S PLATFORM HAS NO BASELINE YET — BUT NEVER
 * IN CI.
 *
 * A per-engine baseline is a screenshot of one operating system's font
 * rasterisation, so `win32` bytes can never stand in for `linux` bytes: the
 * files can only be produced on the platform that will be compared against
 * them. `win32` and `linux` are both committed. A third platform (a contributor
 * on macOS) has none, and Playwright's default `updateSnapshots: 'missing'`
 * would write one and FAIL that run — turning "your OS is not baselined yet"
 * into what looks like a visual regression.
 *
 * So off CI the comparison is skipped, with an annotation and a warning loud
 * enough that it cannot rot unnoticed.
 *
 * IN CI IT IS A HARD FAILURE, on purpose. CI runs ubuntu and ubuntu baselines
 * exist, so the only ways to reach this branch there are a deleted baseline or a
 * new engine added without one — and both must go red rather than quietly
 * skipping the regression check that is the whole point of the spec.
 *
 * PRODUCING BASELINES for a new platform is a one-click job: run the
 * `update-visual-baselines` workflow (`.github/workflows/deploy.yml`) on a
 * runner of that platform, download its artifact, commit the files. That job
 * passes `--update-snapshots=all`, which is exactly the case this gate must NOT
 * skip — otherwise the job that exists to create baselines could never create
 * them.
 *
 * A baseline that EXISTS and does not match is a hard failure everywhere.
 */
function skipWithoutBaseline(testInfo: TestInfo, name: string, browserName: string): void {
  const isUpdatingRun =
    testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed'
  if (isUpdatingRun || existsSync(baselineFileFor(name, browserName))) return

  // In CI a missing baseline is a real defect, not an unbaselined workstation.
  if (process.env.CI) return

  const missing = `${name}-${browserName}-${process.platform}.png`
  const detail =
    `No ${process.platform} baseline for ${missing}. Visual comparison SKIPPED — ` +
    'run the update-visual-baselines workflow and commit its artifact.'

  testInfo.annotations.push({ type: 'missing-visual-baseline', description: detail })
  // GitHub Actions workflow command: puts the skip in the run summary, not just the log.
  console.warn(`::warning title=Missing visual baseline::${detail}`)

  test.skip(true, detail)
}

test.describe('per-engine visual baselines', () => {
  test('the home page export matches this engine’s baseline', async ({ page, browserName }, testInfo) => {
    skipWithoutBaseline(testInfo, 'export-home', browserName)
    await seedAndOpen(page)
    const result = await renderOrFail(page, 'page-home')

    const image = await showExportedPng(page, result.base64, result)
    await expect(image).toHaveScreenshot('export-home.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    })
  })

  test('the gallery page export matches this engine’s baseline', async ({ page, browserName }, testInfo) => {
    skipWithoutBaseline(testInfo, 'export-gallery', browserName)
    await seedAndOpen(page)
    const result = await renderOrFail(page, 'page-gallery')

    const image = await showExportedPng(page, result.base64, result)
    await expect(image).toHaveScreenshot('export-gallery.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    })
  })
})

interface EngineReading {
  engine: string
  pageId: string
  width: number
  height: number
  inkRatio: number
}

async function readEngine(
  type: BrowserType,
  name: string,
  baseURL: string,
): Promise<EngineReading[]> {
  let browser: Browser | null = null

  try {
    browser = await type.launch()
    const context = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1000 } })
    const page = await context.newPage()
    await seedAndOpen(page)

    const readings: EngineReading[] = []
    for (const pageId of COMPARED_PAGES) {
      const result = await renderOrFail(page, pageId)
      readings.push({ engine: name, pageId, width: result.width, height: result.height, inkRatio: result.inkRatio })
    }

    await context.close()
    return readings
  } finally {
    await browser?.close()
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

test.describe('cross-engine agreement', () => {
  // Drives all three engines itself, so it must run exactly once rather than
  // once per project. Chromium is simply the cheapest host for it.
  test.skip(({ browserName }) => browserName !== 'chromium', 'runs once; it launches all three engines')
  test.setTimeout(300_000)

  test('chromium, firefox and webkit agree on size, and on how much ink is there', async ({
    baseURL,
  }, testInfo) => {
    expect(baseURL, 'the E2E config must supply a baseURL').toBeTruthy()

    // SEQUENTIALLY, not `Promise.all`. This test already runs alongside the rest
    // of the suite's workers; launching three more browsers at once was a
    // self-inflicted load spike, and under contention Playwright's 30s default
    // test timeout is what breaks first (reproduced at `--workers=14`, where
    // pre-existing autosave and pen-layer specs time out too). One extra browser
    // at a time costs a few seconds and removes the spike.
    const readings: EngineReading[] = []
    for (const [type, name] of [
      [chromium, 'chromium'],
      [firefox, 'firefox'],
      [webkit, 'webkit'],
    ] as const) {
      readings.push(...(await readEngine(type, name, baseURL ?? '')))
    }

    await testInfo.attach('export-ink.json', {
      body: JSON.stringify(readings, null, 2),
      contentType: 'application/json',
    })

    const fixture = exportFixturePages('')

    for (const pageId of COMPARED_PAGES) {
      const forPage = readings.filter((reading) => reading.pageId === pageId)
      expect(forPage, `${pageId} readings`).toHaveLength(3)

      const seeded = fixture.find((candidate) => candidate.id === pageId)
      expect(seeded).toBeDefined()
      if (!seeded) continue

      // DIMENSIONAL IDENTITY: not "close", identical, and equal to §4.2's answer.
      for (const reading of forPage) {
        expect(reading.width, `${pageId} width in ${reading.engine}`).toBe(PAGE_WIDTH)
        expect(reading.height, `${pageId} height in ${reading.engine}`).toBe(expectedPageHeight(seeded))
      }

      const ratios = forPage.map((reading) => reading.inkRatio)
      const middle = median(ratios)
      expect(middle, `${pageId} should be busy enough to compare`).toBeGreaterThan(INK_BAND_FLOOR)

      for (const reading of forPage) {
        const drift = Math.abs(reading.inkRatio - middle) / middle
        expect(
          drift,
          `${reading.engine} ink on ${pageId} is ${reading.inkRatio.toFixed(4)} against a median of ${middle.toFixed(4)}`,
        ).toBeLessThan(INK_TOLERANCE)
      }
    }
  })
})

/* ------------------------------------------------------------------------- */
/* Third axis: solid fills against the design tokens, with NO baseline        */
/* ------------------------------------------------------------------------- */

/**
 * WHY A SECOND MEASUREMENT AT ALL (`docs/decisions.md` 2026-07-30).
 *
 * The baselines above answer "does this still look like the picture we
 * committed", and they answer it with a RATIO — which is the only way to absorb
 * the font rasterisation that genuinely differs between win32 and linux. On the
 * v2.5 rebrand that ratio was blind in both directions at once: measured old vs
 * new `export-home-chromium-win32.png`, 23.099% of pixels differed AT ALL, but
 * only 0.756% cleared the per-pixel threshold against a 2.000% allowance. The
 * band shift (`#f2f5fa` → `#f2f8fc`) repainted a fifth of the page too subtly to
 * be counted; the button pill (amber → `#09679a`) was counted everywhere but is
 * under 1% of the page. Nothing in between gets measured, and the suite passed
 * a brand-wide colour change on all three engines.
 *
 * WHY THIS AXIS NEEDS NO BASELINE. A SOLID FILL IS THE SAME RGB ON EVERY
 * OPERATING SYSTEM. Glyph edges are not — that is the entire reason six `-win32`
 * and six `-linux` baselines exist. So this axis reads single pixels from the
 * MIDDLE of the fills and compares them to the design tokens themselves. There
 * is no reference image to be stale, missing on a new platform, or regenerated
 * by a workflow; a platform cannot move the answer, so the tolerance can be tiny
 * where the ratio's must stay large.
 */

/**
 * THE FILLS, RESTATED ONCE from `src/styles/theme.css` — the E2E project cannot
 * import `src/**` (`tsconfig.e2e.json` includes `e2e/**` only). Each entry names
 * the token it mirrors, and 'the restated fills still match the theme tokens'
 * below reads the stylesheet, follows the `var()` chain and fails if the two
 * ever drift — including a role repointed at a different token.
 */
const FILL_TOKENS: Record<FillRole, { token: string; hex: string }> = {
  /** `--boss-band` → `--boss-brand-tint`: Section bands and empty Image slots. */
  band: { token: '--boss-band', hex: '#f2f8fc' },
  /** `--boss-action` → `--boss-brand-dark`: the button pill (`BlockView.css`). */
  action: { token: '--boss-action', hex: '#09679a' },
  /** `--boss-ink`: the nav bar's near-black fill. */
  ink: { token: '--boss-ink', hex: '#0b1220' },
  /** `--boss-surface` — the same white as `src/export/png/constants.ts`'s `PAGE_BACKGROUND`. */
  paper: { token: '--boss-surface', hex: '#ffffff' },
}

/**
 * Per-channel slack, and it must stay SMALL to be worth having.
 *
 * The change this gate exists to catch is the subtle one: `#f2f5fa` → `#f2f8fc`
 * moves green by 3 and blue by 2, so anything above 2 would wave the rebrand
 * through exactly as the ratio did. PNG is lossless and a flat fill has no
 * anti-aliasing, so the honest reading is 0 on all three engines (measured:
 * every probe exact, chromium/firefox/webkit) — the 2 is headroom for a decode
 * rounding a channel, not an allowance for a different colour.
 */
const FILL_CHANNEL_TOLERANCE = 2

/** A probe must sit at least this far from a block edge or a text zone. */
const MIN_CLEARANCE_PX = 8

/** Conservative half-width of the paint a pen stroke lays around its points. */
const STROKE_KEEP_OUT_PX = 24

const OPAQUE_ALPHA = 255

/** The fixture page carrying a band, a nav bar, an empty slot and a pill. */
const FILL_PAGE_ID = 'page-home'

function fillFixturePage(): StoredPage {
  const found = exportFixturePages('').find((candidate) => candidate.id === FILL_PAGE_ID)
  if (!found) throw new Error(`the fixture no longer has "${FILL_PAGE_ID}"`)
  return found
}

/** Distance from a point to a rectangle; 0 when the point is inside it. */
function distanceToRect(point: { x: number; y: number }, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, point.x - (rect.x + rect.width), 0)
  const dy = Math.max(rect.y - point.y, point.y - (rect.y + rect.height), 0)
  return Math.hypot(dx, dy)
}

/** How far inside a rectangle a point sits; negative when it is outside. */
function clearanceInside(point: { x: number; y: number }, rect: Rect): number {
  return Math.min(
    point.x - rect.x,
    rect.x + rect.width - point.x,
    point.y - rect.y,
    rect.y + rect.height - point.y,
  )
}

/**
 * EVERY REASON A PROBE MIGHT NOT BE ON FLAT FILL, re-derived from the same
 * fixture the render came from: outside its own block, too near an edge or a
 * corner radius, under a block that paints later (blocks paint in array order),
 * inside a text zone, or in a pen stroke's way. This is what makes the derived
 * coordinates safe to move with the fixture — a block dragged over a probe fails
 * the suite instead of quietly turning it into a reading of the wrong thing.
 */
function probeFaults(page: StoredPage, probes: readonly FillProbe[]): string[] {
  const faults: string[] = []
  const at = (probe: FillProbe): string => `${probe.label} (${String(probe.x)},${String(probe.y)})`

  for (const probe of probes) {
    const point = { x: probe.x, y: probe.y }
    const ownerIndex = page.blocks.findIndex((block) => block.id === probe.blockId)

    if (probe.blockId !== null && ownerIndex < 0) {
      faults.push(`${at(probe)}: the fixture no longer has block "${probe.blockId}"`)
      continue
    }

    const owner = page.blocks[ownerIndex]
    if (owner) {
      const room = clearanceInside(point, owner)
      if (room < MIN_CLEARANCE_PX) faults.push(`${at(probe)}: ${room.toFixed(1)}px from ${owner.id}'s edge`)
    }

    page.blocks.forEach((block, index) => {
      if (index <= ownerIndex) return
      if (distanceToRect(point, block) < MIN_CLEARANCE_PX) {
        faults.push(`${at(probe)}: ${block.id} paints over it`)
      }
    })

    for (const zone of probe.avoid) {
      if (distanceToRect(point, zone) < MIN_CLEARANCE_PX) {
        faults.push(`${at(probe)}: inside a text zone, ${JSON.stringify(zone)}`)
      }
    }

    for (const stroke of page.penStrokes) {
      const xs = stroke.points.map((strokePoint) => strokePoint.x)
      const ys = stroke.points.map((strokePoint) => strokePoint.y)
      const keepOut = {
        x: Math.min(...xs) - STROKE_KEEP_OUT_PX,
        y: Math.min(...ys) - STROKE_KEEP_OUT_PX,
        width: Math.max(...xs) - Math.min(...xs) + STROKE_KEEP_OUT_PX * 2,
        height: Math.max(...ys) - Math.min(...ys) + STROKE_KEEP_OUT_PX * 2,
      }
      if (distanceToRect(point, keepOut) === 0) faults.push(`${at(probe)}: in ${stroke.id}'s way`)
    }
  }

  return faults
}

const HEX_RADIX = 16
const HEX_PAIR = 2

function hexOfPixel(pixel: SampledPixel): string {
  const pair = (value: number): string => value.toString(HEX_RADIX).padStart(HEX_PAIR, '0')
  return `#${pair(pixel.r)}${pair(pixel.g)}${pair(pixel.b)}`
}

/** The widest single-channel gap between a sampled pixel and a `#rrggbb` colour. */
function channelGap(pixel: SampledPixel, hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) throw new Error(`"${hex}" is not a #rrggbb colour`)

  const channel = (index: number): number => Number.parseInt(match[index] ?? '', HEX_RADIX)
  return Math.max(
    Math.abs(pixel.r - channel(1)),
    Math.abs(pixel.g - channel(2)),
    Math.abs(pixel.b - channel(3)),
  )
}

const THEME_CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'styles', 'theme.css')

/** `--boss-action` → `--boss-brand-dark` → `#09679a` is two hops; four is slack. */
const MAX_VAR_HOPS = 4

/** Every `--name: value` declared in the theme, comments stripped first. */
function themeDeclarations(): Map<string, string> {
  const css = readFileSync(THEME_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const declarations = new Map<string, string>()

  for (const [, name, value] of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    if (name && value) declarations.set(name, value.trim().toLowerCase())
  }

  return declarations
}

/** Follows `var(--x)` indirection, so repointing a role at another token is caught. */
function resolveToken(declarations: Map<string, string>, name: string): string {
  let current = name

  for (let hop = 0; hop <= MAX_VAR_HOPS; hop += 1) {
    const value = declarations.get(current)
    if (value === undefined) throw new Error(`${current} is not declared in src/styles/theme.css`)

    const indirect = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(value)
    if (!indirect?.[1]) return value
    current = indirect[1]
  }

  throw new Error(`the var() chain from ${name} does not resolve in ${String(MAX_VAR_HOPS)} hops`)
}

test.describe('solid fills, measured against the tokens', () => {
  test('the sample points sit on flat fill — not on text, an edge or a stroke', () => {
    const fixture = fillFixturePage()
    const probes = solidFillProbes(fixture, expectedPageHeight(fixture))

    const sampled = [...new Set(probes.map((probe) => probe.fill))].sort()
    expect(sampled, 'every fill role should be sampled').toEqual(Object.keys(FILL_TOKENS).sort())
    expect(probeFaults(fixture, probes), 'derived probe geometry').toEqual([])
  })

  test('the restated fills still match the theme tokens they mirror', () => {
    const declarations = themeDeclarations()

    for (const [role, mirror] of Object.entries(FILL_TOKENS)) {
      expect(
        resolveToken(declarations, mirror.token),
        `${mirror.token} (the "${role}" fill) drifted from this suite's copy of it`,
      ).toBe(mirror.hex)
    }
  })

  test('every solid fill in the exported PNG is exactly its design token', async ({
    page,
  }, testInfo) => {
    const fixture = fillFixturePage()
    const probes = solidFillProbes(fixture, expectedPageHeight(fixture))
    expect(probeFaults(fixture, probes), 'derived probe geometry').toEqual([])

    await seedAndOpen(page)
    const result = await renderOrFail(page, FILL_PAGE_ID)
    // The paper probe is derived from §4.2's height, so the render must agree.
    expect(result.height, 'the probes assume §4.2’s page height').toBe(expectedPageHeight(fixture))

    const pixels = await samplePixels(page, result.base64, probes)

    const readings = probes.map((probe, index) => {
      const pixel = pixels[index]
      return {
        probe: probe.label,
        at: [probe.x, probe.y],
        token: FILL_TOKENS[probe.fill].token,
        expected: FILL_TOKENS[probe.fill].hex,
        read: pixel ? hexOfPixel(pixel) : null,
        gap: pixel ? channelGap(pixel, FILL_TOKENS[probe.fill].hex) : null,
      }
    })

    await testInfo.attach('solid-fills.json', {
      body: JSON.stringify(readings, null, 2),
      contentType: 'application/json',
    })

    for (const [index, probe] of probes.entries()) {
      const pixel = pixels[index]
      expect(pixel, `${probe.label} was not sampled`).toBeDefined()
      if (!pixel) continue

      const { token, hex } = FILL_TOKENS[probe.fill]
      expect(pixel.a, `${probe.label} must be opaque`).toBe(OPAQUE_ALPHA)
      expect(
        channelGap(pixel, hex),
        `${probe.label} at ${String(probe.x)},${String(probe.y)} reads ${hexOfPixel(pixel)}; ` +
          `${token} is ${hex}`,
      ).toBeLessThanOrEqual(FILL_CHANNEL_TOLERANCE)
    }
  })
})
