import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import { PAGE_WIDTH_PX } from '../canvas/constants.ts'
import type { Block, ResizeHandle } from '../canvas/types.ts'
import { selectCurrentBlocks, useCanvasStore } from '../store/canvasStore.ts'

import { useBlockGesture } from './useBlockGesture.ts'

/**
 * THE GESTURE FAST PATH, in jsdom.
 *
 * What is worth pinning here is not the pixels — three real browsers do that in
 * `e2e/block-canvas.spec.ts` — but the two promises that are invisible from the
 * outside and easy to break from the inside:
 *
 *  1. THE STORE IS NOT WRITTEN WHILE THE POINTER IS DOWN. The preview is written
 *     straight to the element's style; one pointerup produces one store write, so
 *     a 60-frame drag is one undo step rather than sixty.
 *  2. THE PREVIEW AND THE COMMIT COME FROM THE SAME MATHS. What the element shows
 *     mid-drag is what the store ends up holding, including the page-edge clamp.
 *
 * jsdom has no pointer capture, so the three capture calls are stubbed onto the
 * element — the hook only needs them not to throw.
 */

const store = () => useCanvasStore.getState()

interface HarnessProps {
  block: Block
  handle?: ResizeHandle
  scale?: number
}

function Harness({ block, handle, scale = 1 }: HarnessProps) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const gesture = useBlockGesture({ block, elementRef, getScale: () => scale })

  return (
    <div
      data-testid="block"
      ref={(node) => {
        if (node) {
          Object.assign(node, {
            setPointerCapture: () => undefined,
            releasePointerCapture: () => undefined,
            hasPointerCapture: () => true,
          })
        }
        elementRef.current = node
      }}
      style={{ left: `${block.x}px`, top: `${block.y}px` }}
      onPointerDown={(event) => {
        if (handle) gesture.onHandlePointerDown(event, handle)
        else gesture.onPointerDown(event)
      }}
      onPointerMove={gesture.onPointerMove}
      onPointerUp={gesture.onPointerUp}
    />
  )
}

const element = () => screen.getByTestId('block')

const blockById = (id: string): Block => {
  const found = selectCurrentBlocks(store()).find((candidate) => candidate.id === id)
  if (!found) throw new Error(`No block ${id}`)
  return found
}

/** Add a block and hand back the object the harness should be driven with. */
function seed(type: 'heading' | 'button'): Block {
  const id = store().addBlock(type)
  return blockById(id)
}

const POINTER = { pointerId: 1, button: 0 }

beforeEach(() => {
  store().resetCanvas()
})

describe('dragging a block', () => {
  it('previews on the element and writes to the store exactly once, on release', () => {
    const block = seed('heading')
    render(<Harness block={block} />)

    let writes = 0
    const stopCounting = useCanvasStore.subscribe(() => {
      writes += 1
    })

    fireEvent.pointerDown(element(), { ...POINTER, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(element(), { ...POINTER, clientX: 140, clientY: 124 })
    fireEvent.pointerMove(element(), { ...POINTER, clientX: 180, clientY: 148 })

    // Mid-drag: the element has moved, the document has not.
    expect(element().style.transform).toBe('translate3d(80px, 48px, 0)')
    expect(blockById(block.id)).toMatchObject({ x: block.x, y: block.y })
    // NOT ONE store notification for the pointerdown and both moves — the block
    // was already selected, so even the selection is a no-op by identity.
    expect(writes).toBe(0)

    fireEvent.pointerUp(element(), { ...POINTER, clientX: 180, clientY: 148 })

    expect(blockById(block.id)).toMatchObject({ x: block.x + 80, y: block.y + 48 })
    expect(writes).toBe(1)
    stopCounting()
  })

  it('selects the block it is grabbing', () => {
    const block = seed('heading')
    render(<Harness block={block} />)

    fireEvent.pointerDown(element(), { ...POINTER, clientX: 0, clientY: 0 })

    expect(store().selectedBlockId).toBe(block.id)
  })

  it('divides the pointer delta by the fit-to-window scale', () => {
    const block = seed('heading')
    render(<Harness block={block} scale={0.5} />)

    fireEvent.pointerDown(element(), { ...POINTER, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(element(), { ...POINTER, clientX: 40, clientY: 0 })

    // 40 screen pixels at half size is 80 page pixels.
    expect(blockById(block.id).x).toBe(block.x + 80)
  })

  it('lands on the page edge instead of off it, preview and commit agreeing', () => {
    const block = seed('button')
    render(<Harness block={block} />)

    fireEvent.pointerDown(element(), { ...POINTER, clientX: 500, clientY: 500 })
    fireEvent.pointerUp(element(), { ...POINTER, clientX: -9000, clientY: -9000 })

    expect(blockById(block.id)).toMatchObject({ x: 0, y: 0 })
    expect(element().style.left).toBe('0px')
    expect(element().style.top).toBe('0px')
  })

  it('ignores a move that never had a pointerdown, and a foreign pointer', () => {
    const block = seed('heading')
    render(<Harness block={block} />)

    fireEvent.pointerMove(element(), { ...POINTER, clientX: 400, clientY: 400 })
    expect(element().style.transform).toBe('')

    fireEvent.pointerDown(element(), { ...POINTER, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(element(), { pointerId: 9, clientX: 400, clientY: 400 })
    expect(element().style.transform).toBe('')
  })

  it('ignores a right-click', () => {
    const block = seed('heading')
    render(<Harness block={block} />)

    fireEvent.pointerDown(element(), { pointerId: 1, button: 2, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(element(), { pointerId: 1, button: 2, clientX: 200, clientY: 0 })

    expect(blockById(block.id).x).toBe(block.x)
  })
})

describe('resizing a block', () => {
  it('previews width and height, then commits once', () => {
    const block = seed('heading')
    render(<Harness block={block} handle="se" />)

    fireEvent.pointerDown(element(), { ...POINTER, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(element(), { ...POINTER, clientX: 40, clientY: 40 })

    expect(element().style.width).toBe(`${String(block.width + 40)}px`)
    expect(element().style.height).toBe(`${String(block.height + 40)}px`)
    expect(blockById(block.id).width).toBe(block.width)

    fireEvent.pointerUp(element(), { ...POINTER, clientX: 40, clientY: 40 })

    expect(blockById(block.id)).toMatchObject({
      width: block.width + 40,
      height: block.height + 40,
    })
  })

  it('never grows a block past the right edge of the page', () => {
    const block = seed('heading')
    render(<Harness block={block} handle="e" />)

    fireEvent.pointerDown(element(), { ...POINTER, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(element(), { ...POINTER, clientX: 9000, clientY: 0 })

    const resized = blockById(block.id)
    expect(resized.x + resized.width).toBeLessThanOrEqual(PAGE_WIDTH_PX)
  })
})
