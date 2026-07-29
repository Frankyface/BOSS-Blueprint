/**
 * THE SUBMIT PIPELINE — the one button the whole product leads to.
 *
 * ORDER, and why each step is where it is:
 *   1. mint the submission UUID (V8's freshness, by construction)
 *   2. build `site.json` from the document
 *   3. PRE-FLIGHT validation — the FIX pass, the brief, and every BLOCK check
 *      that does not need rendered pixels
 *   4. STOP HERE on a BLOCK. Rendering a four-page site takes seconds; making a
 *      client sit through it only to be told a text box is empty is the kind of
 *      small cruelty that makes people abandon a submission
 *   5. render the page PNGs (V6 is enforced by the renderer's own sanity ladder,
 *      which throws a typed error rather than handing back a bad picture)
 *   6. assemble + compression ladder
 *   7. FINAL validation, now with the render, staging and zip evidence — V6, V10,
 *      V12, V21 land here on the artifacts that will actually ship
 *   8. DOWNLOAD. The first side effect after validation passes, before any
 *      network call, and it happens whether or not a relay exists
 *   9. the relay, never awaited before the download and never able to fail the
 *      submission — the package is already on the client's disk
 *
 * Everything impure is a port. That is what lets the whole pipeline be asserted
 * with a call log in `submitFlow.test.ts` and lets the E2E bind a failing
 * renderer without touching the real one.
 */

import { BOSS_SUBMIT_EMAIL } from '../../site.config.ts'
import { mailtoHref } from '../export/delivery/mailto.ts'
import { buildNotificationPayload } from '../export/delivery/payload.ts'
import type { ExportDocument } from '../export/siteJson.ts'
import { buildExportPayload } from '../export/siteJson.ts'
import { validatePackage } from '../export/validate/index.ts'
import type { Finding, PackageBundle } from '../export/validate/types.ts'
import { buildPackage } from '../export/zip/buildPackage.ts'
import type { PageRenderBytes } from '../export/zip/buildPackage.ts'
import { uuid8 } from '../export/zip/filename.ts'
import { ALWAYS_ON_RUNGS } from '../export/zip/ladder.ts'

import type { LeadDetails } from './form.ts'
import { mintSubmission } from './submission.ts'
import type {
  ClientFinding,
  RenderFailure,
  SubmitOutcome,
  SubmitPorts,
  SubmitReceipt,
} from './types.ts'

export interface SubmitInput {
  readonly document: ExportDocument
  readonly lead: LeadDetails
}

/** The renderer's typed failure, recognised structurally so the flow imports no DOM. */
function asRenderFailure(error: unknown): RenderFailure | null {
  if (typeof error !== 'object' || error === null) return null
  const candidate = error as { clientMessage?: unknown; message?: unknown; finding?: unknown }
  if (candidate.finding !== 'V6' || typeof candidate.clientMessage !== 'string') return null
  return {
    clientMessage: candidate.clientMessage,
    detail: typeof candidate.message === 'string' ? candidate.message : candidate.clientMessage,
  }
}

/**
 * Export ids → internal ids, so a "take me to it" control can navigate. The
 * package never carries internal ids (§4.8 rule 3); the UI is the one place that
 * has to walk back the other way.
 */
function toClientFinding(finding: Finding, internalOf: ReadonlyMap<string, string>): ClientFinding {
  const jump = finding.jumpTo
  if (jump === undefined) {
    return { rule: finding.rule, audience: finding.audience, message: finding.message }
  }

  const pageId = internalOf.get(jump.pageId)
  if (pageId === undefined) {
    return { rule: finding.rule, audience: finding.audience, message: finding.message }
  }

  const blockId = jump.blockId === undefined ? undefined : internalOf.get(jump.blockId)
  return {
    rule: finding.rule,
    audience: finding.audience,
    message: finding.message,
    jumpTo: blockId === undefined ? { pageId } : { pageId, blockId },
  }
}

function invert(remap: ReadonlyMap<string, string>): Map<string, string> {
  return new Map([...remap].map(([internal, exported]) => [exported, internal]))
}

function renderLabel(index: number, total: number): string {
  return `Rendering page ${String(index + 1)} of ${String(total)}…`
}

