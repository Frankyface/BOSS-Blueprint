import { describe, expect, it } from 'vitest'

import { BLUEBIRD_SUBMISSION } from '../../test/exportFixtures.ts'

import { MAX_MAILTO_URL_LENGTH, mailtoHref, mailtoSubject, type MailtoInput } from './mailto.ts'

/** Step 2 of the completion UX. Pure strings — no mail client in sight. */

const input = (overrides: Partial<MailtoInput> = {}): MailtoInput => ({
  to: 'hello@example.com',
  businessName: 'Bluebird Bakery',
  submissionId: BLUEBIRD_SUBMISSION.id,
  packageFileName: 'blueprint_bluebird-bakery_3f2a9c1e.zip',
  pageCount: 2,
  clientName: 'Dana Whitfield',
  ...overrides,
})

const decodedBody = (href: string): string =>
  decodeURIComponent(new URL(href).searchParams.get('body') ?? '')

const decodedSubject = (href: string): string =>
  decodeURIComponent(new URL(href).searchParams.get('subject') ?? '')

describe('subject', () => {
  it('carries the business name and the uuid8', () => {
    expect(mailtoSubject(input())).toBe('Website sketch — Bluebird Bakery (3f2a9c1e)')
  })
})

describe('href', () => {
  it('is a real mailto: with an unescaped address', () => {
    expect(mailtoHref(input()).startsWith('mailto:hello@example.com?')).toBe(true)
  })

  it('names the exact file to attach', () => {
    expect(decodedBody(mailtoHref(input()))).toContain('blueprint_bluebird-bakery_3f2a9c1e.zip')
  })

  it('encodes spaces, ampersands and newlines', () => {
    const href = mailtoHref(input({ businessName: 'Salt & Sons' }))

    expect(href).not.toMatch(/[ \n]/)
    expect(href).toContain('%20')
    expect(href).toContain('%0A')
    expect(decodedSubject(href)).toContain('Salt & Sons')
  })

  it('survives guillemets and accents', () => {
    const href = mailtoHref(input({ businessName: '«Café Ürsula»' }))

    expect(decodedSubject(href)).toContain('«Café Ürsula»')
    expect(decodedBody(href)).toContain('«Café Ürsula»')
  })

  it('singularises a one-page site', () => {
    expect(decodedBody(mailtoHref(input({ pageCount: 1 })))).toContain('Pages: 1 page')
    expect(decodedBody(mailtoHref(input({ pageCount: 4 })))).toContain('Pages: 4 pages')
  })

  it('stays under the named cap even for an absurd business name', () => {
    const href = mailtoHref(input({ businessName: 'Ā'.repeat(600) }))

    expect(href.length).toBeLessThanOrEqual(MAX_MAILTO_URL_LENGTH)
    expect(decodedBody(href)).toContain('blueprint_bluebird-bakery_3f2a9c1e.zip')
  })

  it('trims the body from the end, keeping the file name', () => {
    const href = mailtoHref(input(), 320)

    expect(href.length).toBeLessThanOrEqual(320)
    expect(decodedBody(href)).toContain('blueprint_bluebird-bakery_3f2a9c1e.zip')
  })
})
