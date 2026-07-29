import { useState } from 'react'

import {
  COLOR_HINT,
  parseColorInput,
  SITE_COLOR_LIMIT,
  VIBE_HINTS,
  VIBE_OPTIONS,
} from '../canvas/siteSettings.ts'
import type { VibeId } from '../canvas/types.ts'
import { useCommittedField } from '../hooks/useCommittedField.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

const NO_VIBE_VALUE = ''
const NO_VIBE_LABEL = 'Not sure yet'

const BUSINESS_NAME_HINT = "We'll need this before you send the design in — the rest is optional."
const COLOR_PLACEHOLDER = 'e.g. dark green or #2f6f4f'
const COLORS_HINT = `Pick a colour, or type its name. Up to ${String(SITE_COLOR_LIMIT)}, most important first.`

/**
 * What an unpicked swatch shows. It is also a colour a client may legitimately
 * choose, which is why "is this slot set?" is answered by the stored value being
 * empty, never by comparing against this.
 */
const EMPTY_SWATCH_VALUE = '#ffffff'

interface ColorSlotProps {
  index: number
  color: string
}

/**
 * One preferred colour: the PICKER LEADS, the hex field follows (UX audit P4).
 *
 * The audit watched a client be asked for "#2f6f4f" when what she knows about
 * her brand is that it is dark green. Two answers ship together — the field now
 * takes a name (`parseColorInput`, Stage 2) and the row now opens with a real
 * swatch she can just click.
 *
 * This reverses an earlier local call against `<input type="color">`. Of its
 * three reasons, two no longer hold: WebKit has shipped the control since Safari
 * 12.1, and hex is still exactly what the export stores because the control's
 * value IS `#rrggbb`. The third — that it cannot say "no colour" — is why the
 * text field stays: clearing it is still how a slot is emptied, and an unpicked
 * swatch is drawn dashed rather than pretending white was chosen.
 */