export async function runSubmit(input: SubmitInput, ports: SubmitPorts): Promise<SubmitOutcome> {
  ports.onProgress({ phase: 'checking', label: 'Checking your design…' })

  const submission = mintSubmission(input.lead, ports.clock)
  const payload = buildExportPayload(input.document, submission)
  const internalOf = invert(payload.remap)
  ports.log('submit: export id remap', payload.remap)

  const preflight = await validatePackage({
    site: payload.site,
    brief: null,
    stagedDataUrls: payload.stagedAssets,
  })
  if (preflight.fixes.length > 0) ports.log('submit: fixes applied', preflight.fixes)

  if (preflight.blocks.length > 0) {
    ports.log('submit: blocked before rendering', preflight.blocks)
    return { kind: 'blocked', findings: preflight.blocks.map((f) => toClientFinding(f, internalOf)) }
  }

  const fixed = preflight.package
  const brief = fixed.brief ?? ''

  const renders: PageRenderBytes[] = []
  for (const [index, page] of input.document.pages.entries()) {
    ports.onProgress({
      phase: 'rendering',
      label: renderLabel(index, input.document.pages.length),
    })
    try {
      renders.push(await ports.renderPage(page.id))
    } catch (error) {
      const failure = asRenderFailure(error)
      ports.log('submit: render failed', error)
      if (failure === null) throw error
      return { kind: 'render-failed', failure }
    }
  }

  ports.onProgress({ phase: 'packaging', label: 'Packing everything up…' })
  const built = buildPackage(
    { site: fixed.site, brief, renders, stagedAssets: fixed.stagedDataUrls ?? new Map() },
    ports.ladder,
  )

  const finalBundle: PackageBundle = {
    site: fixed.site,
    brief,
    stagedAssets: built.stagedAssetFacts,
    renderedPages: built.renderedPageFacts,
    zipEntries: built.entries,
    zipBytes: built.bytes.length,
  }
  const report = await validatePackage(finalBundle)

  if (report.blocks.length > 0) {
    ports.log('submit: blocked after packaging', report.blocks)
    return { kind: 'blocked', findings: report.blocks.map((f) => toClientFinding(f, internalOf)) }
  }

  ports.onProgress({ phase: 'finishing', label: 'Downloading your package…' })
  // THE FIRST SIDE EFFECT after validation, and the one that cannot fail.
  ports.download(built.fileName, built.bytes)

  const receipt: SubmitReceipt = {
    fileName: built.fileName,
    bytes: built.bytes,
    sizeBytes: built.bytes.length,
    submissionId: fixed.site.submission.id,
    uuid8: uuid8(fixed.site.submission.id),
    businessName: fixed.site.siteSettings.businessName,
    pageCount: fixed.site.pages.length,
    warnings: report.warns.map((f) => toClientFinding(f, internalOf)),
    // Rungs 0 and 1 always run; only an OPTIONAL rung is worth telling anyone about.
    ladderFired: built.ladder.length > ALWAYS_ON_RUNGS.length,
    mailtoHref: mailtoHref({
      to: BOSS_SUBMIT_EMAIL,
      businessName: fixed.site.siteSettings.businessName,
      submissionId: fixed.site.submission.id,
      packageFileName: built.fileName,
      pageCount: fixed.site.pages.length,
      clientName: fixed.site.submission.client.name,
    }),
    relay: null,
  }

  const notification = buildNotificationPayload({
    site: fixed.site,
    brief,
    packageFileName: built.fileName,
    packageBytes: built.bytes.length,
    warnings: report.warns,
    /*
     * Carried, not stored: the honeypot never enters `site.json`, but the relay
     * needs it to forward the provider's own bot-check field and to refuse a
     * send outright. Nothing reaches here with it filled — the store refuses
     * first — which is precisely why it is worth passing.
     */
    honeypot: input.lead.quill,
  })

  /*
   * NOT awaited. The completion screen goes up on the strength of the download
   * alone; if a relay is ever wired and reports `sent`, the store adds a line
   * afterwards. A rejection is swallowed here, so no caller can accidentally
   * surface one — the client's package is already on their disk.
   */
  const relayResult = ports.relay.send(notification).catch((error: unknown) => {
    ports.log('submit: relay failed (the package downloaded regardless)', error)
    return { status: 'failed' as const, detail: String(error) }
  })

  return { kind: 'done', receipt, relayResult }
}
