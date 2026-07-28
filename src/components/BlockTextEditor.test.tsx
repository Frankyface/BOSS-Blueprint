import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Block, BlockTypeId } from '../canvas/types.ts'
import { selectCurrentBlocks, useCanvasStore } from '../store/canvasStore.ts'
import { beginTextEdit, clearTextEditSeed, pendingTextEditSeed } from '../store/textEditing.ts'

import { BlockTextEditor } from './BlockTextEditor.tsx'

const store = () => useCanvasStore.getState()

function addAndEdit(type: BlockTypeId): Block {
  const id = store().addBlock(type)
  store().startEditingBlock(id)
  const block = selectCurrentBlocks(store()).find((candidate) => candidate.id === id)
  if (!block) throw new Error('block vanished')
  return block
}

beforeEach(() => {
  store().resetCanvas()
  clearTextEditSeed()
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

    expect(selectCurrentBlocks(store())[0]?.text).toBe('Welcome to BOSS')
    expect(store().editingBlockId).toBeNull()
  })

  it('commits on click-away (blur)', () => {
    const block = addAndEdit('button')
    render(<BlockTextEditor block={block} />)

    const editor = screen.getByTestId('block-text-editor')
    fireEvent.change(editor, { target: { value: 'Book a call' } })
    fireEvent.blur(editor)

    expect(selectCurrentBlocks(store())[0]?.text).toBe('Book a call')
    expect(store().editingBlockId).toBeNull()
  })

  it('discards the draft on Escape', () => {
    const block = addAndEdit('heading')
    render(<BlockTextEditor block={block} />)

    const editor = screen.getByTestId('block-text-editor')
    fireEvent.change(editor, { target: { value: 'Never mind' } })
    fireEvent.keyDown(editor, { key: 'Escape' })

    expect(selectCurrentBlocks(store())[0]?.text).toBe('')
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

  /**
   * TYPE-TO-EDIT (UX audit MAJOR-3): the keystroke that opened the editor is the
   * first character of the edit, and it replaces what was there — exactly what
   * double-clicking (which selects the old text first) and typing would do.
   */
  describe('opened by typing', () => {
    it('starts on the character that opened it, not the old text', () => {
      const id = store().addBlock('heading')
      store().setBlockText(id, 'Your headline here')
      beginTextEdit(id, 'T')
      const block = selectCurrentBlocks(store()).find((candidate) => candidate.id === id)

      render(<BlockTextEditor block={block ?? addAndEdit('heading')} />)

      const editor = screen.getByTestId('block-text-editor')
      expect(editor).toHaveValue('T')
      expect(editor).toHaveFocus()
    })

    it('carries on from there into a full commit — one store write', () => {
      const id = store().addBlock('heading')
      beginTextEdit(id, 'T')
      const block = selectCurrentBlocks(store()).find((candidate) => candidate.id === id)

      render(<BlockTextEditor block={block ?? addAndEdit('heading')} />)

      const editor = screen.getByTestId('block-text-editor')
      fireEvent.change(editor, { target: { value: 'Taqueria Rosa' } })
      fireEvent.keyDown(editor, { key: 'Enter' })

      expect(selectCurrentBlocks(store())[0]?.text).toBe('Taqueria Rosa')
    })

    it('consumes the seed, so the next double-click opens on the block\'s own words', () => {
      const first = store().addBlock('heading')
      beginTextEdit(first, 'T')
      const seeded = selectCurrentBlocks(store()).find((candidate) => candidate.id === first)
      render(<BlockTextEditor block={seeded ?? addAndEdit('heading')} />)

      expect(pendingTextEditSeed()).toBeNull()

      // A plain double-click on a block with words: no seed, the words are there.
      store().stopEditingBlock()
      store().setBlockText(first, 'Taqueria Rosa')
      beginTextEdit(first)
      const again = selectCurrentBlocks(store()).find((candidate) => candidate.id === first)
      render(<BlockTextEditor block={again ?? addAndEdit('heading')} />)

      expect(screen.getAllByTestId('block-text-editor')[1]).toHaveValue('Taqueria Rosa')
    })

    it('drops the seed when the block has no editor to open', () => {
      const id = store().addBlock('image')

      beginTextEdit(id, 'T')

      expect(store().editingBlockId).toBeNull()
      expect(pendingTextEditSeed()).toBeNull()
    })
  })

  it('commits only once even if blur follows Enter', () => {
    const block = addAndEdit('heading')
    render(<BlockTextEditor block={block} />)

    const editor = screen.getByTestId('block-text-editor')
    fireEvent.change(editor, { target: { value: 'Committed' } })
    fireEvent.keyDown(editor, { key: 'Escape' })
    fireEvent.blur(editor)

    expect(selectCurrentBlocks(store())[0]?.text).toBe('')
  })
})
