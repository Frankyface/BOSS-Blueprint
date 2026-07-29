import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RelayResult } from '../export/delivery/relay.ts'
import type { SubmitOutcome, SubmitPorts, SubmitReceipt } from '../submit/types.ts'

import { INITIAL_CANVAS_STATE, useCanvasStore } from './canvasStore.ts'
import { resetSubmitStore, useSubmitStore } from './submitStore.ts'

/**
 * WHAT THE STORE DOES WITH AN OUTCOME — the orchestration between the gate
 * (`submitStore.test.ts`) and the pipeline (`src/submit/submitFlow.test.ts`).
 *
 * Neither of those covers this seam, and it is where the interesting mistakes
 * live: which screen an outcome lands on, whether the in-flight meter is cleared
 * on every path out, and the late-relay guard — a promise that settles after the
 * client has already sent a SECOND package must not stamp its result onto the
 * new one's receipt (review follow-up F3; the store sat at ~55% lines behind the
 * `src/store/**` glob average).
 *
 * `runSubmit` and the browser ports are stubbed on purpose: this test is about
 * the store's reaction to each outcome shape, and binding the real pipeline
 * would make it a slow duplicate of `submitFlow.test.ts`.
 */

const runSubmit = vi.hoisted(() => vi.fn<() => Promise<SubmitOutcome>>())
const flushAutosave = vi.hoisted(() => vi.fn())
const createAppSubmitPorts = vi.hoisted(() =>
  vi.fn<(options: { onProgress: (progress: unknown) => void }) => Partial<SubmitPorts>>(),
)

vi.mock('../submit/submitFlow.ts', () => ({ runSubmit }))
vi.mock('../submit/appPorts.ts', () => ({ createAppSubmitPorts, downloadAgain: vi.fn() }))
vi.mock('./canvasSession.ts', () => ({ flushAutosave }))

const RECEIPT: SubmitReceipt = {
  fileName: 'blueprint_bluebird-bakery_0a1b2c3d.zip',
  bytes: new Uint8Array([1, 2, 3]),
  sizeBytes: 3,
  submissionId: '0a1b2c3d-0000-4000-8000-000000000000',
  uuid8: '0a1b2c3d',
  businessName: 'Bluebird Bakery',
  pageCount: 2,
  warnings: [],
  ladderFired: false,
  mailtoHref: 'mailto:someone@example.com',
  relay: null,
}

const SENT: RelayResult = { status: 'sent' }

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

/** A lead the gate accepts, so every test here gets as far as the pipeline. */
function fillTheForm(): void {
  useCanvasStore.getState().updateSiteSettings({ businessName: 'Bluebird Bakery' })
  useSubmitStore.getState().setContactField('clientName', 'Dana Whitfield')
  useSubmitStore.getState().setContactField('clientEmail', 'dana@bluebirdbakery.ca')
}

beforeEach(() => {
  vi.clearAllMocks()
  resetSubmitStore()
  useCanvasStore.setState({ ...INITIAL_CANVAS_STATE })
  createAppSubmitPorts.mockImplementation((options) => ({ onProgress: options.onProgress }))
  fillTheForm()
})

describe('the design is saved before anything slow happens', () => {
  it('flushes the autosave before the first render, not after the download', async () => {
    runSubmit.mockResolvedValue({ kind: 'blocked', findings: [] })

    await useSubmitStore.getState().send()

    expect(flushAutosave).toHaveBeenCalledTimes(1)
    // Blocked before a single page was rendered — so the flush cannot have been
    // hanging off the end of a successful run.
    expect(useSubmitStore.getState().screen).toBe('blocked')
  })
})

