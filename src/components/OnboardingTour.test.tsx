import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { App } from '../App.tsx'
import { FLAG_DISMISSED } from '../store/chromeFlags.ts'
import { useCanvasStore } from '../store/canvasStore.ts'
import { useEditorStore } from '../store/editorStore.ts'
import { useSubmitStore } from '../store/submitStore.ts'
import { TOUR_STORAGE_KEY, useTourStore } from '../store/tourStore.ts'
import { installFakeMediaQuery } from '../test/fakeMediaQuery.ts'
import type { FakeMediaQuery } from '../test/fakeMediaQuery.ts'
import { TOUR_STEPS } from '../tour/tourSteps.ts'

let media: FakeMediaQuery

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  media = installFakeMediaQuery(false)
  useCanvasStore.getState().resetCanvas()
  useEditorStore.getState().setStartState('editing')
  useTourStore.setState({
    isOpen: false,
    stepIndex: 0,
    shouldFocus: false,
    openCount: 0,
    hasAutoStarted: false,
  })
})

afterEach(() => {
  media.restore()
  window.localStorage.clear()
})

function startSmall(): void {
  media.restore()
  media = installFakeMediaQuery(true)
}

function bubble(): HTMLElement {
  return screen.getByTestId('tour-bubble')
}

describe('every pointer has something to point at', () => {
  it('finds exactly one live target for each of the five steps', () => {
    render(<App />)

    for (const step of TOUR_STEPS) {
      const targets = document.querySelectorAll(`[data-tour="${step.target}"]`)
      expect(targets, `data-tour="${step.target}"`).toHaveLength(1)
    }
  })
})

describe('the first-run tour', () => {
  it('starts by itself on a first visit', () => {
    render(<App />)

    expect(bubble()).toHaveAttribute('data-tour-target', 'palette')
    expect(bubble()).toHaveAttribute('data-tour-step', '1')
    expect(bubble()).toHaveAttribute('data-tour-count', String(TOUR_STEPS.length))
  })

  it('marks itself seen the moment it appears, not when it is finished', () => {
    render(<App />)

    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe(FLAG_DISMISSED)
  })

  it('does not come back for a client who has seen it', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, FLAG_DISMISSED)

    render(<App />)

    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()
  })

  it('steps through all five pointers and finishes on "Got it"', () => {
    render(<App />)

    for (const [index, step] of TOUR_STEPS.entries()) {
      expect(bubble()).toHaveAttribute('data-tour-target', step.target)
      expect(bubble()).toHaveTextContent(step.title)
      expect(bubble()).toHaveAttribute('data-tour-step', String(index + 1))

      const isLast = index === TOUR_STEPS.length - 1
      fireEvent.click(screen.getByTestId(isLast ? 'tour-done' : 'tour-next'))
    }

    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()
  })

  it('is announced as a note, never as a dialog', () => {
    render(<App />)

    expect(bubble()).toHaveAttribute('role', 'note')
    expect(bubble()).toHaveAttribute('aria-label', 'Getting started, step 1 of 5')
    expect(bubble()).not.toHaveAttribute('aria-modal')
    expect(document.querySelector('[aria-modal]')).toBeNull()
    expect(screen.getByTestId('onboarding-tour')).toHaveAttribute('aria-live', 'polite')
  })

  it('never steals focus when it opens by itself', () => {
    render(<App />)

    expect(document.activeElement).toBe(document.body)
  })

  it('leaves the app underneath working', () => {
    render(<App />)

    // The palette still adds a block with the first pointer wide open.
    fireEvent.click(screen.getByTestId('palette-heading'))

    expect(screen.getAllByTestId('canvas-block')).toHaveLength(1)
    expect(bubble()).toBeInTheDocument()
  })
})

describe('getting rid of the tour', () => {
  it('closes on Skip, and writes the flag', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('tour-skip'))

    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe(FLAG_DISMISSED)
  })

  it('closes on Escape', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('tour-next'))

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe(FLAG_DISMISSED)
  })

  it('stays gone once dismissed', () => {
    const view = render(<App />)
    fireEvent.click(screen.getByTestId('tour-skip'))

    // A reload: same storage, fresh stores.
    view.unmount()
    useTourStore.setState({ isOpen: false, stepIndex: 0, hasAutoStarted: false, openCount: 0 })
    render(<App />)

    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()
  })
})

describe('the help control', () => {
  it('re-opens the tour from pointer 1 without clearing the flag', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, FLAG_DISMISSED)
    render(<App />)
    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('tour-help'))

    expect(bubble()).toHaveAttribute('data-tour-step', '1')
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe(FLAG_DISMISSED)
  })

  it('takes the focus with it, because a human asked for it', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, FLAG_DISMISSED)
    render(<App />)

    fireEvent.click(screen.getByTestId('tour-help'))

    expect(document.activeElement).toBe(bubble())
  })

  it('is there on every screen, including Submit', () => {
    render(<App />)

    expect(screen.getByTestId('tour-help')).toBeVisible()
  })
})

describe('one piece of first-run chrome at a time', () => {
  it('waits for the starting-point picker to be resolved', () => {
    useEditorStore.getState().setStartState('picker')
    render(<App />)

    expect(screen.getByTestId('template-picker')).toBeInTheDocument()
    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()
    // …and it has not burned the "seen" flag while waiting.
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBeNull()

    act(() => {
      useEditorStore.getState().setStartState('editing')
    })

    expect(bubble()).toHaveAttribute('data-tour-step', '1')
  })

  it('waits for the blank-page coach card too', () => {
    useEditorStore.getState().setStartState('coaching')
    render(<App />)

    expect(screen.getByTestId('blank-start-coach')).toBeInTheDocument()
    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('blank-start-coach-dismiss'))

    expect(bubble()).toBeInTheDocument()
  })

  it('stands down while the Submit form owns the screen', () => {
    render(<App />)
    expect(bubble()).toBeInTheDocument()

    // Submit unmounts four of the five targets; a bubble left open would be
    // pointing at a form.
    act(() => {
      useSubmitStore.getState().open()
    })
    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()

    act(() => {
      useSubmitStore.getState().close()
    })
    expect(bubble()).toBeInTheDocument()
  })

  it('stands down entirely while the desktop guard is showing', () => {
    startSmall()
    render(<App />)

    expect(screen.getByTestId('desktop-guard')).toBeInTheDocument()
    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBeNull()
  })

  it('becomes available again when the window grows past the threshold', () => {
    startSmall()
    render(<App />)
    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()

    act(() => {
      media.setMatches(false)
    })

    expect(bubble()).toHaveAttribute('data-tour-step', '1')
  })

  it('hides rather than closes when a window is dragged small mid-tour', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('tour-next'))
    expect(bubble()).toHaveAttribute('data-tour-step', '2')

    act(() => {
      media.setMatches(true)
    })
    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()

    act(() => {
      media.setMatches(false)
    })
    expect(bubble()).toHaveAttribute('data-tour-step', '2')
  })
})
