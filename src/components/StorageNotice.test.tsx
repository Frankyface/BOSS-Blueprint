import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as designFileIo from '../platform/designFileIo.ts'
import { useCanvasStore } from '../store/canvasStore.ts'
import { useEditorStore } from '../store/editorStore.ts'

import { StorageNotice } from './StorageNotice.tsx'

beforeEach(() => {
  useEditorStore.getState().setNotice(null)
  useEditorStore.getState().setToast(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StorageNotice', () => {
  it('renders nothing when there is nothing to say', () => {
    render(<StorageNotice />)

    expect(screen.queryByTestId('storage-notice')).not.toBeInTheDocument()
  })

  it('shows the message as a live status rather than a blocking dialog', () => {
    useEditorStore.getState().setNotice({ kind: 'near-quota', message: 'Running low on space.' })

    render(<StorageNotice />)

    const notice = screen.getByTestId('storage-notice')
    expect(notice).toHaveTextContent('Running low on space.')
    expect(notice).toHaveAttribute('role', 'status')
    expect(notice).toHaveAttribute('data-notice-kind', 'near-quota')
  })

  it('tags a failed save so it can be styled as the serious one', () => {
    useEditorStore.getState().setNotice({ kind: 'save-failed', message: 'Out of space.' })

    render(<StorageNotice />)

    expect(screen.getByTestId('storage-notice')).toHaveAttribute(
      'data-notice-kind',
      'save-failed',
    )
  })

  /**
   * THE RESCUE (UX audit MAJOR). When the browser stops saving, the client needs the
   * one action that loses nothing — downloading — within reach of the sentence
   * explaining why. Downloading does not touch localStorage, so it still works.
   */
  it.each(['near-quota', 'save-failed', 'unavailable'] as const)(
    'offers the download rescue on a %s notice',
    (kind) => {
      useEditorStore.getState().setNotice({ kind, message: 'Out of room.' })

      render(<StorageNotice />)

      expect(screen.getByTestId('storage-notice-download')).toBeInTheDocument()
    },
  )

  it('does NOT offer it on a recovered notice, where the design on screen is empty', () => {
    useEditorStore.getState().setNotice({ kind: 'recovered', message: 'We could not read it.' })

    render(<StorageNotice />)

    expect(screen.queryByTestId('storage-notice-download')).not.toBeInTheDocument()
  })

  it('really downloads the design, and says what was saved', () => {
    useEditorStore.getState().setNotice({ kind: 'save-failed', message: 'Out of room.' })
    useCanvasStore.getState().resetCanvas()
    useCanvasStore.getState().updateSiteSettings({ businessName: 'The Copper Pot' })

    const saved: { fileName: string; text: string }[] = []
    vi.spyOn(designFileIo, 'downloadTextFile').mockImplementation((fileName, text) => {
      saved.push({ fileName, text })
    })

    render(<StorageNotice />)
    fireEvent.click(screen.getByTestId('storage-notice-download'))

    expect(saved).toHaveLength(1)
    expect(saved[0]?.fileName).toBe('the-copper-pot.blueprint')
    expect(saved[0]?.text).toContain('"schemaVersion"')
    expect(useEditorStore.getState().toast).toMatch(/the-copper-pot\.blueprint/)
    // The notice stays: saving is still failing, and the client may need to read it.
    expect(screen.getByTestId('storage-notice')).toBeInTheDocument()
  })

  it('can be dismissed', () => {
    useEditorStore.getState().setNotice({ kind: 'recovered', message: 'We could not read it.' })
    render(<StorageNotice />)

    fireEvent.click(screen.getByTestId('storage-notice-dismiss'))

    expect(screen.queryByTestId('storage-notice')).not.toBeInTheDocument()
    expect(useEditorStore.getState().notice).toBeNull()
  })
})
