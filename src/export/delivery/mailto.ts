/**
 * STEP 2 OF THE COMPLETION UX — "Email it to us".
 *
 * The client already has the zip; this builds the `mailto:` that carries a
 * subject Cam can file and a body that names the exact file to attach. The app
 * NEVER activates it — that is the client's click, and an auto-opened mail client
 * is the fastest way to make someone close a tab.
 *
 * Pure string work, so the E2E can assert the `href` and the unit tests can
 * assert the escaping without a mail client anywhere in sight.
 */

import { uuid8 } from '../zip/filename.ts'

/**
 * A conservative ceiling on the whole `mailto:` URL.
 *
 * The real constraints are the OS handler's command-line limit and older browser
 * URL caps, both historically around 2000 characters; 1900 leaves room for the
 * scheme and the address. Over it the body is trimmed, never the subject — the
 * subject is what makes Cam's inbox searchable.
 */
export const MAX_MAILTO_URL_LENGTH = 1900

/**
 * How much of the business name the subject line carries. A name is a name, not
 * an essay, and percent-encoding costs up to 12 characters per emoji — without a
 * ceiling here a pathological name could eat the whole URL budget on its own.
 */
export const MAX_BUSINESS_NAME_IN_MAIL = 60

const ELLIPSIS = '…'

function shortBusinessName(name: string): string {
  const characters = [...name]
  return characters.length <= MAX_BUSINESS_NAME_IN_MAIL
    ? name
    : `${characters.slice(0, MAX_BUSINESS_NAME_IN_MAIL).join('')}${ELLIPSIS}`
}

export interface MailtoInput {
  readonly to: string
  readonly businessName: string
  readonly submissionId: string
  readonly packageFileName: string
  readonly pageCount: number
  readonly clientName: string
}

/** `Website sketch — Bluebird Bakery (3f2a9c1e)`. */
export function mailtoSubject(input: MailtoInput): string {
  return `Website sketch — ${shortBusinessName(input.businessName)} (${uuid8(input.submissionId)})`
}

/**
 * The body, as an ordered list of lines. The first three are load-bearing (the
 * greeting, the file to attach, the id); anything after them can be trimmed away
 * if the URL runs long.
 */
function bodyLines(input: MailtoInput): string[] {
  const pages = `${String(input.pageCount)} ${input.pageCount === 1 ? 'page' : 'pages'}`

  return [
    'Hi BOSS,',
    '',
    `My website sketch is attached: ${input.packageFileName}`,
    '',
    `Business: ${shortBusinessName(input.businessName)}`,
    `Submission: ${input.submissionId}`,
    `Pages: ${pages}`,
    '',
    '(Please attach the zip your browser just downloaded before sending.)',
    '',
    input.clientName,
  ]
}

const REQUIRED_LINE_COUNT = 3

function buildUrl(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** The `href`, trimmed from the end until it fits `MAX_MAILTO_URL_LENGTH`. */
export function mailtoHref(input: MailtoInput, maxLength: number = MAX_MAILTO_URL_LENGTH): string {
  const subject = mailtoSubject(input)
  const lines = bodyLines(input)

  for (let count = lines.length; count >= REQUIRED_LINE_COUNT; count -= 1) {
    const url = buildUrl(input.to, subject, lines.slice(0, count).join('\n'))
    if (url.length <= maxLength) return url
  }

  /*
   * Even the three required lines overflow. Fall back to a subject and body
   * built only from the uuid8 and the file name — both bounded by construction
   * (§1: a ≤36-character slug plus 8 hex characters), so this rung ALWAYS fits
   * however pathological the business name was.
   */
  return buildUrl(
    input.to,
    `Website sketch (${uuid8(input.submissionId)})`,
    `Attached: ${input.packageFileName}`,
  )
}
