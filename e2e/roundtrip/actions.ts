import { expect, type Locator, type Page } from '@playwright/test'

/**
 * SEG-1 — the client driver's vocabulary. Every function here is a USER-VISIBLE
 * AFFORDANCE and nothing else (R2.2).
 *
 * The bans are mechanical, not aspirational: `driver-purity.test.mjs` greps this whole
 * directory for the four in-page-script and state-injection APIs and fails if any of them
 * appears — which is why they are not spelled out here. So this file may NOT reuse
 * `e2e/support/`: `openCanvas` waits on the test-only store bridge, `makePhotoFixture`
 * builds its bytes by running script in the page, and `scrollCanvasTo` sets `scrollTop`
 * through the DOM. All three are perfectly good E2E tools and all three are disqualified
 * here, for the same reason the production bundle folds the bridge out: the client path
 * IS the product under test.
 *
 * Reading a value back with `getAttribute()` / `inputValue()` is not state injection and
 * is used freely — that is how the driver knows where a block ended up.
 */

/** R2.4 — placement tolerance, per edge, in page pixels. Mirrors `thresholds.mjs`. */
export const POSITION_TOLERANCE_PX = 24
const GRID_PX = 8
const MAX_PLACEMENT_HOPS = 8
/** Keep drag endpoints this far inside the visible band so nothing lands under chrome. */
const VISIBLE_PAD_PX = 48

