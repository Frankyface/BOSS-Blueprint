import { hexForColorName } from './colorNames.ts'
import type { SiteSettings, VibeId } from './types.ts'

/**
 * SITE SETTINGS — the site-wide facts the layout cannot express.
 *
 * The vibe pick-list is NOT invented here: it is exactly the `vibe` enum of the
 * export schema in `docs/export-format.md` §2.2 (`siteSettings.vibe`), which §2.4
 * names as the source of truth for this list ("the Stage 2 settings panel offers
 * exactly these values; extending the list means extending this enum first").
 * Drift between the two would fail export validation, so the order and spelling
 * below are copied from the schema verbatim.
 */
export const VIBE_OPTIONS: readonly VibeId[] = ['modern', 'classic', 'playful', 'bold', 'warm']

/** Plain-English gloss for each vibe, so a non-designer can pick with confidence. */
export const VIBE_HINTS: Readonly<Record<VibeId, string>> = {
  modern: 'Clean lines, lots of space',
  classic: 'Traditional and trustworthy',
  playful: 'Friendly, colourful, informal',
  bold: 'Big type, strong contrast',
  warm: 'Soft, welcoming, personal',
}

/** `docs/export-format.md` §2.4: `colors` is 0–3 hex strings, in preference order. */
export const SITE_COLOR_LIMIT = 3

/** The export schema's own colour rule (`"pattern": "^#[0-9a-fA-F]{6}$"`). */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

/** The three-digit shorthand every browser accepts: `#abc` means `#aabbcc`. */
const SHORT_HEX_PATTERN = /^#[0-9a-fA-F]{3}$/

export const COLOR_HINT =
  'Try a colour name like "dark green", or a code like #2f6f4f'

export function emptySiteSettings(): SiteSettings {
  return { businessName: '', tagline: '', about: '', vibe: null, styleNotes: '', colors: [] }
}

/**
 * Stored lower-case so two spellings of the same colour never read as two colours.
 *
 * STRICT ON PURPOSE — this is the FILE boundary (a stored design, an opened
 * `.blueprint`), where the export contract's six-digit hex is the whole of the
 * agreement and anything else means the payload cannot be trusted. What a person
 * may TYPE is a different, wider question; that is `parseColorInput`.
 */
export function normaliseHexColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : null
}

/**
 * WHAT A CLIENT MAY TYPE INTO A COLOUR FIELD, normalised to the one thing the
 * document stores: six-digit lower-case hex.
 *
 * Three forms in, one form out (UX audit POLISH-4): a CSS colour name ("red",
 * "DARKGREEN", "dark green"), the three-digit hex shorthand (`#abc`), or the full
 * six-digit code. `null` means "that is not a colour we recognise", which the field
 * says out loud rather than storing a guess.
 *
 * Nothing downstream changes: the store, the autosave, the `.blueprint` file and
 * the export all still see hex and only hex.
 */
export function parseColorInput(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  if (trimmed.length === 0) return null

  if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed

  if (SHORT_HEX_PATTERN.test(trimmed)) {
    const digits = trimmed.slice(1)
    return `#${[...digits].map((digit) => `${digit}${digit}`).join('')}`
  }

  return hexForColorName(trimmed)
}

export function isVibeId(value: unknown): value is VibeId {
  return typeof value === 'string' && (VIBE_OPTIONS as readonly string[]).includes(value)
}

/**
 * The fields a settings edit may touch. Everything is optional — the panel commits
 * one field at a time (one undo step per field, never one per keystroke).
 */
export type SiteSettingsPatch = Partial<SiteSettings>

export function applySettingsPatch(
  settings: SiteSettings,
  patch: SiteSettingsPatch,
): SiteSettings {
  return { ...settings, ...patch }
}

/**
 * Replace the colour in `index`, or append when the slot is one past the end.
 * Takes anything a client can type (`parseColorInput`) and stores hex.
 */
export function withColorAt(
  settings: SiteSettings,
  index: number,
  color: string,
): SiteSettings {
  const normalised = parseColorInput(color)
  if (normalised === null) return settings
  if (index < 0 || index > settings.colors.length || index >= SITE_COLOR_LIMIT) return settings

  const colors = settings.colors.slice()
  colors[index] = normalised
  return { ...settings, colors }
}

export function withColorRemoved(settings: SiteSettings, index: number): SiteSettings {
  if (index < 0 || index >= settings.colors.length) return settings
  return { ...settings, colors: settings.colors.filter((_, at) => at !== index) }
}

export function siteSettingsEqual(a: SiteSettings, b: SiteSettings): boolean {
  return (
    a === b ||
    (a.businessName === b.businessName &&
      a.tagline === b.tagline &&
      a.about === b.about &&
      a.vibe === b.vibe &&
      a.styleNotes === b.styleNotes &&
      a.colors.length === b.colors.length &&
      a.colors.every((color, index) => color === b.colors[index]))
  )
}

/** Nothing filled in yet — used to decide whether there is a design to clear. */
export function isEmptySiteSettings(settings: SiteSettings): boolean {
  return siteSettingsEqual(settings, emptySiteSettings())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Optional free text: a missing field is empty, a non-string is corruption. */
function parseOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : null
}

/**
 * Site settings from an untrusted payload. `null` means the payload cannot be
 * trusted — every field is checked, and an unknown vibe is corruption rather than
 * something to silently drop, because it would change what gets built.
 */
export function parseSiteSettings(value: unknown): SiteSettings | null {
  if (value === undefined || value === null) return emptySiteSettings()
  if (!isRecord(value)) return null

  const businessName = parseOptionalText(value.businessName)
  const tagline = parseOptionalText(value.tagline)
  const about = parseOptionalText(value.about)
  const styleNotes = parseOptionalText(value.styleNotes)
  if (businessName === null || tagline === null || about === null || styleNotes === null) {
    return null
  }

  const rawVibe = value.vibe
  if (rawVibe !== undefined && rawVibe !== null && !isVibeId(rawVibe)) return null
  const vibe = isVibeId(rawVibe) ? rawVibe : null

  const rawColors = value.colors
  if (rawColors !== undefined && !Array.isArray(rawColors)) return null

  const colors: string[] = []
  for (const candidate of rawColors ?? []) {
    if (typeof candidate !== 'string') return null
    const normalised = normaliseHexColor(candidate)
    if (normalised === null) return null
    colors.push(normalised)
  }
  if (colors.length > SITE_COLOR_LIMIT) return null

  return { businessName, tagline, about, vibe, styleNotes, colors }
}
