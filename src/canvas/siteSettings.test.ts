import { describe, expect, it } from 'vitest'

import {
  applySettingsPatch,
  emptySiteSettings,
  isEmptySiteSettings,
  isHexColor,
  isVibeId,
  normaliseHexColor,
  parseSiteSettings,
  SITE_COLOR_LIMIT,
  siteSettingsEqual,
  VIBE_HINTS,
  VIBE_OPTIONS,
  withColorAt,
  withColorRemoved,
} from './siteSettings.ts'

describe('the vibe pick-list', () => {
  /**
   * `docs/export-format.md` §2.4 makes the schema's `vibe` enum the source of
   * truth for this list. If the schema ever grows a value, this test is the thing
   * that fails until the UI list grows with it.
   */
  it('is exactly the export schema enum, in the schema\'s own order', () => {
    expect(VIBE_OPTIONS).toEqual(['modern', 'classic', 'playful', 'bold', 'warm'])
  })

  it('explains every option to a non-designer', () => {
    for (const vibe of VIBE_OPTIONS) {
      expect(VIBE_HINTS[vibe].length).toBeGreaterThan(0)
    }
  })

  it('recognises only those values', () => {
    expect(isVibeId('warm')).toBe(true)
    expect(isVibeId('spooky')).toBe(false)
    expect(isVibeId(null)).toBe(false)
  })
})

describe('colours', () => {
  it('accepts six-digit hex only', () => {
    expect(isHexColor('#2f6f4f')).toBe(true)
    expect(isHexColor('  #2F6F4F ')).toBe(true)
    expect(isHexColor('#2f6')).toBe(false)
    expect(isHexColor('sage green')).toBe(false)
    expect(isHexColor('2f6f4f')).toBe(false)
  })

  it('stores one spelling, so two cases are never two colours', () => {
    expect(normaliseHexColor('#2F6F4F')).toBe('#2f6f4f')
    expect(normaliseHexColor('nope')).toBeNull()
  })

  it('fills the slots in order and replaces in place', () => {
    const first = withColorAt(emptySiteSettings(), 0, '#111111')
    const second = withColorAt(first, 1, '#222222')

    expect(second.colors).toEqual(['#111111', '#222222'])
    expect(withColorAt(second, 0, '#333333').colors).toEqual(['#333333', '#222222'])
  })

  it('refuses a gap, an invalid colour and a fourth slot', () => {
    const settings = withColorAt(emptySiteSettings(), 0, '#111111')

    expect(withColorAt(settings, 2, '#222222')).toBe(settings)
    expect(withColorAt(settings, 0, 'sage')).toBe(settings)
    expect(withColorAt(settings, SITE_COLOR_LIMIT, '#222222')).toBe(settings)
    expect(withColorAt(settings, -1, '#222222')).toBe(settings)
  })

  it('removes a colour and closes the gap', () => {
    const settings = withColorAt(withColorAt(emptySiteSettings(), 0, '#111111'), 1, '#222222')

    expect(withColorRemoved(settings, 0).colors).toEqual(['#222222'])
    expect(withColorRemoved(settings, 9)).toBe(settings)
  })

  it('caps at the three the export allows', () => {
    expect(SITE_COLOR_LIMIT).toBe(3)
  })
})

describe('patching', () => {
  it('changes only the fields named', () => {
    const patched = applySettingsPatch(emptySiteSettings(), { businessName: 'BOSS' })

    expect(patched.businessName).toBe('BOSS')
    expect(patched.tagline).toBe('')
  })

  it('knows an untouched settings object from a filled one', () => {
    expect(isEmptySiteSettings(emptySiteSettings())).toBe(true)
    expect(isEmptySiteSettings(applySettingsPatch(emptySiteSettings(), { vibe: 'warm' }))).toBe(
      false,
    )
  })

  it('compares by value, because the panel rebuilds the object on every commit', () => {
    expect(siteSettingsEqual(emptySiteSettings(), emptySiteSettings())).toBe(true)
    expect(
      siteSettingsEqual(
        withColorAt(emptySiteSettings(), 0, '#111111'),
        withColorAt(emptySiteSettings(), 0, '#111111'),
      ),
    ).toBe(true)
    expect(
      siteSettingsEqual(emptySiteSettings(), withColorAt(emptySiteSettings(), 0, '#111111')),
    ).toBe(false)
  })
})

describe('parseSiteSettings', () => {
  it('treats a missing settings block as empty rather than corrupt', () => {
    expect(parseSiteSettings(undefined)).toEqual(emptySiteSettings())
    expect(parseSiteSettings(null)).toEqual(emptySiteSettings())
  })

  it('reads every field back', () => {
    const stored = {
      businessName: "Martina's",
      tagline: 'Slow food',
      about: 'A trattoria.',
      vibe: 'warm',
      styleNotes: 'White space',
      colors: ['#2F6F4F'],
    }

    expect(parseSiteSettings(stored)).toEqual({ ...stored, colors: ['#2f6f4f'] })
  })

  it.each([
    ['not an object', 'BOSS'],
    ['a non-string name', { businessName: 3 }],
    ['an unknown vibe', { vibe: 'spooky' }],
    ['colours that are not a list', { colors: '#111111' }],
    ['a colour that is not hex', { colors: ['#11'] }],
    ['a colour that is not a string', { colors: [3] }],
    ['four colours', { colors: ['#111111', '#222222', '#333333', '#444444'] }],
  ])('refuses settings with %s', (_label, value) => {
    expect(parseSiteSettings(value)).toBeNull()
  })

  it('accepts a null vibe, which is what "not sure yet" serialises as', () => {
    expect(parseSiteSettings({ vibe: null })).toEqual(emptySiteSettings())
  })
})
