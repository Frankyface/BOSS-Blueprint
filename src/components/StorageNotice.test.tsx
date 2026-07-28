import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useEditorStore } from '../store/editorStore.ts'

import { StorageNotice } from './StorageNotice.tsx'

beforeEach(() => {
  useEditorStore.getState().setNotice(null)
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

  it('can be dismissed', () => {
    useEditorStore.getState().setNotice({ kind: 'recovered', message: 'We could not read it.' })
    render(<StorageNotice />)

    fireEvent.click(screen.getByTestId('storage-notice-dismiss'))

    expect(screen.queryByTestId('storage-notice')).not.toBeInTheDocument()
    expect(useEditorStore.getState().notice).toBeNull()
  })
})
