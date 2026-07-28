import { describe, expect, it } from 'vitest'

import { PAGE_WIDTH_PX } from '../../canvas/constants.ts'
import type { CanvasDocument, Page } from '../../canvas/types.ts'
import { emptySiteSettings } from '../../canvas/siteSettings.ts'
import { testBlock } from '../../test/documents.ts'

import { mountExportRoot } from './mountExportRoot.tsx'
import { exportHeightForPage, renderPagePng } from './renderPagePng.ts'

const PAGE: Page = {
  id: 'page-home',
  name: 'Home',
  blocks: [testBlock({ id: 'block-heading', type: 'heading', text: 'Welcome' })],
  penStrokes: [],
}

const DOCUMENT: CanvasDocument = { siteSettings: emptySiteSettings(), pages: [PAGE] }

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
  it('refuses a page id that is not in the document', async () => {
    await expect(renderPagePng(DOCUMENT, 'page-nope')).rejects.toThrow(/no such page/)
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
