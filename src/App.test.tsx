import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from './App.tsx'
import { PAGE_WIDTH_PX } from './canvas/constants.ts'
import { BLOCK_TYPE_COUNT } from './constants/blockTypes.ts'
import { useCanvasStore } from './store/canvasStore.ts'

beforeEach(() => {
  useCanvasStore.getState().resetCanvas()
})

describe('App shell', () => {
  it('renders the BOSS Blueprint header bar', () => {
    render(<App />)

    const header = screen.getByRole('banner')

    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent('BOSS Blueprint')
  })

  it('renders a virtual page at the 1200px design width', () => {
    render(<App />)

    const page = screen.getByTestId('canvas-page')

    expect(page).toHaveAttribute('data-page-width', String(PAGE_WIDTH_PX))
    expect(page.style.width).toBe(`${PAGE_WIDTH_PX}px`)
  })

  it('starts with an empty page (no blocks placed yet)', () => {
    render(<App />)

    const canvas = screen.getByRole('main', { name: 'Page canvas' })

    expect(within(canvas).queryAllByTestId('canvas-block')).toHaveLength(0)
  })

  it('renders the block palette alongside the canvas', () => {
    render(<App />)

    const palette = screen.getByRole('complementary', { name: 'Block palette' })

    expect(within(palette).getAllByRole('button')).toHaveLength(BLOCK_TYPE_COUNT)
  })

  it('puts a block on the page when a palette entry is clicked', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('palette-image'))

    const blocks = screen.getAllByTestId('canvas-block')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toHaveAttribute('data-block-type', 'image')
    expect(blocks[0]).toHaveAttribute('data-selected', 'true')
  })

  it('enables the selection toolbar only once something is selected', () => {
    render(<App />)

    expect(screen.getByTestId('toolbar-delete')).toBeDisabled()

    fireEvent.click(screen.getByTestId('palette-heading'))

    expect(screen.getByTestId('toolbar-delete')).toBeEnabled()
    expect(screen.getByTestId('canvas-toolbar-status')).toHaveTextContent('Heading selected')
  })

  it('deletes the selected block from the toolbar', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-heading'))

    fireEvent.click(screen.getByTestId('toolbar-delete'))

    expect(screen.queryAllByTestId('canvas-block')).toHaveLength(0)
    expect(useCanvasStore.getState().selectedBlockId).toBeNull()
  })

  it('deletes the selected block with the Delete key', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-button'))

    fireEvent.keyDown(window, { key: 'Delete' })

    expect(screen.queryAllByTestId('canvas-block')).toHaveLength(0)
  })

  it('deselects on Escape', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-button'))

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(useCanvasStore.getState().selectedBlockId).toBeNull()
  })
})
