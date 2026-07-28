import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import { DEFAULT_IMAGE_FIT } from '../canvas/imageAssets.ts'
import type { Block } from '../canvas/types.ts'

import { selectCurrentBlocks, useCanvasStore } from './canvasStore.ts'

const store = () => useCanvasStore.getState()
const blockById = (id: string): Block => {
  const found = selectCurrentBlocks(store()).find((block) => block.id === id)
  if (!found) throw new Error(`No block ${id} in the store`)
  return found
}

const PHOTO = 'data:image/jpeg;base64,AAAA'
const OTHER_PHOTO = 'data:image/png;base64,BBBB'

beforeEach(() => {
  store().resetCanvas()
  resetBlockIdSequence()
})

describe('a fresh image block', () => {
  it('starts empty, framed cover, with nothing said about it', () => {
    const id = store().addBlock('image')

    expect(blockById(id)).toMatchObject({
      imageData: '',
      originalFilename: '',
      fit: DEFAULT_IMAGE_FIT,
      description: '',
    })
  })

  it('carries exactly the image fields and no others', () => {
    const id = store().addBlock('image')

    expect(Object.keys(blockById(id)).sort()).toEqual(
      [
        'description',
        'fit',
        'height',
        'id',
        'imageData',
        'originalFilename',
        'text',
        'type',
        'width',
        'x',
        'y',
      ].sort(),
    )
  })
})

describe('setBlockImage', () => {
  it('stores the photo and the name it arrived under', () => {
    const id = store().addBlock('image')

    store().setBlockImage(id, PHOTO, 'golden hour patio.jpg')

    expect(blockById(id)).toMatchObject({
      imageData: PHOTO,
      originalFilename: 'golden hour patio.jpg',
    })
  })

  it('keeps the filename verbatim, spaces and punctuation and all', () => {
    const id = store().addBlock('image')
    const awkward = 'Café “front” (2024)_v2 FINAL.jpg'

    store().setBlockImage(id, PHOTO, awkward)

    expect(blockById(id).originalFilename).toBe(awkward)
  })

  it('replaces a photo without disturbing the description', () => {
    const id = store().addBlock('image')
    store().setBlockImageDescription(id, 'Our dining room at golden hour')
    store().setBlockImage(id, PHOTO, 'first.jpg')

    store().setBlockImage(id, OTHER_PHOTO, 'second.png')

    expect(blockById(id)).toMatchObject({
      imageData: OTHER_PHOTO,
      originalFilename: 'second.png',
      description: 'Our dining room at golden hour',
    })
  })

  it('empties the slot and the filename together, but keeps the description', () => {
    const id = store().addBlock('image')
    store().setBlockImage(id, PHOTO, 'first.jpg')
    store().setBlockImageDescription(id, 'Our storefront')

    store().setBlockImage(id, '')

    expect(blockById(id)).toMatchObject({
      imageData: '',
      originalFilename: '',
      description: 'Our storefront',
    })
  })

  it('is one document change — one undo step per upload', () => {
    const id = store().addBlock('image')
    const before = store().pages

    store().setBlockImage(id, PHOTO, 'a.jpg')

    expect(store().pages).not.toBe(before)
  })

  it('is a no-op when the same photo is set twice', () => {
    const id = store().addBlock('image')
    store().setBlockImage(id, PHOTO, 'a.jpg')
    const before = store().pages

    store().setBlockImage(id, PHOTO, 'a.jpg')

    expect(store().pages).toBe(before)
  })

  it('does nothing to a block that is not an image slot', () => {
    const id = store().addBlock('heading')

    store().setBlockImage(id, PHOTO, 'a.jpg')

    expect(blockById(id).imageData).toBeUndefined()
  })
})

describe('fit and description', () => {
  it('switches the frame between the two the export schema allows', () => {
    const id = store().addBlock('image')

    store().setBlockImageFit(id, 'contain')
    expect(blockById(id).fit).toBe('contain')

    store().setBlockImageFit(id, 'cover')
    expect(blockById(id).fit).toBe('cover')
  })

  it('is a no-op when the fit is already what was asked for', () => {
    const id = store().addBlock('image')
    const before = store().pages

    store().setBlockImageFit(id, DEFAULT_IMAGE_FIT)

    expect(store().pages).toBe(before)
  })

  it('trims a description — trailing whitespace is a slip, not content', () => {
    const id = store().addBlock('image')

    store().setBlockImageDescription(id, '  Our dining room at golden hour  ')

    expect(blockById(id).description).toBe('Our dining room at golden hour')
  })

  it('lets an EMPTY slot carry a description — the "source an image" instruction', () => {
    const id = store().addBlock('image')

    store().setBlockImageDescription(id, 'Photo of our storefront, we take it next week')

    expect(blockById(id)).toMatchObject({
      imageData: '',
      description: 'Photo of our storefront, we take it next week',
    })
  })

  it('does nothing to a block that is not an image slot', () => {
    const id = store().addBlock('text')

    store().setBlockImageFit(id, 'contain')
    store().setBlockImageDescription(id, 'nope')

    expect(blockById(id).fit).toBeUndefined()
    expect(blockById(id).description).toBeUndefined()
  })
})
