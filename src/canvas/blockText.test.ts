import { describe, expect, it } from 'vitest'

import { getBlockTypeDefinition } from '../constants/blockTypes.ts'

import { displayText, isShowingPlaceholder, normaliseBlockText, parseNavItems } from './blockText.ts'
import type { Block } from './types.ts'

function headingWith(text: string): Block {
  return { id: 'b1', type: 'heading', x: 0, y: 0, width: 100, height: 40, text }
}

describe('displayText', () => {
  it('falls back to the type placeholder while the block has no copy', () => {
    expect(displayText(headingWith(''))).toBe(getBlockTypeDefinition('heading').placeholderText)
    expect(displayText(headingWith('   '))).toBe(getBlockTypeDefinition('heading').placeholderText)
  })

  it('shows the client copy once there is some', () => {
    expect(displayText(headingWith('Welcome to BOSS'))).toBe('Welcome to BOSS')
  })
})

describe('isShowingPlaceholder', () => {
  it('is true only while the block text is blank', () => {
    expect(isShowingPlaceholder(headingWith(''))).toBe(true)
    expect(isShowingPlaceholder(headingWith(' \n '))).toBe(true)
    expect(isShowingPlaceholder(headingWith('Hello'))).toBe(false)
  })
})

describe('parseNavItems', () => {
  it('splits a comma-separated label list', () => {
    expect(parseNavItems('Home, About, Contact')).toEqual(['Home', 'About', 'Contact'])
  })

  it('drops empty entries from sloppy typing', () => {
    expect(parseNavItems('Home,,  ,Contact,')).toEqual(['Home', 'Contact'])
  })

  it('returns nothing for an empty string', () => {
    expect(parseNavItems('')).toEqual([])
  })
})

describe('normaliseBlockText', () => {
  it('trims the surrounding whitespace', () => {
    expect(normaliseBlockText('  Hello  ')).toBe('Hello')
  })

  it('keeps the newlines inside multi-line copy', () => {
    expect(normaliseBlockText(' one\ntwo ')).toBe('one\ntwo')
  })
})
