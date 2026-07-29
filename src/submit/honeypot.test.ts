import { describe, expect, it } from 'vitest'

import { BOSS_SUBMIT_EMAIL } from '../../site.config.ts'

import {
  EMPTY_LEAD,
  HONEYPOT_REFUSAL,
  isHoneypotTripped,
  LEAD_MESSAGES,
  leadProblems,
  normalizeLead,
  type LeadDetails,
} from './form.ts'

/**
 * THE LEAD GATE. The honeypot blocking is deliberate
 * (`docs/roundtrip-protocol.md` §1.4 rule 4 — the scripted client is required to
 * leave it alone and the harness relies on filling it being fatal), which is
 * exactly why the refusal still has to hand over an address.
 */

const valid: LeadDetails = {
  clientName: 'Dana Whitfield',
  clientEmail: 'dana@bluebirdbakery.ca',
  businessName: 'Bluebird Bakery',
  quill: '',
}

describe('the honeypot', () => {
  it('refuses a non-empty field', () => {
    expect(isHoneypotTripped({ ...valid, quill: 'https://spam.example' })).toBe(true)
    expect(isHoneypotTripped({ ...valid, quill: '   ' })).toBe(false)
  })

  it('lets an untouched field through', () => {
    expect(isHoneypotTripped(valid)).toBe(false)
    expect(isHoneypotTripped(EMPTY_LEAD)).toBe(false)
  })

  it('still hands over the address, so a false positive is never a dead end', () => {
    expect(HONEYPOT_REFUSAL).toContain(BOSS_SUBMIT_EMAIL)
  })
})

describe('the three required fields', () => {
  it('accepts a complete lead', () => {
    expect(leadProblems(valid)).toEqual([])
  })

  it('names every missing field at once', () => {
    expect(leadProblems(EMPTY_LEAD).map((problem) => problem.field)).toEqual([
      'clientName',
      'clientEmail',
      'businessName',
    ])
  })

  it('enforces the business name HERE, not while sketching', () => {
    const problems = leadProblems({ ...valid, businessName: '   ' })

    expect(problems).toEqual([{ field: 'businessName', message: LEAD_MESSAGES.businessName }])
  })

  it('distinguishes a missing email from a malformed one', () => {
    expect(leadProblems({ ...valid, clientEmail: '' })[0]?.message).toBe(LEAD_MESSAGES.clientEmail)
    expect(leadProblems({ ...valid, clientEmail: 'dana at bakery' })[0]?.message).toBe(
      LEAD_MESSAGES.clientEmailShape,
    )
    expect(leadProblems({ ...valid, clientEmail: 'dana@bakery' })[0]?.message).toBe(
      LEAD_MESSAGES.clientEmailShape,
    )
  })
})

describe('normalizeLead', () => {
  it('trims what goes into site.json, and leaves the honeypot alone', () => {
    const normalized = normalizeLead({
      clientName: '  Dana  ',
      clientEmail: ' dana@bluebirdbakery.ca ',
      businessName: '  Bluebird Bakery ',
      quill: ' bot ',
    })

    expect(normalized).toEqual({
      clientName: 'Dana',
      clientEmail: 'dana@bluebirdbakery.ca',
      businessName: 'Bluebird Bakery',
      quill: ' bot ',
    })
    expect(isHoneypotTripped(normalized)).toBe(true)
  })
})
