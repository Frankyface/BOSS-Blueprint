import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Block, BlockTypeId } from '../canvas/types.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

import { BlockTextEditor } from './BlockTextEditor.tsx'

const store = () => useCanvasStore.getState()

function addAndEdit(type: BlockTypeId): Block {
  const id = store().addBlock(type)
  store().startEditingBlock(id)
  const block = store().blocks.find((candidate) => candidate.id === id)
  if (!block) throw new Error('block vanished')
  return block
}

beforeEach(() => {
  store().resetCanvas()
})

describe('BlockTextEditor', () => {
  it('uses a real input for single-line blocks — never contentEditable', () => {
    const block = addAndEdit('heading')
    render(<BlockTextEditor block={block} />)

    const editor = screen.getByTestId('block-text-editor')

    expect(editor.tagName).toBe('INPUT')
    expect(editor).not.toHaveAttribute('contenteditable')
  })

  it('uses a textarea for multi-line blocks', () => {
    const block = addAndEdit('text')
    render(<BlockTextEditor block={block} />)

    expect(screen.getByTestId('block-text-editor').tagName).toBe('TEXTAREA')
  })

  it('focuses itself so the client can just start typing', () => {
    const block = addAndEdit('heading')
    render(<BlockTextEditor block={block} />)

    expect(screen.getByTestId('block-text-editor')).toHaveFocus()
  })

  it('commits the typed text on Enter and closes the editor', () => {
    const block = addAndEdit('heading')
    render(<BlockTextEditor block={block} />)

    const editor = screen.getByTestId('block-text-editor')
    fireEvent.change(editor, { target: { value: 'Welcome to BOSS' } })
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(store().blocks[0]?.text).toBe('Welcome to BOSS')
    expect(store().editingBlockId).toBeNull()
  })

  it('commits on click-away (blur)', () => {
    const block = addAndEdit('button')
    render(<BlockTextEditor block={block} />)

    const editor = screen.getByTestId('block-text-editor')
    fireEvent.change(editor, { target: { value: 'Book a call' } })
    fireEvent.blur(editor)

    expect(store().blocks[0]?.text).toBe('Book a call')
    expect(store().editingBlockId).toBeNull()
  })

  it('discards the draft on Escape', () => {
    const block = addAndEdit('heading')
    render(<BlockTextEditor block={block} />)

    const editor = screen.getByTestId('block-text-editor')
    fireEvent.change(editor, { target: { value: 'Never mind' } })
    fireEvent.keyDown(editor, { key: 'Escape' })

    expect(store().blocks[0]?.text).toBe('')
    expect(store().editingBlockId).toBeNull()
  })

  it('lets Shift+Enter add a newline in multi-line copy instead of committing', () => {
    const block = addAndEdit('text')
    render(<BlockTextEditor block={block} />)

    const editor = screen.getByTestId('block-text-editor')
    fireEvent.change(editor, { target: { value: 'line one' } })
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true })

    expect(store().editingBlockId).toBe(block.id)
  })

  it('commits only once even if blur follows Enter', () => {
    const block = addAndEdit('heading')
    render(<BlockTextEditor block={block} />)

    const editor = screen.getByTestId('block-text-editor')
    fireEvent.change(editor, { target: { value: 'Committed' } })
    fireEvent.keyDown(editor, { key: 'Escape' })
    fireEvent.blur(editor)

    expect(store().blocks[0]?.text).toBe('')
  })
})
