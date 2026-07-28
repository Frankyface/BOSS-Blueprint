import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useCommittedField } from './useCommittedField.ts'

/**
 * THE COMMITTED-FIELD PROTOCOL, which every text field in the side panel is built
 * on and which nothing tested until now (review follow-up: 29.62% of statements,
 * and outside the coverage gate's globs).
 *
 * It carries three rules that are easy to break and invisible when broken:
 *  1. ONE store write per edit — on Enter or blur, never per keystroke. That is
 *     what makes a typed sentence one undo step instead of forty.
 *  2. A REFUSED commit snaps the field back to what is stored, so the client is
 *     never left looking at a value the design does not have.
 *  3. A store that TRANSFORMS what it was given (normalising a label, expanding a
 *     colour) wins, and the field shows what was actually kept.
 *
 * The harness is a miniature store rather than a fixed prop, because the hook's
 * whole contract is about what comes BACK from the store: `value` moving (or not)
 * on the next render is the signal it reads.
 */

interface HarnessProps {
  initial: string
  /** What the store KEEPS. Returning `current` is a refusal. */
  keep?: (next: string, current: string) => string
  onCommit?: (next: string) => void
  commitOnEnter?: boolean
}

function Harness({ initial, keep, onCommit, commitOnEnter }: HarnessProps) {
  const [value, setValue] = useState(initial)

  const field = useCommittedField(
    value,
    (next) => {
      onCommit?.(next)
      setValue((current) => (keep ? keep(next, current) : next))
    },
    commitOnEnter === undefined ? {} : { commitOnEnter },
  )

  return (
    <>
      <input data-testid="field" {...field} />
      <output data-testid="stored">{value}</output>
    </>
  )
}

const field = () => screen.getByTestId('field')
const stored = () => screen.getByTestId('stored')

const type = (text: string): void => {
  fireEvent.change(field(), { target: { value: text } })
}

describe('useCommittedField', () => {
  it('shows the stored value and keeps the draft local while typing', () => {
    const onCommit = vi.fn()
    render(<Harness initial="Martina's" onCommit={onCommit} />)

    expect(field()).toHaveValue("Martina's")

    type('Martina')
    type('Martinas ')
    type('Martinas Trattoria')

    expect(field()).toHaveValue('Martinas Trattoria')
    // THREE keystrokes, ZERO writes: the store hears about this once, at the end.
    expect(onCommit).not.toHaveBeenCalled()
    expect(stored()).toHaveTextContent("Martina's")
  })

  it('commits once on Enter, trimmed', () => {
    const onCommit = vi.fn()
    render(<Harness initial="" onCommit={onCommit} />)

    type('  Taqueria Rosa  ')
    fireEvent.keyDown(field(), { key: 'Enter' })

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('Taqueria Rosa')
    expect(field()).toHaveValue('Taqueria Rosa')
    expect(stored()).toHaveTextContent('Taqueria Rosa')
  })

  it('commits on blur — the rule the textareas depend on', () => {
    const onCommit = vi.fn()
    render(<Harness initial="" onCommit={onCommit} commitOnEnter={false} />)

    type('Line one')
    fireEvent.keyDown(field(), { key: 'Enter' })
    // Enter is a newline in a multi-line field, not a commit.
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.blur(field())
    expect(onCommit).toHaveBeenCalledWith('Line one')
  })

  it('says nothing to the store when only whitespace was added', () => {
    const onCommit = vi.fn()
    render(<Harness initial="Home" onCommit={onCommit} />)

    type('  Home  ')
    fireEvent.blur(field())

    // Trim-only: the stored value is already exactly this, so it is not an edit,
    // not a write and not an undo step — but the field is tidied up on screen.
    expect(onCommit).not.toHaveBeenCalled()
    expect(field()).toHaveValue('Home')
  })

  it('puts the field back when the store REFUSES the commit', () => {
    // A blank nav-item label is handed straight back (`withNavItemLabel`), so
    // `value` never moves and the field would otherwise sit there empty next to a
    // menu item that still says Home.
    const onCommit = vi.fn()
    render(
      <Harness
        initial="Home"
        onCommit={onCommit}
        keep={(next, current) => (next.length === 0 ? current : next)}
      />,
    )

    type('')
    fireEvent.blur(field())

    expect(onCommit).toHaveBeenCalledWith('')
    expect(field()).toHaveValue('Home')
    expect(stored()).toHaveTextContent('Home')
  })

  it('shows what the store kept when the store transforms the value', () => {
    const onCommit = vi.fn()
    render(<Harness initial="" onCommit={onCommit} keep={(next) => next.replace(/,/g, '')} />)

    type('Bread, Cakes')
    fireEvent.keyDown(field(), { key: 'Enter' })

    expect(onCommit).toHaveBeenCalledWith('Bread, Cakes')
    // The store normalised the comma away, and the field says so.
    expect(field()).toHaveValue('Bread Cakes')
    expect(stored()).toHaveTextContent('Bread Cakes')
  })

  it('abandons the draft on Escape without touching the store', () => {
    const onCommit = vi.fn()
    render(<Harness initial="Home" onCommit={onCommit} />)

    type('Homeward bound')
    fireEvent.keyDown(field(), { key: 'Escape' })

    expect(onCommit).not.toHaveBeenCalled()
    expect(field()).toHaveValue('Home')
  })

  it('does not commit an abandoned draft when the field then loses focus', () => {
    const onCommit = vi.fn()
    render(<Harness initial="Home" onCommit={onCommit} />)

    type('Homeward bound')
    fireEvent.keyDown(field(), { key: 'Escape' })
    fireEvent.blur(field())

    expect(onCommit).not.toHaveBeenCalled()
    expect(stored()).toHaveTextContent('Home')
  })

  it('commits a second edit after a refused one', () => {
    const onCommit = vi.fn()
    render(
      <Harness
        initial="Home"
        onCommit={onCommit}
        keep={(next, current) => (next.length === 0 ? current : next)}
      />,
    )

    type('')
    fireEvent.blur(field())
    type('Start here')
    fireEvent.blur(field())

    expect(onCommit).toHaveBeenLastCalledWith('Start here')
    expect(stored()).toHaveTextContent('Start here')
  })

  it('leaves other keys alone', () => {
    const onCommit = vi.fn()
    render(<Harness initial="" onCommit={onCommit} />)

    type('Ho')
    fireEvent.keyDown(field(), { key: 'Tab' })
    fireEvent.keyDown(field(), { key: 'a' })

    expect(onCommit).not.toHaveBeenCalled()
    expect(field()).toHaveValue('Ho')
  })
})