function ColorSlot({ index, color }: ColorSlotProps) {
  const setSiteColor = useCanvasStore((state) => state.setSiteColor)
  const removeSiteColor = useCanvasStore((state) => state.removeSiteColor)

  const [draft, setDraft] = useState(color)
  const [error, setError] = useState<string | null>(null)
  const [lastColor, setLastColor] = useState(color)

  // Adjust during render rather than in an effect (see `useCommittedField`).
  if (color !== lastColor) {
    setLastColor(color)
    setDraft(color)
    setError(null)
  }

  /**
   * Store the six-digit code, and put the field straight to it — which is also
   * how the client learns what the tool understood from what they typed.
   *
   * Both inputs end here: the picker has no half-way state (choosing IS
   * committing) and the text field arrives via `commit` once it has a colour.
   */
  const keep = (hex: string) => {
    setError(null)
    setDraft(hex)
    setSiteColor(index, hex)
  }

  /** A name, a short hex or a full hex all commit as the same six-digit code. */
  const commit = () => {
    const value = draft.trim()

    if (value.length === 0) {
      setError(null)
      if (color.length > 0) removeSiteColor(index)
      return
    }

    const hex = parseColorInput(value)
    if (hex === null) {
      setError(COLOR_HINT)
      return
    }

    keep(hex)
  }

  return (
    <li className="site-colors__slot">
      <input
        type="color"
        className="site-colors__swatch"
        data-testid={`site-color-${String(index)}-swatch`}
        data-empty={color.length > 0 ? 'false' : 'true'}
        aria-label={`Pick preferred colour ${String(index + 1)}`}
        value={color.length > 0 ? color : EMPTY_SWATCH_VALUE}
        onChange={(event) => {
          keep(event.target.value)
        }}
      />
      <input
        type="text"
        className="side-panel__control"
        data-testid={`site-color-${String(index)}`}
        aria-label={`Preferred colour ${String(index + 1)} as a name or hex code`}
        placeholder={COLOR_PLACEHOLDER}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          commit()
        }}
      />
      {error && (
        <p className="side-panel__error" data-testid={`site-color-${String(index)}-error`} role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

/**
 * SITE SETTINGS — the facts about the business that the blocks cannot show.
 *
 * Lives in the right-hand panel rather than a modal: it is reference information
 * the client fills in as they think of it, and a modal would hide the very design
 * they are describing. Nothing here is validated while sketching — the business
 * name is required at SUBMIT (Stage 3), and nagging about it mid-sketch would be
 * exactly the friction this tool exists to remove.
 */
export function SiteSettingsPanel() {
  const settings = useCanvasStore((state) => state.siteSettings)
  const updateSiteSettings = useCanvasStore((state) => state.updateSiteSettings)

  const businessName = useCommittedField(settings.businessName, (next) => {
    updateSiteSettings({ businessName: next })
  })
  const tagline = useCommittedField(settings.tagline, (next) => {
    updateSiteSettings({ tagline: next })
  })
  const about = useCommittedField(
    settings.about,
    (next) => {
      updateSiteSettings({ about: next })
    },
    { commitOnEnter: false },
  )
  const styleNotes = useCommittedField(
    settings.styleNotes,
    (next) => {
      updateSiteSettings({ styleNotes: next })
    },
    { commitOnEnter: false },
  )

  const slotCount = Math.min(settings.colors.length + 1, SITE_COLOR_LIMIT)

  return (
    <div className="side-panel__body" data-testid="site-settings">
      <label className="side-panel__label">
        <span className="side-panel__label-text">Business name</span>
        <input
          type="text"
          className="side-panel__control"
          data-testid="setting-business-name"
          placeholder="e.g. Martina's Trattoria"
          {...businessName}
        />
      </label>
      <p className="side-panel__hint">{BUSINESS_NAME_HINT}</p>

      <label className="side-panel__label">
        <span className="side-panel__label-text">Tagline (optional)</span>
        <input
          type="text"
          className="side-panel__control"
          data-testid="setting-tagline"
          placeholder="e.g. Slow food, fast smiles"
          {...tagline}
        />
      </label>

      <label className="side-panel__label">
        <span className="side-panel__label-text">What the business does (optional)</span>
        <textarea
          className="side-panel__control side-panel__control--tall"
          data-testid="setting-about"
          placeholder="e.g. A family-run trattoria in Guelph, open for dinner six nights a week."
          {...about}
        />
      </label>

      <label className="side-panel__label">
        <span className="side-panel__label-text">Vibe (optional)</span>
        <select
          className="side-panel__control"
          data-testid="setting-vibe"
          value={settings.vibe ?? NO_VIBE_VALUE}
          onChange={(event) => {
            const value = event.target.value
            updateSiteSettings({ vibe: value === NO_VIBE_VALUE ? null : (value as VibeId) })
          }}
        >
          <option value={NO_VIBE_VALUE}>{NO_VIBE_LABEL}</option>
          {VIBE_OPTIONS.map((vibe) => (
            <option key={vibe} value={vibe}>
              {`${vibe.charAt(0).toUpperCase()}${vibe.slice(1)} — ${VIBE_HINTS[vibe]}`}
            </option>
          ))}
        </select>
      </label>

      <label className="side-panel__label">
        <span className="side-panel__label-text">Style notes (optional)</span>
        <textarea
          className="side-panel__control side-panel__control--tall"
          data-testid="setting-style-notes"
          placeholder="e.g. Like our Instagram — lots of white space, big food photos."
          {...styleNotes}
        />
      </label>

      <section className="side-panel__section" data-testid="site-colors">
        <h3 className="side-panel__heading">Preferred colours (optional)</h3>
        <ul className="site-colors">
          {Array.from({ length: slotCount }, (_, index) => (
            <ColorSlot key={index} index={index} color={settings.colors[index] ?? ''} />
          ))}
        </ul>
        <p className="side-panel__hint">{COLORS_HINT}</p>
      </section>
    </div>
  )
}
