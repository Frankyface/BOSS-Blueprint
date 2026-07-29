/**
 * THE PACKAGE FILE NAME — `docs/export-format.md` §1.
 *
 * `blueprint_<business-slug>_<uuid8>.zip`, e.g. `blueprint_bluebird-bakery_3f2a9c1e.zip`.
 *
 * The name is COSMETIC: every identity fact in it also lives inside `site.json`
 * (§1), so a client who renames the file on the way to their mail client loses
 * nothing. It exists so Cam's inbox is legible at a glance and so the round-trip
 * gate's F01/F02/F03 have something to check.
 */

import { slugifyBusinessName } from '../slug.ts'

/** §1 — the first 8 hex characters of the submission UUID. */
export const UUID8_LENGTH = 8

/**
 * The uuid8 of a submission id. Lower-cased because the schema's v4 pattern is
 * lower-case hex and the gate's F03 compares the two literally; a hand-edited
 * upper-case UUID must not produce a filename that disagrees with its own JSON.
 */
export function uuid8(submissionId: string): string {
  return submissionId.replace(/-/g, '').slice(0, UUID8_LENGTH).toLowerCase()
}

/**
 * `blueprint_<business-slug>_<uuid8>.zip`.
 *
 * The business slug is §4.1 steps 1–4 only — steps 5 (reserved names) and 6
 * (uniqueness suffix) exist for page routes and there is exactly one business
 * slug — with `business` as the fallback for a name that slugifies to nothing
 * (v2.1 ruling), so an emoji-only business name yields
 * `blueprint_business_3f2a9c1e.zip` rather than `blueprint__3f2a9c1e.zip`.
 */
export function packageFileName(businessName: string, submissionId: string): string {
  return `blueprint_${slugifyBusinessName(businessName)}_${uuid8(submissionId)}.zip`
}
