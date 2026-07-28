import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { serialiseDocument } from '../canvas/blueprintFile.ts'
import { designFileName } from '../canvas/designFile.ts'
import type { CanvasDocument } from '../canvas/types.ts'
import { createFakeStorage } from '../test/fakeStorage.ts'
import { documentFromTemplate, STARTER_TEMPLATES } from '../templates/index.ts'

import { startCanvasSession, stopCanvasSession } from './canvasSession.ts'
import { getCanvasDocument, useCanvasStore } from './canvasStore.ts'
import {
  cancelPendingImport,
  confirmPendingImport,
  downloadCurrentDesign,
  requestDesignImport,
} from './designFileSession.ts'
import { useEditorStore } from './editorStore.ts'

/**
 * THE FILE ROUTE, END TO END — through the real session wiring, with only the two
 * browser calls faked (`<a download>` and `Blob.text()`, neither of which jsdom
 * has). Everything else here is the shipping code: the same serialiser, the same
 * `parseBlueprint`, the same stores.
 */

const canvas = () => useCanvasStore.getState()
const editor = () => useEditorStore.getState()

/** A `File` whose contents the injected reader returns — jsdom's `text()` is not used. */
const designFile = (name: string, contents: string): File =>
  new File([contents], name, { type: 'application/json' })

const readAs = (contents: string) => () => Promise.resolve(contents)

const restaurant = (): CanvasDocument => {
  const template = STARTER_TEMPLATES[0]
  if (!template) throw new Error('No starter templates')
  return documentFromTemplate(template)
}

beforeEach(() => {
  canvas().resetCanvas()
  useEditorStore.setState({ toast: null, pendingImport: null, startState: 'editing' })
  startCanvasSession({ storage: createFakeStorage(), autosaveDelayMs: 0 })
})

afterEach(() => {
  stopCanvasSession()
})

describe('downloading the design', () => {
  it('writes the SAME payload autosave writes, named after the business', () => {
    canvas().updateSiteSettings({ businessName: 'The Copper Pot' })
    const save = vi.fn()

    const fileName = downloadCurrentDesign(save)

    expect(fileName).toBe('the-copper-pot.blueprint')
    expect(save).toHaveBeenCalledWith('the-copper-pot.blueprint', serialiseDocument(getCanvasDocument()))
  })

  it('still produces a usable file name before the business name is filled in', () => {
    const save = vi.fn()

    expect(downloadCurrentDesign(save)).toBe(designFileName(''))
  })

  it('carries an embedded photo along verbatim', () => {
    const id = canvas().addBlock('image')
    const photo = 'data:image/png;base64,iVBORw0KGgo='
    canvas().setBlockImage(id, photo, 'sign.png')
    const save = vi.fn<(name: string, text: string) => void>()

    downloadCurrentDesign(save)

    expect(save.mock.calls[0]?.[1]).toContain(photo)
  })
})

describe('opening a design file', () => {
  it('restores it deep-equal onto an empty page, with no confirmation needed', async () => {
    const original = restaurant()

    await requestDesignImport(
      designFile('site.blueprint', serialiseDocument(original)),
      readAs(serialiseDocument(original)),
    )

    expect(getCanvasDocument()).toEqual(original)
    expect(editor().pendingImport).toBeNull()
    expect(editor().toast).toContain('Opened “site.blueprint”')
  })

  it('round-trips a design with a photo in it', async () => {
    const id = canvas().addBlock('image')
    canvas().setBlockImage(id, 'data:image/png;base64,iVBORw0KGgo=', 'sign.png')
    const saved = serialiseDocument(getCanvasDocument())
    const original = getCanvasDocument()

    canvas().resetCanvas()
    await requestDesignImport(designFile('photo.blueprint', saved), readAs(saved))

    expect(getCanvasDocument()).toEqual(original)
  })

  it('is the starting point, not an undo step', async () => {
    const saved = serialiseDocument(restaurant())

    await requestDesignImport(designFile('site.blueprint', saved), readAs(saved))

    // Ctrl+Z straight after opening must not silently restore what it replaced.
    expect(editor().history.past).toHaveLength(0)
  })

  it('migrates a schema-1 file through the file route, and says it did', async () => {
    const legacy = JSON.stringify({
      schemaVersion: 1,
      blocks: [{ id: 'old-1', type: 'heading', x: 80, y: 120, width: 640, height: 72, text: 'Hi' }],
    })

    await requestDesignImport(designFile('old.blueprint', legacy), readAs(legacy))

    expect(getCanvasDocument().pages).toHaveLength(1)
    expect(getCanvasDocument().pages[0]?.blocks[0]).toMatchObject({ id: 'old-1', text: 'Hi' })
    expect(editor().toast).toContain('brought it up to date')
  })

  it('leaves the picker behind — an opened design is a design', async () => {
    useEditorStore.setState({ startState: 'picker' })
    const saved = serialiseDocument(restaurant())

    await requestDesignImport(designFile('site.blueprint', saved), readAs(saved))

    expect(editor().startState).toBe('editing')
  })
})

describe('opening over work that is already there', () => {
  const saved = () => serialiseDocument(restaurant())

  beforeEach(() => {
    canvas().addBlock('heading')
  })

  it('asks first, and touches nothing until the answer comes', async () => {
    const before = canvas().pages

    await requestDesignImport(designFile('site.blueprint', saved()), readAs(saved()))

    expect(editor().pendingImport).toMatchObject({ fileName: 'site.blueprint' })
    // Identity, not equality: the document was never replaced at all.
    expect(canvas().pages).toBe(before)
  })

  it('opens it on yes', async () => {
    await requestDesignImport(designFile('site.blueprint', saved()), readAs(saved()))

    confirmPendingImport()

    expect(getCanvasDocument()).toEqual(restaurant())
    expect(editor().pendingImport).toBeNull()
  })

  it('changes nothing on no', async () => {
    const before = canvas().pages
    await requestDesignImport(designFile('site.blueprint', saved()), readAs(saved()))

    cancelPendingImport()

    expect(canvas().pages).toBe(before)
    expect(editor().pendingImport).toBeNull()
  })

  it('does not ask about a file it is going to refuse anyway', async () => {
    await requestDesignImport(designFile('broken.blueprint', '{'), readAs('{'))

    expect(editor().pendingImport).toBeNull()
    expect(editor().toast).toContain("couldn't open")
  })
})

describe('files we will not open', () => {
  it('says so, and leaves the design exactly as it was', async () => {
    canvas().addBlock('heading')
    const before = canvas().pages

    await requestDesignImport(designFile('broken.blueprint', 'nope'), readAs('nope'))

    expect(canvas().pages).toBe(before)
    expect(editor().toast).toContain('exactly as you left it')
  })

  it('refuses a file that is not a design without reading it', async () => {
    const read = vi.fn(readAs('anything'))

    await requestDesignImport(designFile('holiday.jpg', 'binary'), read)

    expect(read).not.toHaveBeenCalled()
    expect(editor().toast).toContain('holiday.jpg')
  })

  it('survives the browser refusing to hand the file over', async () => {
    await requestDesignImport(designFile('site.blueprint', 'x'), () =>
      Promise.reject(new Error('NotReadableError')),
    )

    expect(editor().toast).toContain("couldn't read that file")
  })

  it('does nothing at all when no file was chosen', async () => {
    await requestDesignImport(null)

    expect(editor().toast).toBeNull()
  })
})