describe('each outcome lands on its own screen', () => {
  it('shows the findings and clears the meter on a BLOCK', async () => {
    const findings = [{ rule: 'V19', audience: 'client', message: 'This text box is empty' }] as const
    runSubmit.mockResolvedValue({ kind: 'blocked', findings })

    await useSubmitStore.getState().send()

    const state = useSubmitStore.getState()
    expect(state.screen).toBe('blocked')
    expect(state.findings).toEqual(findings)
    expect(state.progress).toBeNull()
    expect(state.receipt).toBeNull()
  })

  it('shows the typed renderer failure and clears the meter', async () => {
    const failure = { clientMessage: 'a hiccup', detail: 'V6 blank render' }
    runSubmit.mockResolvedValue({ kind: 'render-failed', failure })

    await useSubmitStore.getState().send()

    const state = useSubmitStore.getState()
    expect(state.screen).toBe('render-failed')
    expect(state.failure).toEqual(failure)
    expect(state.progress).toBeNull()
  })

  it('shows the completion screen with the receipt on success', async () => {
    runSubmit.mockResolvedValue({
      kind: 'done',
      receipt: RECEIPT,
      relayResult: Promise.resolve(SENT),
    })

    await useSubmitStore.getState().send()

    const state = useSubmitStore.getState()
    expect(state.screen).toBe('done')
    expect(state.receipt).toEqual(RECEIPT)
    expect(state.progress).toBeNull()
  })
})

describe('the working screen', () => {
  it('clears the previous run before it starts and reports progress as it goes', async () => {
    useSubmitStore.setState({
      findings: [{ rule: 'V05', audience: 'client', message: 'stale' }],
      failure: { clientMessage: 'stale', detail: 'stale' },
    })

    const seen: { screen: string; progress: unknown }[] = []
    runSubmit.mockImplementation(() => {
      // The port the store handed the pipeline is the only way progress travels.
      createAppSubmitPorts.mock.calls[0]?.[0].onProgress({
        phase: 'rendering',
        label: 'Rendering page 1 of 2…',
      })
      const { screen, progress, findings, failure } = useSubmitStore.getState()
      seen.push({ screen, progress })
      expect(findings).toEqual([])
      expect(failure).toBeNull()
      return Promise.resolve<SubmitOutcome>({ kind: 'blocked', findings: [] })
    })

    await useSubmitStore.getState().send()

    // It was on `working` while the pipeline ran, with last run's wreckage gone
    // and the meter the pipeline reported showing through.
    expect(seen).toEqual([
      { screen: 'working', progress: { phase: 'rendering', label: 'Rendering page 1 of 2…' } },
    ])
    // …and the meter is put away on the way out, whatever the outcome was.
    expect(useSubmitStore.getState().progress).toBeNull()
  })
})

describe('the relay settles after the client is already done', () => {
  it('shows the completion screen first and folds the relay in behind it', async () => {
    const relay = deferred<RelayResult>()
    runSubmit.mockResolvedValue({ kind: 'done', receipt: RECEIPT, relayResult: relay.promise })

    const pending = useSubmitStore.getState().send()
    await vi.waitFor(() => {
      expect(useSubmitStore.getState().screen).toBe('done')
    })
    // The client has their package; nothing claims an email was sent yet.
    expect(useSubmitStore.getState().relay).toBeNull()

    relay.resolve(SENT)
    await pending

    expect(useSubmitStore.getState().relay).toEqual(SENT)
  })

  it('ignores a relay whose submission has already been superseded', async () => {
    const relay = deferred<RelayResult>()
    runSubmit.mockResolvedValue({ kind: 'done', receipt: RECEIPT, relayResult: relay.promise })

    const pending = useSubmitStore.getState().send()
    await vi.waitFor(() => {
      expect(useSubmitStore.getState().screen).toBe('done')
    })

    // A second submission finished while the first relay was still in flight.
    const newer = { ...RECEIPT, submissionId: 'ffffffff-0000-4000-8000-000000000000' }
    useSubmitStore.setState({ receipt: newer })

    relay.resolve(SENT)
    await pending

    expect(useSubmitStore.getState().relay).toBeNull()
    expect(useSubmitStore.getState().receipt).toEqual(newer)
  })
})

describe('retry is the same pipeline', () => {
  it('re-runs the whole thing rather than resuming a half-finished one', async () => {
    runSubmit.mockResolvedValueOnce({
      kind: 'render-failed',
      failure: { clientMessage: 'a hiccup', detail: 'V6' },
    })
    runSubmit.mockResolvedValueOnce({
      kind: 'done',
      receipt: RECEIPT,
      relayResult: Promise.resolve(SENT),
    })

    await useSubmitStore.getState().send()
    expect(useSubmitStore.getState().screen).toBe('render-failed')

    await useSubmitStore.getState().retry()

    expect(runSubmit).toHaveBeenCalledTimes(2)
    expect(useSubmitStore.getState().screen).toBe('done')
    expect(useSubmitStore.getState().failure).toBeNull()
  })
})
