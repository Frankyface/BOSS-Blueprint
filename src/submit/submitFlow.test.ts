import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { BLUEBIRD_SUBMISSION, bluebirdDocument } from '../test/exportFixtures.ts'
import type { NotificationPayload } from '../export/delivery/payload.ts'
import type { DeliveryRelay, RelayResult } from '../export/delivery/relay.ts'
import { buildSiteJson, type ExportDocument } from '../export/siteJson.ts'
import type { PageRenderBytes } from '../export/zip/buildPackage.ts'
import type { SiteJson } from '../export/types.ts'

import { EMPTY_LEAD, type LeadDetails } from './form.ts'
import { runSubmit } from './submitFlow.ts'
import type { SubmissionClock } from './submission.ts'
import type { SubmitPorts } from './types.ts'

/**
 * THE PIPELINE'S ORDER, asserted with a call log.
 *
 * The load-bearing assertion is that a CLIENT-FACING BLOCK short-circuits before
 * a single page is rendered: rendering first would make a client wait through
 * seconds of work only to be told a text box is empty.
 */

const LEAD: LeadDetails = {
  ...EMPTY_LEAD,
  clientName: 'Dana Whitfield',
  clientEmail: 'dana@bluebirdbakery.ca',
  businessName: 'Bluebird Bakery',
}

const clockAt = (uuid: string): SubmissionClock => ({
  now: () => new Date('2026-07-28T14:03:22.000Z'),
  randomUuid: () => uuid,
})

