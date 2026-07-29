import { useMemo } from 'react'
import type { FormEvent } from 'react'

import { useCommittedField } from '../../hooks/useCommittedField.ts'
import { useCanvasStore } from '../../store/canvasStore.ts'
import { jumpToBlock, useSubmitStore } from '../../store/submitStore.ts'
import { templateFillerBlocks } from '../../submit/templateFiller.ts'
import type { LeadField } from '../../submit/form.ts'

const FILLER_HEADING = 'Some template placeholder text is still in your design — want to review it?'
const FILLER_NOTE =
  'You can send it as it is. We will treat anything still in the template wording as filler and replace it.'

/**
 * THE LEAD GATE'S FORM.
 *
 * Three fields, asked for once, at the end. The business name is BOUND STRAIGHT
 * TO `siteSettings` rather than copied into a local draft: one source of truth,
 * one undo step, and the Site panel can never end up disagreeing with the thing
 * the client just typed here.
 *
 * The honeypot is a real input with an implausible name, off-screen, unfocusable
 * and `aria-hidden` — see `src/submit/form.ts` for why filling it is fatal and
 * what stops that from ever stranding a human.
 */
export function SubmitForm() {
  const settings = useCanvasStore((state) => state.siteSettings)
  const updateSiteSettings = useCanvasStore((state) => state.updateSiteSettings)
  const pages = useCanvasStore((state) => state.pages)

  const contact = useSubmitStore((state) => state.contact)
  const problems = useSubmitStore((state) => state.problems)
  const refusal = useSubmitStore((state) => state.refusal)
  const setContactField = useSubmitStore((state) => state.setContactField)
  const send = useSubmitStore((state) => state.send)

  const businessName = useCommittedField(settings.businessName, (next) => {
    updateSiteSettings({ businessName: next })
  })

  const filler = useMemo(() => templateFillerBlocks({ siteSettings: settings, pages }), [settings, pages])

  const problemFor = (field: LeadField): string | undefined =>
    problems.find((problem) => problem.field === field)?.message

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void send()
  }

  return (
    <form className="submit__form" data-testid="submit-form" onSubmit={handleSubmit} noValidate>
      <p className="submit__lede">
        We will build from your sketch. Tell us who you are and we will send the package to your
        browser, ready to email over.
      </p>

      <label className="submit__label">
        <span className="submit__label-text">Your name</span>
        <input
          type="text"
          className="submit__control"
          data-testid="submit-client-name"
          autoComplete="name"
          value={contact.clientName}
          aria-invalid={problemFor('clientName') !== undefined}
          onChange={(event) => {
            setContactField('clientName', event.target.value)
          }}
        />
      </label>
      {problemFor('clientName') !== undefined && (
        <p className="submit__error" role="alert" data-testid="submit-error-clientName">
          {problemFor('clientName')}
        </p>
      )}

      <label className="submit__label">
        <span className="submit__label-text">Your email</span>
        <input
          type="email"
          className="submit__control"
          data-testid="submit-client-email"
          autoComplete="email"
          value={contact.clientEmail}
          aria-invalid={problemFor('clientEmail') !== undefined}
          onChange={(event) => {
            setContactField('clientEmail', event.target.value)
          }}
        />
      </label>
      {problemFor('clientEmail') !== undefined && (
        <p className="submit__error" role="alert" data-testid="submit-error-clientEmail">
          {problemFor('clientEmail')}
        </p>
      )}

      <label className="submit__label">
        <span className="submit__label-text">Business name</span>
        <input
          type="text"
          className="submit__control"
          data-testid="submit-business-name"
          placeholder="Martina's Trattoria"
          aria-invalid={problemFor('businessName') !== undefined}
          {...businessName}
        />
      </label>
      {problemFor('businessName') !== undefined && (
        <p className="submit__error" role="alert" data-testid="submit-error-businessName">
          {problemFor('businessName')}
        </p>
      )}

      {/* The honeypot. Not a label, not tabbable, not named like anything a
          password manager fills in — and never rendered `display: none`, which
          some bots skip. */}
      <input
        type="text"
        className="submit__quill"
        data-testid="submit-honeypot"
        name="quill"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={contact.quill}
        onChange={(event) => {
          setContactField('quill', event.target.value)
        }}
      />

      {filler.length > 0 && (
        <section className="submit__filler" data-testid="submit-filler">
          <h3 className="submit__filler-heading">{FILLER_HEADING}</h3>
          <ul className="submit__filler-list">
            {filler.map((block) => (
              <li key={block.blockId} className="submit__filler-item" data-testid="submit-filler-item">
                <span className="submit__filler-where">
                  {block.pageName} · {block.type}
                </span>
                <span className="submit__filler-text">“{block.preview}”</span>
                <button
                  type="button"
                  className="submit__link-button"
                  data-testid="submit-filler-jump"
                  onClick={() => {
                    jumpToBlock(block.pageId, block.blockId)
                  }}
                >
                  Take me to it
                </button>
              </li>
            ))}
          </ul>
          <p className="submit__filler-note">{FILLER_NOTE}</p>
        </section>
      )}

      {refusal !== null && (
        <p className="submit__error" role="alert" data-testid="submit-refusal">
          {refusal}
        </p>
      )}

      <button type="submit" className="submit__send" data-testid="submit-send">
        Send my sketch
      </button>
    </form>
  )
}
