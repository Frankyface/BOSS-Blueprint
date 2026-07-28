import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BLOCK_TYPES } from '../constants/blockTypes.ts'

import { BlockPalette } from './BlockPalette.tsx'

const EXPECTED_LABELS = ['Section', 'Heading', 'Text', 'Image', 'Button', 'Nav bar']
const EXPECTED_IDS = ['section', 'heading', 'text', 'image', 'button', 'nav-bar']

describe('BlockPalette', () => {
  it('lists the six planned block types in order', () => {
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

  it('renders every block type as inert (disabled) until the canvas exists', () => {
    render(<BlockPalette />)

    const buttons = screen.getAllByRole('button')

    expect(buttons).toHaveLength(BLOCK_TYPES.length)
    for (const button of buttons) {
      expect(button).toBeDisabled()
    }
  })
})
