import { BOSS_SUBMIT_EMAIL } from '../../../site.config.ts'
import { formatPackageSize, LADDER_FIRED_TEXT, SIZE_BAND_TEXT, sizeBand } from '../../export/zip/size.ts'
import { jumpToBlock, useSubmitStore } from '../../store/submitStore.ts'

/**
 * THE TWO-STEP COMPLETION — debate #2's binding UX: "1. Downloaded ✓ → 2. Email
 * it to us".
 *
 * Step 1 is shown as ALREADY DONE, because it is: the zip reached the client's
 * disk before this screen rendered, and that is the half of delivery that cannot
 * fail. Step 2 is the client's action — a prefilled `mailto:` they click, plus
 * the address as copyable text for anyone whose browser has no mail handler. The
 * app never auto-opens a mail client and never claims an email was sent.
 */

const DESIGN_SAFE_NOTE = 'Your design also stays saved here, so you can come back and change it.'

export function SubmitComplete() {
  const receipt = useSubmitStore((state) => state.receipt)
  const relay = useSubmitStore((state) => state.relay)
  const copied = useSubmitStore((state) => state.addressCopied)
  const markAddressCopied = useSubmitStore((state) => state.markAddressCopied)
  const saveAgain = useSubmitStore((state) => state.saveAgain)
  const close = useSubmitStore((state) => state.close)

  if (receipt === null) return null

  const band = sizeBand(receipt.sizeBytes)
  // §5's two audiences hold here too: a client reads "nothing links to Menu",
  // never "site.json key order". The bug-class WARNs still ride in the payload.
  const warnings = receipt.warnings.filter((warning) => warning.audience === 'client')

  const handleCopy = () => {
    const write = navigator.clipboard?.writeText(BOSS_SUBMIT_EMAIL)
    if (write === undefined) return

    write.then(
      () => {
        markAddressCopied(true)
      },
      () => {
        // A refused clipboard is not an error worth a banner: the address is
        // right there as selectable text, which is the fallback that always works.
        markAddressCopied(false)
      },
    )
  }

  return (
    <section className="submit__complete" data-testid="submit-complete">
      <ol className="submit__steps">
        <li className="submit__step submit__step--done" data-testid="submit-step-downloaded">
          <h3 className="submit__step-heading">1. Downloaded ✓</h3>
          <p className="submit__filename" data-testid="submit-filename">
            {receipt.fileName}
          </p>
          <p className="submit__size" data-testid="submit-size">
            {formatPackageSize(receipt.sizeBytes)} — {SIZE_BAND_TEXT[band]}
          </p>
          {receipt.ladderFired && <p className="submit__note">{LADDER_FIRED_TEXT}</p>}
          <button
            type="button"
            className="submit__secondary"
            data-testid="submit-download-again"
            onClick={saveAgain}
          >
            Download it again
          </button>
        </li>

        <li className="submit__step" data-testid="submit-step-email">
          <h3 className="submit__step-heading">2. Email it to us</h3>
          <p>
            Attach <strong>{receipt.fileName}</strong> to an email and send it over — that is the
            last thing we need from you.
          </p>
          <a className="submit__mailto" data-testid="submit-mailto" href={receipt.mailtoHref}>
            Open a prefilled email
          </a>
          <p className="submit__address-row">
            <span>Or email us directly:</span>
            <input
              className="submit__address"
              data-testid="submit-address"
              type="text"
              readOnly
              value={BOSS_SUBMIT_EMAIL}
              aria-label="BOSS email address"
              onFocus={(event) => {
                event.target.select()
              }}
            />
            <button
              type="button"
              className="submit__secondary"
              data-testid="submit-copy-address"
              onClick={handleCopy}
            >
              {copied ? 'Copied ✓' : 'Copy address'}
            </button>
          </p>
        </li>
      </ol>

      <p className="submit__reference">
        Your reference: <code data-testid="submit-uuid">{receipt.uuid8}</code> ·{' '}
        <span data-testid="submit-pages">
          {receipt.pageCount} {receipt.pageCount === 1 ? 'page' : 'pages'}
        </span>
      </p>

      {/* Only a real `sent` outcome may say anything — the stub resolves `skipped`. */}
      {relay?.status === 'sent' && (
        <p className="submit__note" data-testid="submit-relay-note">
          We have also been notified that your sketch is ready.
        </p>
      )}

      {warnings.length > 0 && (
        <section className="submit__warnings" data-testid="submit-warnings">
          <h3 className="submit__step-heading">Things worth knowing</h3>
          <ul className="submit__findings-list">
            {warnings.map((warning, index) => {
              const jump = warning.jumpTo
              return (
                <li
                  key={`${warning.rule}-${String(index)}`}
                  className="submit__finding"
                  data-testid="submit-warning"
                  data-rule={warning.rule}
                >
                  <span className="submit__finding-message">{warning.message}</span>
                  {jump !== undefined && (
                    <button
                      type="button"
                      className="submit__link-button"
                      data-testid="submit-warning-jump"
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
        </section>
      )}

      <p className="submit__note">{DESIGN_SAFE_NOTE}</p>
      <button type="button" className="submit__secondary" data-testid="submit-back-to-editing" onClick={close}>
        Back to editing
      </button>
    </section>
  )
}
