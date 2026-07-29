/**
 * WHAT THE NOTIFICATION SAYS — the payload rendered as plain text a human reads
 * in an inbox.
 *
 * Plain text, not HTML, and not the JSON payload pasted into a field: every
 * provider in the free text-POST class drops the message body into an email more
 * or less verbatim, and Cam's first question on seeing one will be "whose is it
 * and does it need me". So the identity block comes first, the machine-readable
 * halves come last behind labelled markers, and the WARN list — the one thing
 * that changes what Cam does next — sits between them.
 *
 * Kept separate from the adapter because it is pure and worth its own tests: the
 * adapter is about HTTP, this is about what a person reads.
 */

import type { NotificationPayload } from './payload.ts'

/**
 * Subject lines get truncated by mail clients, so the uuid8 goes LAST but stays
 * inside the cap — it is the token that matches this notice to the zip the client
 * emails over, and a subject that lost it would make the pairing manual.
 */
export const MAX_SUBJECT_LENGTH = 120
const ELLIPSIS = '…'
const SUBJECT_PREFIX = 'BOSS Blueprint'
const BYTES_PER_KB = 1024

export const BRIEF_MARKER = '--- brief.md ---'
export const SITE_JSON_MARKER = '--- site.json (gzip, base64) ---'

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}${ELLIPSIS}`
}

function approximateKb(bytes: number): string {
  return `${String(Math.round(bytes / BYTES_PER_KB))} KB`
}

export function notificationSubject(payload: NotificationPayload): string {
  const business = payload.businessName.trim() === '' ? 'a new sketch' : payload.businessName.trim()
  const tail = ` — ${payload.uuid8}`
  const head = `${SUBJECT_PREFIX} — ${business}`

  return `${truncate(head, MAX_SUBJECT_LENGTH - tail.length)}${tail}`
}

function identityLines(payload: NotificationPayload): string[] {
  return [
    'A new BOSS Blueprint sketch is ready.',
    '',
    `Client:    ${payload.client.name} <${payload.client.email}>`,
    `Business:  ${payload.businessName}`,
    `Reference: ${payload.uuid8}  (submission ${payload.submissionId})`,
    `Pages:     ${String(payload.pageCount)}`,
    `Package:   ${payload.packageFileName} (~${approximateKb(payload.packageBytes)})`,
    `Detail:    ${payload.variant}`,
    '',
    'The client already downloaded their package and was asked to email it over.',
    'This is a heads-up, not the package itself.',
  ]
}

function warningLines(payload: NotificationPayload): string[] {
  if (payload.warnings.length === 0) return ['', 'No warnings.']

  return [
    '',
    'Things worth knowing:',
    ...payload.warnings.map((warning) => `- [${warning.rule}] ${warning.message}`),
  ]
}

function attachmentLines(payload: NotificationPayload): string[] {
  const lines: string[] = []

  if (payload.brief !== null) lines.push('', BRIEF_MARKER, payload.brief)
  if (payload.siteJsonGzipBase64 !== null) {
    lines.push('', SITE_JSON_MARKER, payload.siteJsonGzipBase64)
  }
  if (payload.variant === 'metadata-only') {
    lines.push(
      '',
      'brief.md and site.json were too large for this notification — they are both',
      "in the zip the client is emailing you, under the reference above.",
    )
  }

  return lines
}

export function notificationBody(payload: NotificationPayload): string {
  return [
    ...identityLines(payload),
    ...warningLines(payload),
    ...attachmentLines(payload),
    '',
  ].join('\n')
}
