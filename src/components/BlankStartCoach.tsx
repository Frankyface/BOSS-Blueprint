import { useEditorStore } from '../store/editorStore.ts'

import './StartSurfaces.css'

const COACH_TITLE = "Nothing here yet — that's the point."
const COACH_LEAD = 'Build your page the way a page is actually built, from the top down:'

/** Verbatim from the template content draft §8.1 — the four blocks, in order. */
const COACH_STEPS: readonly { readonly block: string; readonly rest: string }[] = [
  { block: 'Nav bar', rest: ' across the top — the menu people click to move around your site.' },
  { block: 'Section', rest: ' band under it — pages are just a stack of full-width strips.' },
  { block: 'Heading, Text and Image', rest: ' dropped inside that band.' },
  { block: 'Button', rest: ' pointed at another page.' },
]

const COACH_REASSURANCE =
  "Don't worry about it looking finished. Rough and honest is more useful to us than tidy and " +
  "vague — we'll do the polish."

const CHANGED_MIND = 'Changed your mind?'
const BACK_TO_PICKER = 'Start from a template instead →'
const DISMISS = 'Got it'

/**
 * COACHING FOR A BLANK PAGE — a card over the canvas, not blocks on it.
 *
 * Blank has to mean zero blocks (decisions.md 2026-07-28): a page pre-seeded with
 * "just a nav bar" would put words in the client's export that they never chose,
 * and would make the picker's promise a lie. But an empty white sheet is precisely
 * the paralysis the templates exist to cure, so the help has to come from outside
 * the design. This card is that outside.
 *
 * It retires itself the moment anything lands in the document — latched in the
 * session subscriber, so it is gone for good rather than flickering back when a
 * block is deleted. And the last line goes BACK to the picker in one click: a
 * client who chose blank and froze should not have to clear their browser storage
 * to see the templates again.
 */
export function BlankStartCoach() {
  const startState = useEditorStore((state) => state.startState)
  const setStartState = useEditorStore((state) => state.setStartState)

  if (startState !== 'coaching') return null

  return (
    <div className="start-coach" data-testid="blank-start-coach" role="note">
      <h2 className="start-coach__title">{COACH_TITLE}</h2>
      <p className="start-coach__lead">{COACH_LEAD}</p>
      <ol className="start-coach__steps">
        {COACH_STEPS.map((step) => (
          <li key={step.block}>
            <strong>{step.block}</strong>
            {step.rest}
          </li>
        ))}
      </ol>
      <p className="start-coach__reassurance">{COACH_REASSURANCE}</p>
      <p className="start-coach__actions">
        <button
          type="button"
          className="start-coach__link"
          data-testid="blank-start-coach-templates"
          onClick={() => {
            setStartState('picker')
          }}
        >
          <em>{CHANGED_MIND}</em> {BACK_TO_PICKER}
        </button>
        <button
          type="button"
          className="start-coach__dismiss"
          data-testid="blank-start-coach-dismiss"
          onClick={() => {
            setStartState('editing')
          }}
        >
          {DISMISS}
        </button>
      </p>
    </div>
  )
}
