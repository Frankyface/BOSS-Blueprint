import { beforeEach, describe, expect, it } from 'vitest'

import { isFromTemplate, navItemsOf } from '../canvas/blockEdits.ts'
import type { Block } from '../canvas/types.ts'
import { documentFromTemplate, STARTER_TEMPLATES } from '../templates/index.ts'

import { selectCurrentBlocks, useCanvasStore } from './canvasStore.ts'

/**
 * THE TEMPLATE FLAG, END TO END THROUGH THE STORE.
 *
 * The rule, from the binding package contract (`docs/export-format.md` §2.6, and
 * docs/decisions.md 2026-07-28 "Template guardrails" / "Export format v2.3"):
 *
 *  · `fromTemplate: true` means "the client never touched this block's CONTENT".
 *  · Editing content clears it. MOVING AND RESIZING DO NOT — dragging our example
 *    heading somewhere else does not make its words the client's words, and a
 *    brief that stopped calling it filler because the box moved would mislead the
 *    builder.
 *  · Only content-bearing types carry it at all; section bands never do.
 *
 * These tests exist because the clearing lives in ONE place (`withUpdatedBlock`),
 * and a future action that bypassed it would silently leak template filler into a
 * client's Stage 3 brief with no visible symptom.
 */

const store = () => useCanvasStore.getState()
const blocks = () => selectCurrentBlocks(store())

const blockById = (id: string): Block => {
  const found = blocks().find((block) => block.id === id)
  if (!found) throw new Error(`No block ${id} in the store`)
  return found
}

/** Load the Restaurant template and hand back a few blocks worth editing. */
function loadRestaurant(): void {
  const template = STARTER_TEMPLATES.find((candidate) => candidate.id === 'restaurant')
  if (!template) throw new Error('The restaurant template is missing')
  store().replaceDocument(documentFromTemplate(template))
}

const HERO_TITLE = 'rest-home-hero-title'
const HERO_CTA = 'rest-home-hero-cta'
const HERO_PHOTO = 'rest-home-hero-photo'
const HOME_NAV = 'rest-home-nav'
const ABOUT_BODY = 'rest-home-about-body'

beforeEach(() => {
  store().resetCanvas()
})

describe('loading a template', () => {
  it('lands on the template\'s own first page, with every content block flagged', () => {
    loadRestaurant()

    expect(store().pages.map((page) => page.id)).toEqual(['home', 'menu', 'visit'])
    expect(store().currentPageId).toBe('home')

    const all = store().pages.flatMap((page) => page.blocks)
    expect(all.filter((block) => block.type !== 'section').every(isFromTemplate)).toBe(true)
    // Bands never carry it: nothing about a band can be edited, so the flag could
    // never clear and the untouched-filler warning would be permanent (§2.6 v2.3).
    expect(all.some((block) => block.type === 'section')).toBe(true)
    expect(all.filter((block) => block.type === 'section').some(isFromTemplate)).toBe(false)
  })

  it('seeds no business name, whatever else the template fills in', () => {
    loadRestaurant()

    expect(store().siteSettings.businessName).toBe('')
    expect(store().siteSettings.vibe).toBe('warm')
  })
})

