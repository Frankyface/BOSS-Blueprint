import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { BLOCK_TYPES } from '../constants/blockTypes.ts'
import { selectCurrentBlocks, useCanvasStore } from '../store/canvasStore.ts'

import { BlockPalette } from './BlockPalette.tsx'

const EXPECTED_LABELS = ['Section', 'Heading', 'Text', 'Image', 'Button', 'Nav bar']
const EXPECTED_IDS = ['section', 'heading', 'text', 'image', 'button', 'nav-bar']

beforeEach(() => {
  useCanvasStore.getState().resetCanvas()
})

describe('BlockPalette', () => {
  it('lists the six block types in order', () => {
    render(<BlockPalette />)

    const buttons = screen.getAllByRole('button')

    expect(buttons.map((button) => button.getAttribute('data-block-type'))).toEqual(EXPECTED_IDS)
  })

  it('shows a human-readable label for every block type', () => {
    render(<BlockPalette />)

    for (const label of EXPECTED_LABELS) {
      expect(screen.getByText(label, { exact: true })).toBeVisible()
    }
  })

  /**
   * UX audit N1: the sentence that explains the palette used to be its last line,
   * below six buttons and off the bottom of a laptop window. It now sits between
   * the heading and the blocks, where the eye lands before the first click.
   */
  it('explains how to add a block between the heading and the blocks', () => {
    render(<BlockPalette />)

    const heading = screen.getByRole('heading', { level: 2, name: 'Blocks' })
    const notice = screen.getByTestId('palette-notice')
    const list = screen.getByRole('list')

    expect(notice).toHaveTextContent('Click a block to drop it on the page')
    expect(heading.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(notice.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('offers every block type as an enabled control', () => {
    render(<BlockPalette />)

    const buttons = screen.getAllByRole('button')

    expect(buttons).toHaveLength(BLOCK_TYPES.length)
    for (const button of buttons) {
      expect(button).toBeEnabled()
    }
  })

  it('adds a block of the clicked type to the document and selects it', () => {
    render(<BlockPalette />)

    fireEvent.click(screen.getByTestId('palette-heading'))

    const { selectedBlockId } = useCanvasStore.getState()
    const blocks = selectCurrentBlocks(useCanvasStore.getState())
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('heading')
    expect(selectedBlockId).toBe(blocks[0]?.id)
  })

  it('can add one of every type', () => {
    render(<BlockPalette />)

    for (const id of EXPECTED_IDS) {
      fireEvent.click(screen.getByTestId(`palette-${id}`))
    }

    const types = selectCurrentBlocks(useCanvasStore.getState()).map((block) => block.type)
    expect([...types].sort()).toEqual([...EXPECTED_IDS].sort())
  })
})
