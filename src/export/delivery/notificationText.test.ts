import { describe, expect, it } from 'vitest'

import { BLUEBIRD_SUBMISSION, bluebirdDocument } from '../../test/exportFixtures.ts'
import { generateBrief } from '../brief/generateBrief.ts'
import { buildSiteJson } from '../siteJson.ts'
import { finding, type Finding } from '../validate/types.ts'

import {
  BRIEF_MARKER,
  MAX_SUBJECT_LENGTH,
  notificationBody,
  notificationSubject,
  SITE_JSON_MARKER,
} from './notificationText.ts'
import {
  buildNotificationPayload,
  demoteNotificationPayload,
  type NotificationPayload,
} from './payload.ts'

/** What Cam actually reads in an inbox. */

const site = buildSiteJson(bluebirdDocument(), BLUEBIRD_SUBMISSION)

const warnings: Finding[] = [
  finding('V15', 'WARN', 'client', 'Nothing links to "Contact".', ['pg_0002']),
  finding('V23', 'WARN', 'client', 'Some template placeholder text is still there.', ['blk_0004']),
]

const HUGE = 10_000_000

function full(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  const built = buildNotificationPayload(
    {
      site,
      brief: generateBrief(site),
      packageFileName: 'blueprint_bluebird-bakery_3f2a9c1e.zip',
      packageBytes: 240_000,
      warnings,
    },
    HUGE,
  )
  return { ...built, ...overrides }
}

describe('the subject', () => {
  it('names the business and ends with the reference', () => {
    expect(notificationSubject(full())).toBe('BOSS Blueprint — Bluebird Bakery — 3f2a9c1e')
  })

  it('keeps the reference intact when a business name is absurdly long', () => {
    const subject = notificationSubject(full({ businessName: 'B'.repeat(400) }))

    expect(subject.length).toBeLessThanOrEqual(MAX_SUBJECT_LENGTH)
    expect(subject.endsWith('— 3f2a9c1e')).toBe(true)
  })

  it('still says something when the business name is blank', () => {
    expect(notificationSubject(full({ businessName: '  ' }))).toBe(
      'BOSS Blueprint — a new sketch — 3f2a9c1e',
    )
  })
})

describe('the body', () => {
  it('leads with the identity block', () => {
    const body = notificationBody(full())

    expect(body).toContain('Client:    Dana Whitfield <dana@bluebirdbakery.ca>')
    expect(body).toContain('Business:  Bluebird Bakery')
    expect(body).toContain(`Reference: 3f2a9c1e  (submission ${BLUEBIRD_SUBMISSION.id})`)
    expect(body).toContain('Pages:     2')
    expect(body).toContain('Package:   blueprint_bluebird-bakery_3f2a9c1e.zip (~234 KB)')
  })

  it('says plainly that it is not the package', () => {
    expect(notificationBody(full())).toContain('This is a heads-up, not the package itself.')
  })

  it('lists the warnings by rule', () => {
    const body = notificationBody(full())

    expect(body).toContain('- [V15] Nothing links to "Contact".')
    expect(body).toContain('- [V23] Some template placeholder text is still there.')
  })

  it('says so when there are none', () => {
    expect(notificationBody(full({ warnings: [] }))).toContain('No warnings.')
  })

  it('carries the brief and the gzipped site.json behind labelled markers', () => {
    const body = notificationBody(full())

    expect(body).toContain(BRIEF_MARKER)
    expect(body).toContain('## Your role')
    expect(body).toContain(SITE_JSON_MARKER)
  })

  it('drops the brief but keeps the JSON on the compressed rung', () => {
    const body = notificationBody(demoteNotificationPayload(full(), 'compressed'))

    expect(body).not.toContain(BRIEF_MARKER)
    expect(body).toContain(SITE_JSON_MARKER)
  })

  it('tells Cam where to find them on the bottom rung', () => {
    const body = notificationBody(demoteNotificationPayload(full(), 'metadata-only'))

    expect(body).not.toContain(BRIEF_MARKER)
    expect(body).not.toContain(SITE_JSON_MARKER)
    expect(body).toContain('too large for this notification')
    // The identity block is still all there — that is the point of the rung.
    expect(body).toContain('Dana Whitfield')
    expect(body).toContain('3f2a9c1e')
  })
})