export interface Frame {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export function frameOf(tuple: readonly number[]): Frame {
  return { x: tuple[0] ?? 0, y: tuple[1] ?? 0, w: tuple[2] ?? 0, h: tuple[3] ?? 0 }
}

/* ─────────────────────────── locators ─────────────────────────── */

export const canvasPage = (page: Page): Locator => page.getByTestId('canvas-page')
export const canvasViewport = (page: Page): Locator => page.getByTestId('canvas-viewport')
export const blockById = (page: Page, id: string): Locator =>
  page.locator(`[data-testid="canvas-block"][data-block-id="${id}"]`)
export const selectedBlock = (page: Page): Locator =>
  page.locator('[data-testid="canvas-block"][data-selected="true"]')

/* ─────────────────────────── geometry ─────────────────────────── */

interface Placement {
  readonly left: number
  readonly top: number
  readonly scale: number
  readonly viewport: { x: number; y: number; width: number; height: number }
}

/**
 * Where the virtual page sits on screen right now.
 *
 * At 1440×900 the fit scale is well under 1 (the page is 1200 wide and the editor keeps
 * a palette and a details panel beside it), so NOTHING may assume a 1:1 mouse-to-page
 * mapping. Every coordinate the driver uses goes through here.
 */
async function placement(page: Page): Promise<Placement> {
  const target = canvasPage(page)
  const box = await target.boundingBox()
  const viewport = await canvasViewport(page).boundingBox()
  if (!box || !viewport) throw new Error('the canvas has no bounding box yet')
  const scale = Number(await target.getAttribute('data-page-scale')) || 1
  return { left: box.x, top: box.y, scale, viewport }
}

function toClient(at: Placement, point: { x: number; y: number }): { x: number; y: number } {
  return { x: at.left + point.x * at.scale, y: at.top + point.y * at.scale }
}

/** The page-space band currently on screen. */
function visibleBand(at: Placement): { top: number; bottom: number } {
  return {
    top: (at.viewport.y - at.top) / at.scale,
    bottom: (at.viewport.y + at.viewport.height - at.top) / at.scale,
  }
}

/**
 * Scroll the canvas so `pageY` is comfortably on screen — with the wheel, over the
 * scroller, exactly as a client would. (Setting `scrollTop` through the DOM would be
 * simpler and would also be the one line that makes the purity grep a lie.)
 */
export async function ensureVisible(page: Page, pageY: number): Promise<void> {
  for (let attempt = 0; attempt < MAX_PLACEMENT_HOPS; attempt += 1) {
    const at = await placement(page)
    const band = visibleBand(at)
    const padded = { top: band.top + VISIBLE_PAD_PX, bottom: band.bottom - VISIBLE_PAD_PX }
    if (pageY >= padded.top && pageY <= padded.bottom) return

    const centre = (band.top + band.bottom) / 2
    const deltaClient = Math.round((pageY - centre) * at.scale)
    await page.mouse.move(at.viewport.x + at.viewport.width / 2, at.viewport.y + at.viewport.height / 2)
    await page.mouse.wheel(0, deltaClient)
    await page.waitForTimeout(80)
  }
}

async function readFrame(block: Locator): Promise<Frame> {
  const [x, y, w, h] = await Promise.all([
    block.getAttribute('data-x'),
    block.getAttribute('data-y'),
    block.getAttribute('data-width'),
    block.getAttribute('data-height'),
  ])
  return { x: Number(x), y: Number(y), w: Number(w), h: Number(h) }
}

async function dragClient(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/**
 * Move a block to `frame`'s top-left, in as many hops as the visible band allows.
 *
 * A single long drag would need the grab point and the drop point on screen at once,
 * which a 1200×1600+ page at 0.69 scale cannot always give you. Hopping — scroll,
 * drag what fits, repeat — is what a client does too.
 */
export async function moveBlockTo(page: Page, block: Locator, frame: Frame): Promise<void> {
  for (let hop = 0; hop < MAX_PLACEMENT_HOPS; hop += 1) {
    const current = await readFrame(block)
    const dx = frame.x - current.x
    const dy = frame.y - current.y
    if (Math.abs(dx) < GRID_PX && Math.abs(dy) < GRID_PX) return

    const centre = { x: current.x + current.w / 2, y: current.y + current.h / 2 }
    await ensureVisible(page, centre.y)

    const at = await placement(page)
    const band = visibleBand(at)
    const room = Math.max(GRID_PX, (band.bottom - band.top) / 2 - VISIBLE_PAD_PX)
    const stepY = Math.max(-room, Math.min(room, dy))

    const start = toClient(at, centre)
    const end = toClient(at, { x: centre.x + dx, y: centre.y + stepY })
    await dragClient(page, start, end)
  }
}

/** Resize with the south-east grip — the block must be selected for grips to exist. */
export async function resizeBlockTo(page: Page, block: Locator, frame: Frame): Promise<void> {
  for (let hop = 0; hop < MAX_PLACEMENT_HOPS; hop += 1) {
    const current = await readFrame(block)
    const dw = frame.w - current.w
    const dh = frame.h - current.h
    if (Math.abs(dw) < GRID_PX && Math.abs(dh) < GRID_PX) return

    await ensureVisible(page, current.y + current.h)
    const at = await placement(page)
    const band = visibleBand(at)
    const room = Math.max(GRID_PX, band.bottom - VISIBLE_PAD_PX - (current.y + current.h))
    const stepH = Math.max(-Math.abs(dh), Math.min(Math.max(room, GRID_PX), dh))

    const grip = block.locator('[data-handle="se"]')
    const gripBox = await grip.boundingBox()
    if (!gripBox) return
    const from = { x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 }
    await dragClient(page, from, { x: from.x + dw * at.scale, y: from.y + stepH * at.scale })
  }
}

/** Select, move, resize, then assert the result is within R2.4's tolerance. */
export async function placeBlock(page: Page, block: Locator, frame: Frame): Promise<void> {
  await selectBlock(page, block)
  await moveBlockTo(page, block, frame)
  await resizeBlockTo(page, block, frame)
  await moveBlockTo(page, block, frame)

  const landed = await readFrame(block)
  const off = [
    Math.abs(landed.x - frame.x),
    Math.abs(landed.y - frame.y),
    Math.abs(landed.x + landed.w - (frame.x + frame.w)),
    Math.abs(landed.y + landed.h - (frame.y + frame.h)),
  ]
  expect(
    Math.max(...off),
    `placement of a block landed at [${landed.x}, ${landed.y}, ${landed.w}, ${landed.h}], ` +
      `target [${frame.x}, ${frame.y}, ${frame.w}, ${frame.h}]`,
  ).toBeLessThanOrEqual(POSITION_TOLERANCE_PX)
}

/* ─────────────────────────── block actions ─────────────────────────── */

export async function selectBlock(page: Page, block: Locator): Promise<void> {
  const frame = await readFrame(block)
  await ensureVisible(page, frame.y + Math.min(frame.h, 120) / 2)
  await block.click({ position: { x: 12, y: 12 } })
  await expect(block).toHaveAttribute('data-selected', 'true')
}

/** Insert from the palette and hand back the block it selected. */
export async function insertBlock(page: Page, paletteType: string): Promise<Locator> {
  await page.getByTestId(`palette-${paletteType}`).click()
  const block = selectedBlock(page)
  await expect(block).toHaveCount(1)
  return block
}

export async function setBlockText(page: Page, block: Locator, text: string): Promise<void> {
  const frame = await readFrame(block)
  await ensureVisible(page, frame.y + Math.min(frame.h, 120) / 2)
  await block.dblclick({ position: { x: 12, y: 12 } })
  const editor = page.getByTestId('block-text-editor')
  await expect(editor).toBeVisible()
  await editor.fill(text)
  await editor.press('Enter')
  await expect(editor).toBeHidden()
}

export async function deleteBlock(page: Page, block: Locator): Promise<void> {
  await selectBlock(page, block)
  await page.getByTestId('toolbar-delete').click()
  await expect(block).toHaveCount(0)
}

/* ─────────────────────────── side panel ─────────────────────────── */

export async function openPanel(page: Page, tab: 'block' | 'site' | 'map'): Promise<void> {
  await page.getByTestId(`side-panel-tab-${tab}`).click()
  await expect(page.getByTestId('side-panel')).toHaveAttribute('data-tab', tab)
}

/** Panel text fields are committed fields: one store write on blur. Always blur. */
export async function fillPanelField(page: Page, testId: string, value: string): Promise<void> {
  const field = page.getByTestId(testId)
  await field.fill(value)
  await field.blur()
}

export async function inspectBlock(page: Page, block: Locator): Promise<void> {
  await selectBlock(page, block)
  await openPanel(page, 'block')
  await expect(page.getByTestId('block-inspector')).toBeVisible()
}

export type ScenarioLink =
  | { readonly kind: 'page'; readonly page: string }
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'none' }

/** Drive a LinkPicker by its test-id prefix (`button` or `nav-item-<i>`). */
export async function setLink(page: Page, prefix: string, link: ScenarioLink): Promise<void> {
  const select = page.getByTestId(`${prefix}-link-target`)
  if (link.kind === 'page') {
    await select.selectOption({ label: link.page })
    return
  }
  if (link.kind === 'none') {
    await select.selectOption('none')
    return
  }
  await select.selectOption('external')
  const url = page.getByTestId(`${prefix}-link-url`)
  await url.fill(link.url)
  await url.press('Enter')
}

/* ─────────────────────────── pages ─────────────────────────── */

export const pageTab = (page: Page, name: string): Locator =>
  page.getByTestId('page-tab').filter({ hasText: name })

export async function switchToPage(page: Page, name: string): Promise<void> {
  const tab = pageTab(page, name).first()
  await tab.click()
  await expect(tab).toHaveAttribute('data-current', 'true')
}

export async function addPage(page: Page, name: string): Promise<void> {
  await page.getByTestId('page-add').click()
  await page.getByTestId('page-add-name').fill(name)
  await page.getByTestId('page-add-confirm').click()
  await expect(page.getByTestId('page-add-form')).toBeHidden()
}

export async function renamePage(page: Page, from: string, to: string): Promise<void> {
  await switchToPage(page, from)
  await page.getByTestId('page-rename').click()
  await page.getByTestId('page-rename-name').fill(to)
  await page.getByTestId('page-rename-confirm').click()
  await expect(page.getByTestId('page-rename-form')).toBeHidden()
}

export async function movePageLeft(page: Page, name: string): Promise<void> {
  await switchToPage(page, name)
  await page.getByTestId('page-move-left').click()
}

export async function movePageRight(page: Page, name: string): Promise<void> {
  await switchToPage(page, name)
  await page.getByTestId('page-move-right').click()
}

/* ─────────────────────────── pen ─────────────────────────── */

export async function penMode(page: Page): Promise<string | null> {
  return page.getByTestId('pen-layer').getAttribute('data-pen-mode')
}

export async function takeUpPen(page: Page, colour: string, width: string): Promise<void> {
  if ((await penMode(page)) !== 'draw') await page.getByTestId('pen-toggle').click()
  await expect(page.getByTestId('pen-layer')).toHaveAttribute('data-pen-mode', 'draw')
  await page.getByTestId(`pen-color-${colour}`).click()
  await page.getByTestId(`pen-width-${width}`).click()
}

export async function putPenAway(page: Page): Promise<void> {
  if ((await penMode(page)) !== 'off') await page.getByTestId('pen-toggle').click()
  await expect(page.getByTestId('pen-layer')).toHaveAttribute('data-pen-mode', 'off')
}

/** Draw one polyline in page coordinates. Every point must be on screen at once. */
export async function drawStroke(page: Page, points: readonly (readonly number[])[]): Promise<void> {
  const ys = points.map((p) => p[1] ?? 0)
  await ensureVisible(page, (Math.min(...ys) + Math.max(...ys)) / 2)
  const at = await placement(page)
  const client = points.map((p) => toClient(at, { x: p[0] ?? 0, y: p[1] ?? 0 }))
  const first = client[0]
  if (!first) throw new Error('a pen stroke needs at least one point')

  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  for (const point of client.slice(1)) await page.mouse.move(point.x, point.y, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}