describe('editing a template block', () => {
  beforeEach(loadRestaurant)

  it('clears the flag when the client retypes the words', () => {
    store().setBlockText(HERO_TITLE, 'The Copper Pot')

    expect(isFromTemplate(blockById(HERO_TITLE))).toBe(false)
    expect(blockById(HERO_TITLE).text).toBe('The Copper Pot')
    // Only that block: its neighbours are still our example copy.
    expect(isFromTemplate(blockById(HERO_CTA))).toBe(true)
  })

  it.each([
    ['a copy mode switch', () => { store().setBlockCopyMode(ABOUT_BODY, 'real') }],
    ['a generate description', () => { store().setBlockGenerateDescription(ABOUT_BODY, 'Ours') }],
    ['a length hint', () => { store().setBlockLengthHint(ABOUT_BODY, '2 sentences') }],
  ])('clears the flag on %s', (_label, act) => {
    act()

    expect(isFromTemplate(blockById(ABOUT_BODY))).toBe(false)
  })

  it('clears the flag when a photo goes into a seeded slot', () => {
    store().setBlockImage(HERO_PHOTO, 'data:image/png;base64,AAA', 'dining-room.png')

    expect(isFromTemplate(blockById(HERO_PHOTO))).toBe(false)
  })

  it('clears the flag when the client re-points a seeded button', () => {
    store().setBlockLink(HERO_CTA, { kind: 'external', url: 'https://boss.test' })

    expect(isFromTemplate(blockById(HERO_CTA))).toBe(false)
  })

  it('clears the flag when the client renames one menu item', () => {
    const itemId = navItemsOf(blockById(HOME_NAV))[1]?.id ?? ''

    store().setNavItemLabel(HOME_NAV, itemId, 'Our food')

    expect(isFromTemplate(blockById(HOME_NAV))).toBe(false)
  })

  /**
   * The rest of the content actions, which reach the same one clearing point
   * (`withUpdatedBlock`) — listed out because "they all funnel through one path"
   * is exactly the kind of claim that stops being true without anyone noticing
   * (batch-3 review LOW).
   */
  const firstNavItemId = () => navItemsOf(blockById(HOME_NAV))[0]?.id ?? ''

  it.each([
    ['a photo fit change', HERO_PHOTO, () => { store().setBlockImageFit(HERO_PHOTO, 'contain') }],
    [
      'a photo description',
      HERO_PHOTO,
      () => { store().setBlockImageDescription(HERO_PHOTO, 'Mum at the comal') },
    ],
    ['a menu item added', HOME_NAV, () => { store().addNavItem(HOME_NAV, 'Specials') }],
    ['a menu item removed', HOME_NAV, () => { store().removeNavItem(HOME_NAV, firstNavItemId()) }],
    [
      'a menu item re-pointed',
      HOME_NAV,
      () => {
        store().setNavItemLink(HOME_NAV, firstNavItemId(), {
          kind: 'external',
          url: 'https://boss.test',
        })
      },
    ],
  ])('clears the flag on %s', (_label, id, act) => {
    expect(isFromTemplate(blockById(id))).toBe(true)

    act()

    expect(isFromTemplate(blockById(id))).toBe(false)
  })
})

describe('what does NOT count as making a block your own', () => {
  beforeEach(loadRestaurant)

  it.each([
    ['moving it', (id: string) => { store().moveBlockBy(id, 40, 0) }],
    ['resizing it', (id: string) => { store().resizeBlockBy(id, 'se', 40, 40) }],
  ])('keeps the flag through %s — the words are still ours (§2.6)', (_label, act) => {
    act(HERO_TITLE)

    const moved = blockById(HERO_TITLE)
    expect(isFromTemplate(moved)).toBe(true)
    // The geometry really did change; only the flag survived.
    expect(moved.x + moved.width).not.toBe(704 + 80)
  })

  it('keeps the flag through a pure z-order change', () => {
    store().bringBlockForward(HERO_PHOTO)
    store().sendBlockBackward(HERO_TITLE)

    expect(isFromTemplate(blockById(HERO_PHOTO))).toBe(true)
    expect(isFromTemplate(blockById(HERO_TITLE))).toBe(true)
  })

  it('keeps the flag through a no-op edit that changes nothing', () => {
    const before = blockById(HERO_TITLE)

    store().setBlockText(HERO_TITLE, before.text)
    store().moveBlockBy(HERO_TITLE, 0, 0)

    expect(blockById(HERO_TITLE)).toBe(before)
    expect(isFromTemplate(blockById(HERO_TITLE))).toBe(true)
  })

  it('never flags a band, however the client edits one', () => {
    const bandId = 'rest-home-hero-band'

    store().moveBlockBy(bandId, 0, 8)
    store().resizeBlockBy(bandId, 'se', 0, 40)

    expect(isFromTemplate(blockById(bandId))).toBe(false)
    expect('fromTemplate' in blockById(bandId)).toBe(false)
  })

  it('keeps the flag through selecting, page switching and site settings', () => {
    store().selectBlock(HERO_TITLE)
    store().setCurrentPage('menu')
    store().updateSiteSettings({ businessName: 'The Copper Pot' })
    store().setCurrentPage('home')

    expect(isFromTemplate(blockById(HERO_TITLE))).toBe(true)
  })

  it('carries the flag onto a duplicated page — the copy is still our words', () => {
    const copyId = store().duplicatePage('home')

    const copied = store().pages.find((page) => page.id === copyId)
    const content = copied?.blocks.filter((block) => block.type !== 'section') ?? []
    expect(content.length).toBeGreaterThan(0)
    expect(content.every(isFromTemplate)).toBe(true)
  })
})

describe('a hand-placed block', () => {
  it('is never flagged, whichever type it is', () => {
    const ids = ['section', 'heading', 'text', 'image', 'button', 'nav-bar'].map((type) =>
      store().addBlock(type as Block['type']),
    )

    for (const id of ids) expect(isFromTemplate(blockById(id))).toBe(false)
  })
})
