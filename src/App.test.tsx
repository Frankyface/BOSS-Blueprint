import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App.tsx'
import { BLOCK_TYPE_COUNT } from './constants/blockTypes.ts'

describe('App shell', () => {
  it('renders the BOSS Blueprint header bar', () => {
    render(<App />)

    const header = screen.getByRole('banner')

    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent('BOSS Blueprint')
  })

  it('renders a canvas area that starts empty (no blocks placed yet)', () => {
    render(<App />)

    const canvas = screen.getByRole('main', { name: 'Page canvas' })

    expect(canvas).toBeInTheDocument()
    expect(within(canvas).queryAllByRole('button')).toHaveLength(0)
  })

  it('renders the block palette alongside the canvas', () => {
    render(<App />)

    const palette = screen.getByRole('complementary', { name: 'Block palette' })

    expect(within(palette).getAllByRole('button')).toHaveLength(BLOCK_TYPE_COUNT)
  })
})
