import { beforeEach, describe, expect, it } from 'vitest'

import { HONEYPOT_REFUSAL } from '../submit/form.ts'

import { INITIAL_CANVAS_STATE, useCanvasStore } from './canvasStore.ts'
import { currentLead, jumpToBlock, resetSubmitStore, useSubmitStore } from './submitStore.ts'

/**
 * The gate's two REFUSALS, which both happen before any port is touched: a
 * tripped honeypot and an incomplete lead. Everything past that point is the
 * pipeline's, and `src/submit/submitFlow.test.ts` owns it.
 */

beforeEach(() => {
  resetSubmitStore()
  useCanvasStore.setState({ ...INITIAL_CANVAS_STATE })
})

describe('the takeover view', () => {
  it('opens on the form and closes back to the canvas', () => {
    expect(useSubmitStore.getState().screen).toBe('closed')

    useSubmitStore.getState().open()
    expect(useSubmitStore.getState().screen).toBe('form')

    useSubmitStore.getState().close()
    expect(useSubmitStore.getState().screen).toBe('closed')
  })

  it('clears stale findings when it reopens', () => {
    useSubmitStore.setState({ findings: [{ rule: 'V19', audience: 'client', message: 'stale' }] })

    useSubmitStore.getState().open()
    expect(useSubmitStore.getState().findings).toEqual([])
  })
})

describe('the business name is not copied', () => {
  it('reads it straight off the document, so the two cannot disagree', () => {
    useCanvasStore.getState().updateSiteSettings({ businessName: 'Bluebird Bakery' })

    expect(currentLead(useSubmitStore.getState().contact).businessName).toBe('Bluebird Bakery')
  })
})

describe('refusals happen before anything is rendered', () => {
  it('reports every missing field and stays on the form', async () => {
    useSubmitStore.getState().open()
    await useSubmitStore.getState().send()

    const state = useSubmitStore.getState()
    expect(state.screen).toBe('form')
    expect(state.problems.map((problem) => problem.field)).toEqual([
      'clientName',
      'clientEmail',
      'businessName',
    ])
    expect(state.receipt).toBeNull()
  })

  it('refuses a tripped honeypot without naming a field', async () => {
    useCanvasStore.getState().updateSiteSettings({ businessName: 'Bluebird Bakery' })
    useSubmitStore.getState().setContactField('clientName', 'Dana')
    useSubmitStore.getState().setContactField('clientEmail', 'dana@example.com')
    useSubmitStore.getState().setContactField('quill', 'https://spam.example')

    await useSubmitStore.getState().send()

    const state = useSubmitStore.getState()
    expect(state.refusal).toBe(HONEYPOT_REFUSAL)
    expect(state.problems).toEqual([])
    expect(state.screen).toBe('form')
  })
})

describe('jumping to a block', () => {
  it('opens the page, selects the block and leaves the submit surface', () => {
    const pageId = useCanvasStore.getState().currentPageId
    const blockId = useCanvasStore.getState().addBlock('heading')
    useSubmitStore.getState().open()

    jumpToBlock(pageId, blockId)

    expect(useCanvasStore.getState().currentPageId).toBe(pageId)
    expect(useCanvasStore.getState().selectedBlockId).toBe(blockId)
    expect(useSubmitStore.getState().screen).toBe('closed')
  })

  it('navigates to a page without selecting anything when no block is named', () => {
    const pageId = useCanvasStore.getState().currentPageId
    const blockId = useCanvasStore.getState().addBlock('heading')
    useCanvasStore.getState().selectBlock(blockId)

    jumpToBlock(pageId)

    expect(useCanvasStore.getState().selectedBlockId).toBe(blockId)
    expect(useCanvasStore.getState().currentPageId).toBe(pageId)
  })
})

describe('download again', () => {
  it('does nothing at all when there is no receipt to re-issue', () => {
    expect(() => {
      useSubmitStore.getState().saveAgain()
    }).not.toThrow()
  })
})
