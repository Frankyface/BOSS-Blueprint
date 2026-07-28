import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PAGE_WIDTH_PX } from '../../canvas/constants.ts'
import type { Page } from '../../canvas/types.ts'
import { testBlock } from '../../test/documents.ts'

import { PageExportRoot } from './exportRoot.tsx'
import { exportHeightForPage } from './renderPagePng.ts'

/**
 * The export root's DOM contract: the clip box, the absence of editor chrome,
 * and the promise that a block hanging off the right edge keeps its TRUE
 * geometry (the clip is the container's job; the JSON's job is the truth).
 */

const OVERFLOWING_BLOCK = testBlock({
  id: 'block-overflow',
  type: 'section',
  x: 1000,
  y: 240,
  width: 400,
  height: 200,
  text: 'Runs off the edge',
})

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-home',
    name: 'Home',
    blocks: [testBlock({ id: 'block-heading', type: 'heading', text: 'Welcome' })],
    penStrokes: [],
    ...overrides,
  }
}

function renderRoot(page: Page) {
  const height = exportHeightForPage(page)
  render(<PageExportRoot page={page} height={height} />)
  return { root: screen.getByTestId('export-root'), height }
}

describe('PageExportRoot box', () => {
  it('is exactly 1200 x the §4.2 height with overflow hidden', () => {
    const { root, height } = renderRoot(pageWith())
    const style = getComputedStyle(root)

    expect(style.width).toBe(`${String(PAGE_WIDTH_PX)}px`)
    expect(style.height).toBe(`${String(height)}px`)
    // ONE CSS PROPERTY IS THE WHOLE CLIP RULE (§4.3). If this ever reads
    // anything but `hidden`, every exported PNG silently stops being 1200 wide.
    expect(style.overflow).toBe('hidden')
  })

  it('sits on a white page background', () => {
    const { root } = renderRoot(pageWith())

    expect(getComputedStyle(root).background).toContain('rgb(255, 255, 255)')
  })

  it('takes its height from the shared §4.2 function, not from its content', () => {
    const tall = pageWith({
      blocks: [testBlock({ id: 'block-low', type: 'text', y: 2000, height: 100 })],
    })
    const { root, height } = renderRoot(tall)

    expect(height).toBe(exportHeightForPage(tall))
    expect(root.dataset.pageHeight).toBe(String(height))
  })
})

describe('PageExportRoot chrome', () => {
  it('carries no selection outline, resize handle, grid or toolbar', () => {
    const { root } = renderRoot(
      pageWith({ blocks: [testBlock({ id: 'block-a' }), testBlock({ id: 'block-b', type: 'button' })] }),
    )

    expect(root.querySelectorAll('[data-selected="true"]')).toHaveLength(0)
    expect(root.querySelectorAll('[data-editing="true"]')).toHaveLength(0)
    expect(root.querySelector('.resize-handle')).toBeNull()
    expect(root.querySelector('.block-editor')).toBeNull()
    expect(root.querySelector('.canvas-area')).toBeNull()
    expect(root.querySelector('.canvas-page')).toBeNull()
  })

  it('renders an image slot with NO upload button and NO file input', () => {
    const { root } = renderRoot(
      pageWith({
        blocks: [
          testBlock({ id: 'block-image', type: 'image', description: 'Front of the shop' }),
        ],
      }),
    )

    const slot = within(root).getByTestId('image-slot')

    expect(slot).toHaveAttribute('data-placeholder', 'true')
    expect(within(slot).getByTestId('image-slot-caption')).toHaveTextContent('Front of the shop')
    expect(root.querySelector('[data-testid="image-upload"]')).toBeNull()
    expect(root.querySelector('[data-testid="image-file-input"]')).toBeNull()
  })

  it('renders a filled slot as the photo itself, straight from the data URI', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo='
    const { root } = renderRoot(
      pageWith({
        blocks: [
          testBlock({ id: 'block-photo', type: 'image', imageData: dataUri, fit: 'contain' }),
        ],
      }),
    )

    const photo = within(root).getByTestId('image-slot-photo')

    expect(photo).toHaveAttribute('src', dataUri)
    expect(getComputedStyle(photo).objectFit).toBe('contain')
  })
})

describe('PageExportRoot geometry', () => {
  it('keeps an overflowing block at its TRUE left and width', () => {
    // The clip belongs to the container; `site.json` keeps the real frame (V25
    // WARNs, [N13] narrates). Clamping the block here would lose the truth.
    const { root } = renderRoot(pageWith({ blocks: [OVERFLOWING_BLOCK] }))
    const block = within(root).getByTestId('export-block')

    expect(block.style.left).toBe('1000px')
    expect(block.style.width).toBe('400px')
  })

  it('paints blocks in array order, which is the page z-order', () => {
    const { root } = renderRoot(
      pageWith({
        blocks: [testBlock({ id: 'block-under' }), testBlock({ id: 'block-over', type: 'button' })],
      }),
    )

    const zIndexes = [...root.querySelectorAll<HTMLElement>('[data-testid="export-block"]')].map(
      (element) => element.style.zIndex,
    )

    expect(zIndexes).toEqual(['1', '2'])
  })

  it('bakes the pen layer in above every block, with no eraser hit-lines', () => {
    const page = pageWith({
      penStrokes: [
        {
          id: 'stroke-1',
          points: [
            { x: 100, y: 100 },
            { x: 300, y: 180 },
          ],
          color: '#c0392b',
          width: 6,
        },
      ],
    })
    const { root } = renderRoot(page)
    const layer = within(root).getByTestId('export-pen-layer')

    expect(layer.style.zIndex).toBe('100000')
    expect(layer.getAttribute('width')).toBe(String(PAGE_WIDTH_PX))
    expect(layer.getAttribute('height')).toBe(String(exportHeightForPage(page)))
    expect(layer.querySelectorAll('path')).toHaveLength(1)
    expect(layer.querySelector('path')).toHaveAttribute('fill', '#c0392b')
    expect(layer.querySelector('.pen-layer__hit')).toBeNull()
    expect(layer.querySelector('[data-testid="pen-live-stroke"]')).toBeNull()
  })

  it('omits the pen layer entirely on a page with no strokes', () => {
    const { root } = renderRoot(pageWith())

    expect(root.querySelector('[data-testid="export-pen-layer"]')).toBeNull()
  })
})
