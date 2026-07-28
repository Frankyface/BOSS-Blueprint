import { useState } from 'react'

import {
  HEX_COLOR_HINT,
  isHexColor,
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
const COLOR_PLACEHOLDER = '#2f6f4f'
const COLORS_HINT = `Up to ${String(SITE_COLOR_LIMIT)} colours, most important first.`

interface ColorSlotProps {
  index: number
  color: string
}

/**
 * One preferred colour, as a hex field with a live swatch.
 *
 * Deliberately NOT `<input type="color">`: the native picker is a different widget
 * in every engine (and historically absent in WebKit), it cannot express "no
 * colour", and hex is exactly what the export stores anyway.
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

  const commit = () => {
    const value = draft.trim()

    if (value.length === 0) {
      setError(null)
      if (color.length > 0) removeSiteColor(index)
      return
    }

    if (!isHexColor(value)) {
      setError(HEX_COLOR_HINT)
      return
    }

    setError(null)
    setSiteColor(index, value)
  }

  return (
    <li className="site-colors__slot">
      <span
        className="site-colors__swatch"
        data-testid={`site-color-${String(index)}-swatch`}
        style={color.length > 0 ? { background: color } : undefined}
        aria-hidden="true"
      />
      <input
        type="text"
        className="side-panel__control"
        data-testid={`site-color-${String(index)}`}
        aria-label={`Preferred colour ${String(index + 1)}`}
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
          placeholder="Martina's Trattoria"
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
          placeholder="Slow food, fast smiles"
          {...tagline}
        />
      </label>

      <label className="side-panel__label">
        <span className="side-panel__label-text">What the business does (optional)</span>
        <textarea
          className="side-panel__control side-panel__control--tall"
          data-testid="setting-about"
          placeholder="A family-run trattoria in Guelph, open for dinner six nights a week."
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
          placeholder="Like our Instagram — lots of white space, big food photos."
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
