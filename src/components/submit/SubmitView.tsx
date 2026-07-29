import { useSubmitStore } from '../../store/submitStore.ts'

import { SubmitComplete } from './SubmitComplete.tsx'
import { SubmitFindings } from './SubmitFindings.tsx'
import { SubmitForm } from './SubmitForm.tsx'

import './SubmitView.css'

/**
 * THE SUBMIT SURFACE — a takeover view, not a modal.
 *
 * Stage 2 rejected modals for the settings and nav panels for concrete reasons
 * (focus trap and scroll lock behave differently in all three engines, and a
 * modal covers the very design you are describing). Here there is a second
 * reason: a BLOCK finding's "take me to it" has to LEAVE this surface and come
 * back, which is a normal state change for a view and a dance for a modal. The
 * 304px details panel is nowhere near wide enough for a form plus a findings
 * list, so it takes the whole body instead.
 */

const HEADING = 'Send this to BOSS'

export function SubmitView() {
  const screen = useSubmitStore((state) => state.screen)
  const progress = useSubmitStore((state) => state.progress)
  const failure = useSubmitStore((state) => state.failure)
  const close = useSubmitStore((state) => state.close)
  const retry = useSubmitStore((state) => state.retry)

  if (screen === 'closed') return null

  return (
    <section className="submit" data-testid="submit-view" data-screen={screen} aria-labelledby="submit-heading">
      <header className="submit__header">
        <h2 className="submit__heading" id="submit-heading">
          {HEADING}
        </h2>
        {screen !== 'working' && (
          <button type="button" className="submit__secondary" data-testid="submit-back" onClick={close}>
            Back to editing
          </button>
        )}
      </header>

      <div className="submit__body">
        {screen === 'form' && <SubmitForm />}

        {screen === 'working' && (
          <p className="submit__progress" data-testid="submit-progress" role="status">
            {progress?.label ?? 'Working…'}
          </p>
        )}

        {screen === 'blocked' && <SubmitFindings />}

        {screen === 'render-failed' && failure !== null && (
          <section className="submit__findings" data-testid="submit-render-failed">
            <p className="submit__error" role="alert">
              {failure.clientMessage}
            </p>
            <button
              type="button"
              className="submit__send"
              data-testid="submit-retry"
              onClick={() => {
                void retry()
              }}
            >
              Try again
            </button>
          </section>
        )}

        {screen === 'done' && <SubmitComplete />}
      </div>
    </section>
  )
}
