import { describe, expect, it } from 'vitest'

import {
  NEWLINE_GLYPH,
  escapeClientText,
  frameTuple,
  kilobytes,
  num,
  quote,
  quoteFilename,
  quoteTruncated,
} from './text.ts'

/**
 * Appendix A's client-string escaping tests (§3.3 rules 7–8, v2.3): escape-map
 * invertibility, guillemet integrity, quoted-filename integrity, table integrity
 * and no V7 count inflation.
 */

describe('§3.3 rule 7 escaping', () => {
  it('escapes the backslash itself, and does it FIRST so the map stays invertible', () => {
    expect(escapeClientText('a\\b')).toBe('a\\\\b')
    // A client-typed `\«` must not be readable as an escaped guillemet.
    expect(escapeClientText('\\«')).toBe('\\\\\\«')
  })

  it('escapes guillemets, pipe, asterisk, quote and backtick wherever they appear', () => {
    expect(escapeClientText('«x»')).toBe('\\«x\\»')
    expect(escapeClientText('a|b')).toBe('a\\|b')
    expect(escapeClientText('**bold**')).toBe('\\*\\*bold\\*\\*')
    expect(escapeClientText('say "hi"')).toBe('say \\"hi\\"')
    expect(escapeClientText('`code`')).toBe('\\`code\\`')
  })

  it('prefixes a leading #, - or >', () => {
    expect(escapeClientText('# title')).toBe('\\# title')
    expect(escapeClientText('- item')).toBe('\\- item')
    expect(escapeClientText('> quote')).toBe('\\> quote')
  })

  it('escapes the PERIOD of a leading ordered-list marker — 1\\. not \\1. (v2.3)', () => {
    expect(escapeClientText('1. Order now')).toBe('1\\. Order now')
    expect(escapeClientText('12. Order now')).toBe('12\\. Order now')
  })

  it('leaves digits without a period alone', () => {
    expect(escapeClientText('123 Agricola St')).toBe('123 Agricola St')
  })

  it('turns CR, LF and CRLF into the ↵ glyph (rule 8)', () => {
    expect(escapeClientText('a\r\nb')).toBe(`a${NEWLINE_GLYPH}b`)
    expect(escapeClientText('a\nb')).toBe(`a${NEWLINE_GLYPH}b`)
    expect(escapeClientText('a\rb')).toBe(`a${NEWLINE_GLYPH}b`)
  })

  it('stops a client-typed marker from forming the bold token V7 counts', () => {
    expect(escapeClientText('**WRITE THIS COPY**')).toBe('\\*\\*WRITE THIS COPY\\*\\*')
  })

  it('keeps a quoted filename intact when the name contains quotes and a pipe', () => {
    expect(quoteFilename('my "best" photo|final.jpeg')).toBe('"my \\"best\\" photo\\|final.jpeg"')
  })
})

describe('[N5]/[N7] truncation', () => {
  it('leaves 40 characters untouched', () => {
    expect(quoteTruncated('x'.repeat(40))).toBe(`«${'x'.repeat(40)}»`)
  })

  it('truncates 41 and appends the ellipsis', () => {
    expect(quoteTruncated('x'.repeat(41))).toBe(`«${'x'.repeat(40)}…»`)
  })

  it('truncates BEFORE escaping so an escape pair is never cut in half', () => {
    expect(quoteTruncated(`${'x'.repeat(40)}|`)).toBe(`«${'x'.repeat(40)}…»`)
  })
})

describe('quoting and [N11] formatting', () => {
  it('wraps copy in guillemets', () => {
    expect(quote('hello')).toBe('«hello»')
  })

  it('keeps integers integral and rounds to one decimal', () => {
    expect(num(12)).toBe('12')
    expect(num(12.34)).toBe('12.3')
    expect(num(12.35)).toBe('12.4')
    // Math.round is half-up toward +∞, so a negative half rounds toward zero.
    expect(num(-0.26)).toBe('-0.3')
  })

  it('renders the frame tuple V7 anchors on', () => {
    expect(frameTuple({ x: -8, y: 0, w: 1200, h: 64.5 })).toBe('(-8, 0, 1200, 64.5)')
  })

  it('rounds file sizes to whole KB', () => {
    expect(kilobytes(214_733)).toBe('~210 KB')
    expect(kilobytes(1024)).toBe('~1 KB')
  })
})
