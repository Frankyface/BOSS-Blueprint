/**
 * THE NOTIFICATION PAYLOAD — debate #2's shape, built and tested now even though
 * `NoopRelay` is all that sends it.
 *
 * "client name/email, submission UUID, page count, `brief.md`, gzipped
 * `site.json`, with degrade ladder full → compressed → metadata-only"
 * (`docs/decisions.md` 2026-07-27), plus the WARN list §5 promises Cam.
 *
 * A PURE SIZE DECISION. Every free text-relay tier has a body limit, and the one
 * thing that must survive it is the identity block — who submitted, which UUID,
 * how many pages, how big the zip. So the ladder sheds the big optional parts in
 * order and the identity block is never negotiable. Writing it as a pure function
 * over a byte budget is what lets the real adapter be one module later.
 */

import { gzipSync } from 'fflate'

import { uuid8 } from '../zip/filename.ts'
import { serializeSiteJson } from '../serialize.ts'
import type { SiteJson } from '../types.ts'
import type { Finding } from '../validate/types.ts'

import { encodeBase64 } from './base64.ts'

/** full → compressed → metadata-only (debate #2). */
export type PayloadVariant = 'full' | 'compressed' | 'metadata-only'

/**
 * The budget the ladder degrades against. 64 kB is the smallest documented body
 * limit among the free text relays debate #2 surveyed, so building to it means
 * the payload fits whichever adapter is eventually bound; it is a PARAMETER so a
 * future provider with more room does not need this file edited.
 */
export const RELAY_PAYLOAD_LIMIT_BYTES = 64 * 1024

export interface PayloadWarning {
  readonly rule: string
  readonly message: string
}

export interface NotificationPayload {
  readonly variant: PayloadVariant
  readonly submissionId: string
  readonly uuid8: string
  readonly client: { readonly name: string; readonly email: string }
  readonly businessName: string
  readonly pageCount: number
  readonly packageFileName: string
  readonly packageBytes: number
  readonly warnings: readonly PayloadWarning[]
  /**
   * The submit form's honeypot, carried so the relay can BOTH forward it to the
   * provider's own bot-check field and refuse to send when it is non-empty. The
   * store already refuses a tripped honeypot before the pipeline starts
   * (`src/store/submitStore.ts`); this is the belt to that pair of braces, and it
   * is the one field here that does not come from `site.json` — a honeypot value
   * has no business in a package a builder will read.
   */
  readonly honeypot: string
  /** `full` only — the build prompt verbatim, so Cam can read it without the zip. */
  readonly brief: string | null
  /** `full` and `compressed` — gzipped `site.json`, base64. */
  readonly siteJsonGzipBase64: string | null
}

export interface PayloadInput {
  readonly site: SiteJson
  readonly brief: string
  readonly packageFileName: string
  readonly packageBytes: number
  readonly warnings: readonly Finding[]
  /** Defaults to `''` — the only value a real client's submission ever has. */
  readonly honeypot?: string
}

/** Deterministic gzip: no filename, no OS byte drift, and a zeroed mtime. */
function gzipSiteJson(site: SiteJson): string {
  return encodeBase64(gzipSync(new TextEncoder().encode(serializeSiteJson(site)), { mtime: 0 }))
}

function measure(payload: NotificationPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length
}

/**
 * The payload for this submission, degraded until it fits `limitBytes`.
 *
 * The ladder is `full` (brief + gzipped JSON) → `compressed` (gzipped JSON only)
 * → `metadata-only` (neither). Note that the last rung ALWAYS fits: the identity
 * block is bounded by a client's name, an email and four numbers.
 */
export function buildNotificationPayload(
  input: PayloadInput,
  limitBytes: number = RELAY_PAYLOAD_LIMIT_BYTES,
): NotificationPayload {
  const base = {
    submissionId: input.site.submission.id,
    uuid8: uuid8(input.site.submission.id),
    client: { name: input.site.submission.client.name, email: input.site.submission.client.email },
    businessName: input.site.siteSettings.businessName,
    pageCount: input.site.pages.length,
    packageFileName: input.packageFileName,
    packageBytes: input.packageBytes,
    warnings: input.warnings.map((warning) => ({ rule: warning.rule, message: warning.message })),
    honeypot: input.honeypot ?? '',
  } as const

  const gzip = gzipSiteJson(input.site)

  const full: NotificationPayload = {
    ...base,
    variant: 'full',
    brief: input.brief,
    siteJsonGzipBase64: gzip,
  }
  if (measure(full) <= limitBytes) return full

  const compressed: NotificationPayload = {
    ...base,
    variant: 'compressed',
    brief: null,
    siteJsonGzipBase64: gzip,
  }
  if (measure(compressed) <= limitBytes) return compressed

  return { ...base, variant: 'metadata-only', brief: null, siteJsonGzipBase64: null }
}

/**
 * Step an existing payload DOWN the ladder — the same shedding order, applied to
 * a payload that has already been built.
 *
 * The relay needs this because the budget that decides the rung is the PROVIDER's
 * limit on the request body, which is not known here and is measured against the
 * assembled request, not against this object (`feature-notification-relay.md`
 * Notes). Returning a new object rather than rebuilding from the site means the
 * gzip is computed once per submission, not once per rung.
 *
 * Descent only: a `compressed` payload has already discarded its brief, so there
 * is nothing to promote it back with. Asking for a higher rung returns the
 * payload unchanged rather than inventing one.
 */
export function demoteNotificationPayload(
  payload: NotificationPayload,
  variant: PayloadVariant,
): NotificationPayload {
  if (variant === 'compressed' && payload.variant === 'full') {
    return { ...payload, variant, brief: null }
  }
  if (variant === 'metadata-only' && payload.variant !== 'metadata-only') {
    return { ...payload, variant, brief: null, siteJsonGzipBase64: null }
  }
  return payload
}
