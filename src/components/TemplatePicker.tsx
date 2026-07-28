import { openDesign } from '../store/canvasSession.ts'
import { useEditorStore } from '../store/editorStore.ts'
import { BLANK_START, documentFromTemplate, STARTER_TEMPLATES } from '../templates/index.ts'
import type { StarterTemplate } from '../templates/index.ts'

import { TemplateThumbnail } from './TemplateThumbnail.tsx'

import './StartSurfaces.css'

const PICKER_TITLE = 'What kind of site is this?'
const PICKER_LEAD =
  'Pick the closest match and we\'ll lay out a few pages for you to change — every word, ' +
  'picture and box is yours to move, rewrite or delete. Nothing here is final.'
const BLANK_HINT = 'You can swap to a template later, or clear it all with "Start over".'

/**
 * THE FIRST THING A CLIENT SEES on a fresh visit: four starter sites and a blank page.
 *
 * A full-surface choice rather than a dismissible suggestion, because the problem
 * it solves is the blank canvas itself — an empty 1200px sheet with a palette next
 * to it is exactly where a non-designer stalls. It appears only when there is no
 * saved design to come back to, so it is never in the way of real work.
 *
 * Choosing a template is a plain document swap (`openDesign`): there is no
 * template mode and nothing that behaves differently afterwards. Blank writes
 * nothing at all — it is already the page they are standing on — and hands over to
 * the coach card instead, because seeding "just a nav bar to get started" would put
 * content in the client's export that they never chose (decisions.md 2026-07-28).
 */
export function TemplatePicker() {
  const startState = useEditorStore((state) => state.startState)
  const setStartState = useEditorStore((state) => state.setStartState)

  if (startState !== 'picker') return null

  const chooseTemplate = (template: StarterTemplate) => {
    openDesign(documentFromTemplate(template))
  }

  return (
    <div className="start-overlay" data-testid="template-picker" role="dialog" aria-modal="true" aria-labelledby="template-picker-title">
      <div className="start-overlay__sheet start-overlay__sheet--wide">
        <h2 className="start-overlay__title" id="template-picker-title">
          {PICKER_TITLE}
        </h2>
        <p className="start-overlay__lead">{PICKER_LEAD}</p>

        <ul className="template-picker__grid">
          {STARTER_TEMPLATES.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className="template-card"
                data-testid={`template-card-${template.id}`}
                data-template-id={template.id}
                onClick={() => {
                  chooseTemplate(template)
                }}
              >
                {/* pages[0] is the home page — the one worth previewing. */}
                {template.pages[0] && <TemplateThumbnail page={template.pages[0]} />}
                <span className="template-card__title">{template.pickerTitle}</span>
                <span className="template-card__line">{template.pickerLine}</span>
                <span className="template-card__meta">
                  {template.pages.length} pages ·{' '}
                  {template.pages.map((page) => page.name).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="template-picker__blank">
          <button
            type="button"
            className="template-card template-card--blank"
            data-testid="template-card-blank"
            data-template-id={BLANK_START.id}
            onClick={() => {
              setStartState('coaching')
            }}
          >
            <span className="template-card__title">{BLANK_START.pickerTitle}</span>
            <span className="template-card__line">{BLANK_START.pickerLine}</span>
          </button>
          <p className="template-picker__blank-hint">{BLANK_HINT}</p>
        </div>
      </div>
    </div>
  )
}
