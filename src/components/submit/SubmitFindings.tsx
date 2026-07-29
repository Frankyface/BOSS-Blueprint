import { useEffect, useRef } from 'react'

import { jumpToBlock, useSubmitStore } from '../../store/submitStore.ts'
import type { ClientFinding } from '../../submit/types.ts'

/**
 * WHAT STOPPED THE SUBMISSION, in the two voices §5 requires.
 *
 * A CLIENT-facing BLOCK gets the finding's own plain sentence and a control that
 * takes them to the block. A BUG-class BLOCK gets "something went wrong" — the
 * client cannot fix a generator bug and must not be asked to; the detail went to
 * the console when the flow logged it.
 *
 * Focus moves to the first finding on arrival, because a client who pressed Send
 * and stayed where they were has no idea anything happened.
 */

const BUG_MESSAGE =
  'Something went wrong while packaging your design. Please try again — if it keeps happening, email us and we will look at it.'

function messageOf(finding: ClientFinding): string {
  return finding.audience === 'client' ? finding.message : BUG_MESSAGE
}

export function SubmitFindings() {
  const findings = useSubmitStore((state) => state.findings)
  const close = useSubmitStore((state) => state.close)
  const firstRef = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    firstRef.current?.focus()
  }, [findings])

  // One "something went wrong" is plenty; repeating it per bug finding would
  // make a single packaging fault look like five.
  const clientFindings = findings.filter((finding) => finding.audience === 'client')
  const shown = clientFindings.length > 0 ? clientFindings : findings.slice(0, 1)

  return (
    <section className="submit__findings" data-testid="submit-blocked">
      <h3 className="submit__findings-heading">A couple of things need you first</h3>
      <ul className="submit__findings-list">
        {shown.map((finding, index) => {
          const jump = finding.jumpTo
          return (
            <li
              key={`${finding.rule}-${String(index)}`}
              ref={index === 0 ? firstRef : null}
              tabIndex={-1}
              className="submit__finding"
              data-testid="submit-finding"
              data-rule={finding.rule}
            >
              {/*
               * `role="alert"` lives on the MESSAGE, not on the `<li>` (review
               * follow-up F7). A role on the list item replaces its implicit
               * `listitem`, which takes the list apart for a screen reader: the
               * `<ul>` stops reporting how many things need fixing and each row
               * stops saying which of them it is. The urgency belongs to the
               * sentence anyway — the row also carries a button.
               */}
              <span className="submit__finding-message" role="alert">
                {messageOf(finding)}
              </span>
              {jump !== undefined && (
                <button
                  type="button"
                  className="submit__link-button"
                  data-testid="submit-jump"
                  onClick={() => {
                    jumpToBlock(jump.pageId, jump.blockId)
                  }}
                >
                  Take me to it
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <button type="button" className="submit__secondary" data-testid="submit-back-to-editing" onClick={close}>
        Back to editing
      </button>
    </section>
  )
}
