import { describe, expect, it } from 'vitest'

import { BOSS_RELAY } from '../../../site.config.ts'

import { isRelayReady, isRelayTouched, relayConfigProblems, type RelayConfig } from './relayConfig.ts'

/**
 * THE GATE. The load-bearing assertion in this file is the first one: the config
 * this repo SHIPS is untouched, so the app binds the Stage 3 stub and makes no
 * request. Everything the live gauntlet, the round-trip runs and the Stage 3 DoD
 * proved about the no-relay path stays true because of it.
 */

const READY: RelayConfig = {
  endpoint: 'https://api.example.com/submit',
  credential: 'public-form-key',
}

describe('the shipped config', () => {
  it('is OFF — no endpoint, no key', () => {
    expect(BOSS_RELAY.endpoint).toBe('')
    expect(BOSS_RELAY.credential).toBe('')
    expect(isRelayTouched(BOSS_RELAY)).toBe(false)
    expect(isRelayReady(BOSS_RELAY)).toBe(false)
  })
})

describe('isRelayTouched', () => {
  it('is false only when BOTH strings are blank', () => {
    expect(isRelayTouched({ endpoint: '', credential: '' })).toBe(false)
    expect(isRelayTouched({ endpoint: '   ', credential: '  ' })).toBe(false)
    expect(isRelayTouched({ endpoint: 'https://api.example.com/x', credential: '' })).toBe(true)
    expect(isRelayTouched({ endpoint: '', credential: 'key' })).toBe(true)
  })
})

describe('relayConfigProblems', () => {
  it('passes a well-formed config', () => {
    expect(relayConfigProblems(READY)).toEqual([])
    expect(isRelayReady(READY)).toBe(true)
  })

  it('names an endpoint that is not an absolute URL', () => {
    const problems = relayConfigProblems({ ...READY, endpoint: 'api.example.com/submit' })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('not an absolute URL')
  })

  it('refuses http to a real host, because an https page could never call it', () => {
    const problems = relayConfigProblems({ ...READY, endpoint: 'http://api.example.com/submit' })

    expect(problems[0]).toContain('must use https')
  })

  it('allows http to localhost — the seam the E2E points the real adapter at', () => {
    expect(relayConfigProblems({ ...READY, endpoint: 'http://127.0.0.1:4173/x' })).toEqual([])
    expect(relayConfigProblems({ ...READY, endpoint: 'http://localhost:4173/x' })).toEqual([])
  })

  it('catches a blank key when the provider expects one', () => {
    const problems = relayConfigProblems({ ...READY, credential: '  ' })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('access_key')
  })

  it('accepts a blank key when the provider names no credential field', () => {
    const fields = {
      credential: '',
      subject: 'subject',
      name: 'name',
      email: 'email',
      message: 'message',
      honeypot: '',
    }

    expect(relayConfigProblems({ endpoint: READY.endpoint, credential: '', fields })).toEqual([])
  })

  it('reports every problem at once, so one look fixes the paste', () => {
    expect(relayConfigProblems({ endpoint: 'nonsense', credential: '' })).toHaveLength(2)
  })

  it('rejects a nonsensical byte budget', () => {
    expect(relayConfigProblems({ ...READY, limitBytes: 0 })[0]).toContain('positive number')
    expect(relayConfigProblems({ ...READY, limitBytes: Number.NaN })[0]).toContain('positive number')
  })

  it('refuses a config that would send an empty notification', () => {
    const fields = {
      credential: 'access_key',
      subject: 'subject',
      name: 'name',
      email: 'email',
      message: '',
      honeypot: 'botcheck',
    }

    expect(relayConfigProblems({ ...READY, fields })[0]).toContain('no body')
  })
})