/** A PNG whose IHDR declares the page's real export dimensions (V6 checks them). */
function pngOfSize(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(96)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function heightsOf(document: ExportDocument): Map<string, number> {
  const site: SiteJson = buildSiteJson(document, BLUEBIRD_SUBMISSION)
  return new Map(document.pages.map((page, index) => [page.id, site.pages[index]?.height ?? 0]))
}

interface Harness {
  readonly ports: SubmitPorts
  readonly calls: string[]
  readonly downloads: { fileName: string; bytes: Uint8Array }[]
  readonly payloads: NotificationPayload[]
}

interface HarnessOptions {
  readonly uuid?: string
  readonly document?: ExportDocument
  readonly relay?: DeliveryRelay
  readonly failRenderOn?: string
}

function harness(options: HarnessOptions = {}): Harness {
  const document = options.document ?? bluebirdDocument()
  const heights = heightsOf(document)
  const calls: string[] = []
  const downloads: { fileName: string; bytes: Uint8Array }[] = []
  const payloads: NotificationPayload[] = []

  const relay: DeliveryRelay = options.relay ?? {
    id: 'test-noop',
    send: (payload) => {
      calls.push('relay:send')
      payloads.push(payload)
      return Promise.resolve<RelayResult>({ status: 'skipped' })
    },
  }

  const ports: SubmitPorts = {
    clock: {
      now: clockAt('').now,
      randomUuid: () => {
        calls.push('mint:uuid')
        return options.uuid ?? BLUEBIRD_SUBMISSION.id
      },
    },
    renderPage: (pageId) => {
      calls.push(`render:${pageId}`)
      if (options.failRenderOn === pageId) {
        return Promise.reject(
          Object.assign(new Error('V6: stub'), {
            finding: 'V6',
            clientMessage: 'We hit a hiccup turning your page into a picture.',
          }),
        )
      }
      const render: PageRenderBytes = {
        bytes: pngOfSize(1200, heights.get(pageId) ?? 1600),
        width: 1200,
        height: heights.get(pageId) ?? 1600,
        nonBlank: true,
        hasStrokes: false,
      }
      return Promise.resolve(render)
    },
    download: (fileName, bytes) => {
      calls.push(`download:${fileName}`)
      downloads.push({ fileName, bytes })
    },
    relay,
    ladder: { quantizePng: null },
    onProgress: (progress) => {
      calls.push(`progress:${progress.phase}`)
    },
    log: () => undefined,
  }

  return { ports, calls, downloads, payloads }
}

/** Break the fixture the way a client would: empty a `real` heading (V19). */
function withBlankHeading(): ExportDocument {
  const document = bluebirdDocument()
  const [home, ...rest] = document.pages
  if (home === undefined) throw new Error('fixture has no home page')

  return {
    ...document,
    pages: [
      {
        ...home,
        blocks: home.blocks.map((block) =>
          block.id === 'rest-home-hero-title' ? { ...block, text: '   ' } : block,
        ),
      },
      ...rest,
    ],
  }
}

describe('the happy path', () => {
  it('runs mint → check → render → pack → download → relay, in that order', async () => {
    const { ports, calls } = harness()

    const outcome = await runSubmit({ document: bluebirdDocument(), lead: LEAD }, ports)

    expect(outcome.kind).toBe('done')
    expect(calls).toEqual([
      'progress:checking',
      'mint:uuid',
      'progress:rendering',
      'render:page-home',
      'progress:rendering',
      'render:page-contact',
      'progress:packaging',
      'progress:finishing',
      'download:blueprint_bluebird-bakery_3f2a9c1e.zip',
      'relay:send',
    ])
  })

  it('downloads BEFORE the relay is ever touched', async () => {
    const { ports, calls } = harness()
    await runSubmit({ document: bluebirdDocument(), lead: LEAD }, ports)

    const downloadAt = calls.findIndex((call) => call.startsWith('download:'))
    const relayAt = calls.indexOf('relay:send')

    expect(downloadAt).toBeGreaterThan(-1)
    expect(relayAt).toBeGreaterThan(downloadAt)
  })

  it('hands back a receipt whose zip is the §1 layout', async () => {
    const { ports, downloads } = harness()
    const outcome = await runSubmit({ document: bluebirdDocument(), lead: LEAD }, ports)

    if (outcome.kind !== 'done') throw new Error(`expected done, got ${outcome.kind}`)
    expect(outcome.receipt.fileName).toBe('blueprint_bluebird-bakery_3f2a9c1e.zip')
    expect(outcome.receipt.pageCount).toBe(2)
    expect(outcome.receipt.uuid8).toBe('3f2a9c1e')
    expect(outcome.receipt.sizeBytes).toBe(downloads[0]?.bytes.length)

    expect(Object.keys(unzipSync(outcome.receipt.bytes))).toEqual([
      'site.json',
      'brief.md',
      'pages/01-home.png',
      'pages/02-contact.png',
      'assets/img_001.jpg',
    ])
  })

  it('reports the WARNs that shipped with it', async () => {
    const { ports } = harness()
    const outcome = await runSubmit({ document: bluebirdDocument(), lead: LEAD }, ports)

    if (outcome.kind !== 'done') throw new Error('expected done')
    // The §7 fixture's second page is only reachable from the home nav, and its
    // strokes are sparse — both WARN, neither blocks.
    expect(outcome.receipt.warnings.every((warning) => warning.rule !== 'V01')).toBe(true)
  })

  it('does not report the ladder as having fired on a normal package', async () => {
    const { ports } = harness()
    const outcome = await runSubmit({ document: bluebirdDocument(), lead: LEAD }, ports)

    if (outcome.kind !== 'done') throw new Error('expected done')
    expect(outcome.receipt.ladderFired).toBe(false)
  })
})

describe('the BLOCK path', () => {
  it('stops BEFORE a single page is rendered', async () => {
    const { ports, calls, downloads } = harness({ document: withBlankHeading() })

    const outcome = await runSubmit({ document: withBlankHeading(), lead: LEAD }, ports)

    expect(outcome.kind).toBe('blocked')
    expect(calls.some((call) => call.startsWith('render:'))).toBe(false)
    expect(downloads).toHaveLength(0)
  })

  it('translates the jump target back to the app’s own ids', async () => {
    const { ports } = harness({ document: withBlankHeading() })
    const outcome = await runSubmit({ document: withBlankHeading(), lead: LEAD }, ports)

    if (outcome.kind !== 'blocked') throw new Error('expected blocked')
    const v19 = outcome.findings.find((finding) => finding.rule === 'V19')

    expect(v19?.audience).toBe('client')
    expect(v19?.jumpTo).toEqual({ pageId: 'page-home', blockId: 'rest-home-hero-title' })
  })
})

describe('the renderer-failure path', () => {
  it('surfaces the typed error and downloads nothing', async () => {
    const { ports, downloads } = harness({ failRenderOn: 'page-contact' })

    const outcome = await runSubmit({ document: bluebirdDocument(), lead: LEAD }, ports)

    expect(outcome.kind).toBe('render-failed')
    if (outcome.kind !== 'render-failed') return
    expect(outcome.failure.clientMessage).toContain('hiccup')
    expect(downloads).toHaveLength(0)
  })

  it('rethrows anything that is not a render failure', async () => {
    const { ports } = harness()
    const exploding: SubmitPorts = {
      ...ports,
      renderPage: () => Promise.reject(new Error('something else entirely')),
    }

    await expect(runSubmit({ document: bluebirdDocument(), lead: LEAD }, exploding)).rejects.toThrow(
      'something else entirely',
    )
  })
})

describe('relay isolation', () => {
  it('still completes when the relay rejects', async () => {
    const failing: DeliveryRelay = {
      id: 'failing',
      send: () => Promise.reject(new Error('relay exploded')),
    }
    const { ports, downloads } = harness({ relay: failing })

    const outcome = await runSubmit({ document: bluebirdDocument(), lead: LEAD }, ports)

    expect(outcome.kind).toBe('done')
    expect(downloads).toHaveLength(1)
    if (outcome.kind !== 'done') return
    await expect(outcome.relayResult).resolves.toEqual(
      expect.objectContaining({ status: 'failed' }),
    )
  })

  it('surfaces a `sent` outcome when a real relay reports one', async () => {
    const sending: DeliveryRelay = {
      id: 'sending',
      send: () => Promise.resolve<RelayResult>({ status: 'sent' }),
    }
    const { ports } = harness({ relay: sending })

    const outcome = await runSubmit({ document: bluebirdDocument(), lead: LEAD }, ports)
    if (outcome.kind !== 'done') throw new Error('expected done')

    await expect(outcome.relayResult).resolves.toEqual({ status: 'sent' })
  })

  it('builds the notification payload from the shipped package', async () => {
    const { ports, payloads } = harness()
    await runSubmit({ document: bluebirdDocument(), lead: LEAD }, ports)

    expect(payloads[0]?.packageFileName).toBe('blueprint_bluebird-bakery_3f2a9c1e.zip')
    expect(payloads[0]?.client.email).toBe('dana@bluebirdbakery.ca')
    expect(payloads[0]?.uuid8).toBe('3f2a9c1e')
  })
})
