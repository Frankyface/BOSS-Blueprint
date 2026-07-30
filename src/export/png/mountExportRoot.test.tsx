import { describe, expect, it, vi } from 'vitest'

import { PAGE_WIDTH_PX } from '../../canvas/constants.ts'
import type { CanvasDocument, Page, PenStroke } from '../../canvas/types.ts'
import { emptySiteSettings } from '../../canvas/siteSettings.ts'
import { testBlock } from '../../test/documents.ts'

import { mountExportRoot } from './mountExportRoot.tsx'
import type { RenderLadderPlan, RenderLadderPorts } from './renderLadder.ts'
import { exportHeightForPage, renderPagePng } from './renderPagePng.ts'
import type { PageRenderResult } from './types.ts'

/**
 * The ladder itself is proven rung by rung in `renderLadder.test.ts`. What only a
 * stub can show is the PLAN `renderPagePng` hands it — and `requiresInk` is the
 * field that decides whether a page's capture is checked for ink at all, so a
 * pen-only page reading `false` there is the one page whose ink is never verified.
 */
const runRenderLadder = vi.hoisted(() =>
  vi.fn<(plan: RenderLadderPlan, ports: RenderLadderPorts) => Promise<PageRenderResult>>(),
)

vi.mock('./renderLadder.ts', () => ({ runRenderLadder }))

const PAGE: Page = {
  id: 'page-home',
  name: 'Home',
  blocks: [testBlock({ id: 'block-heading', type: 'heading', text: 'Welcome' })],
  penStrokes: [],
}

const DOCUMENT: CanvasDocument = { siteSettings: emptySiteSettings(), pages: [PAGE] }

/** ~290px of 4px nib — a real mark, well past what the ink floor asks for. */
const MARK: PenStroke = {
  id: 'stroke-note',
  points: [
    { x: 80, y: 200 },
    { x: 220, y: 214 },
    { x: 360, y: 268 },
  ],
  color: '#16202f',
  width: 4,
}

/** ~30px of the same nib — a tick, far below what the floor could judge. */
const SMALL_MARK: PenStroke = {
  id: 'stroke-tick',
  points: [
    { x: 80, y: 200 },
    { x: 110, y: 204 },
  ],
  color: '#16202f',
  width: 4,
}

const STUB_RESULT: PageRenderResult = {
  blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
  width: PAGE_WIDTH_PX,
  height: 1600,
  engine: 'snapdom',
  attempts: 1,
  inkRatio: 0.01,
  hasStrokes: false,
}

describe('mountExportRoot', () => {
  it('mounts OFFSCREEN AND LAID OUT — never display:none or visibility:hidden', () => {
    // The single most likely cause of a silently blank export: a host with no
    // layout captures as nothing while passing every dimension check.
    const mounted = mountExportRoot(PAGE, exportHeightForPage(PAGE))
    const host = document.querySelector<HTMLElement>('[data-testid="export-root-host"]')

    try {
      expect(host).not.toBeNull()
      expect(host?.style.position).toBe('fixed')
      expect(Number.parseInt(host?.style.left ?? '0', 10)).toBeLessThan(-PAGE_WIDTH_PX)
      expect(host?.style.display).not.toBe('none')
      expect(host?.style.visibility).not.toBe('hidden')
    } finally {
      mounted.dispose()
    }
  })

  it('hands back a populated root synchronously', () => {
    const mounted = mountExportRoot(PAGE, exportHeightForPage(PAGE))

    try {
      // No await anywhere: `flushSync` is what makes the DOM real by the time
      // the capture engine is pointed at it.
      expect(mounted.node.dataset.testid).toBe('export-root')
      expect(mounted.node.querySelectorAll('[data-testid="export-block"]')).toHaveLength(1)
      expect(mounted.node.textContent).toContain('Welcome')
    } finally {
      mounted.dispose()
    }
  })

  it('removes the host on dispose, and tolerates a second dispose', () => {
    const mounted = mountExportRoot(PAGE, exportHeightForPage(PAGE))

    mounted.dispose()
    mounted.dispose()

    expect(document.querySelector('[data-testid="export-root-host"]')).toBeNull()
  })
})

describe('renderPagePng', () => {
  /** Render one page through the stubbed ladder and hand back the plan it was given. */
  async function planFor(page: Page): Promise<RenderLadderPlan> {
    runRenderLadder.mockResolvedValue(STUB_RESULT)
    await renderPagePng({ siteSettings: emptySiteSettings(), pages: [page] }, page.id)

    const plan = runRenderLadder.mock.calls.at(-1)?.[0]
    if (!plan) throw new Error('the ladder was never called')
    return plan
  }

  it('refuses a page id that is not in the document', async () => {
    await expect(renderPagePng(DOCUMENT, 'page-nope')).rejects.toThrow(/no such page/)
  })

  it('checks the ink on a page whose only content is pen strokes', async () => {
    const plan = await planFor({ ...PAGE, blocks: [], penStrokes: [MARK] })

    expect(plan.requiresInk).toBe(true)
    expect(plan.hasStrokes).toBe(true)
  })

  it('does NOT check the ink on a pen-only page whose marks are too small to judge', async () => {
    // The client drew one tick and nothing else. That page renders fine; holding it
    // to a floor its own strokes cannot reach would BLOCK it on "export hiccup, try
    // again", which is advice nobody can act on. It still ships — with its strokes.
    const plan = await planFor({ ...PAGE, blocks: [], penStrokes: [SMALL_MARK] })

    expect(plan.requiresInk).toBe(false)
    expect(plan.hasStrokes).toBe(true)
  })

  it('checks the ink on a page with blocks even when its marks are tiny', async () => {
    // Blocks promise ink on their own, so the small-mark exemption is about the
    // pen-only arm only — it must not switch the floor off for a normal page.
    const plan = await planFor({ ...PAGE, penStrokes: [SMALL_MARK] })

    expect(plan.requiresInk).toBe(true)
  })

  it('checks the ink on a page with blocks, exactly as it always has', async () => {
    expect((await planFor(PAGE)).requiresInk).toBe(true)
  })

  it('skips the ink check on a page with neither blocks nor strokes', async () => {
    // Nothing was drawn, so there is no ink to miss — V9 covers an empty page.
    expect((await planFor({ ...PAGE, blocks: [], penStrokes: [] })).requiresInk).toBe(false)
  })
})

describe('exportHeightForPage', () => {
  it('counts pen marks as content, exactly as the editor canvas does', () => {
    const withMark: Page = {
      ...PAGE,
      penStrokes: [
        {
          id: 'stroke-low',
          points: [
            { x: 10, y: 2400 },
            { x: 40, y: 2440 },
          ],
          color: '#16202f',
          width: 4,
        },
      ],
    }

    expect(exportHeightForPage(withMark)).toBeGreaterThan(exportHeightForPage(PAGE))
  })
})
