import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Download, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { unzipSync, zipSync } from 'fflate'

import { dismissStartSurfaces, type StoredPage } from './canvas.ts'

/**
 * E2E vocabulary for the SUBMIT GATE — the app's ending.
 *
 * Two things here are unusual and deliberate:
 *
 *  · The downloaded zip is UNZIPPED IN NODE and asserted against §1 directly.
 *    The assertion is about the artifact a builder will open, not about anything
 *    the app says about it.
 *  · `runPackageGate` shells out to `scripts/roundtrip/gate.mjs`, which imports
 *    NO app code (see its README). A gate that called `src/export/validate`
 *    would agree with the app by construction and could never catch a validator
 *    bug — so the Stage 3 DoD's "exits 0" is only worth something because this
 *    is a separate program reading the bytes.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
const GATE_SCRIPT = join(REPO_ROOT, 'scripts', 'roundtrip', 'gate.mjs')
const GATE_DEPENDENCIES = join(REPO_ROOT, 'scripts', 'roundtrip', 'node_modules')

/* ------------------------------------------------------------------------- */
/* Driving the gate                                                           */
/* ------------------------------------------------------------------------- */

export interface GateOutcome {
  readonly status: number
  readonly output: string
}

/**
 * `node scripts/roundtrip/gate.mjs --package <zip> --no-manifest`.
 *
 * Never swallows a missing install: the gate's dependencies are not committed,
 * so a run without them would otherwise look like a mysterious non-zero exit
 * rather than "you have not run `npm ci --prefix scripts/roundtrip`".
 */
export function runPackageGate(zipPath: string): GateOutcome {
  if (!existsSync(GATE_DEPENDENCIES)) {
    throw new Error(
      `The round-trip gate is not installed. Run: npm ci --prefix scripts/roundtrip (looked in ${GATE_DEPENDENCIES})`,
    )
  }

  try {
    const output = execFileSync(process.execPath, [GATE_SCRIPT, '--package', zipPath, '--no-manifest'], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
    })
    return { status: 0, output }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string }
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    }
  }
}

/** A copy of `zipPath` with one extra entry — the gate's V12 negative control. */
export function withExtraEntry(zipPath: string, name: string, body: string): string {
  const entries = unzipSync(new Uint8Array(readFileSync(zipPath)))
  const rebuilt: Record<string, Uint8Array> = { ...entries, [name]: new TextEncoder().encode(body) }

  const polluted = `${zipPath}.polluted.zip`
  writeFileSync(polluted, zipSync(rebuilt))
  return polluted
}

/* ------------------------------------------------------------------------- */
/* Capturing the download                                                     */
/* ------------------------------------------------------------------------- */

export interface CapturedPackage {
  readonly path: string
  readonly suggestedFilename: string
  readonly sizeBytes: number
  readonly entries: string[]
}

export async function capturePackage(page: Page, act: () => Promise<void>): Promise<CapturedPackage> {
  const [download] = await Promise.all([page.waitForEvent('download'), act()])
  return savePackage(download)
}

export async function savePackage(download: Download): Promise<CapturedPackage> {
  const directory = await mkdtemp(join(tmpdir(), 'blueprint-package-'))
  const path = join(directory, download.suggestedFilename())
  await download.saveAs(path)

  return {
    path,
    suggestedFilename: download.suggestedFilename(),
    sizeBytes: statSync(path).size,
    entries: Object.keys(unzipSync(new Uint8Array(readFileSync(path)))),
  }
}

export function readEntry(zipPath: string, name: string): string {
  const entries = unzipSync(new Uint8Array(readFileSync(zipPath)))
  const bytes = entries[name]
  if (bytes === undefined) throw new Error(`${name} is not in ${zipPath}`)
  return new TextDecoder().decode(bytes)
}

export function entryBytes(zipPath: string, name: string): Uint8Array {
  const entries = unzipSync(new Uint8Array(readFileSync(zipPath)))
  const bytes = entries[name]
  if (bytes === undefined) throw new Error(`${name} is not in ${zipPath}`)
  return bytes
}

/**
 * §1's expectation DERIVED FROM THE PACKAGE'S OWN `site.json`, so the assertion
 * is "the archive matches its manifest", not "the archive matches a list I also
 * wrote".
 */
export interface SiteJsonShape {
  submission: { id: string; client: { name: string; email: string }; appVersion: string }
  siteSettings: { businessName: string }
  pages: { id: string; name: string; slug: string; height: number; screenshot: string }[]
  assets: { id: string; path: string }[]
}

export function expectedEntries(site: SiteJsonShape): string[] {
  return [
    'site.json',
    'brief.md',
    ...site.pages.map((page) => page.screenshot),
    ...site.assets.map((asset) => asset.path),
  ]
}

/* ------------------------------------------------------------------------- */
/* Driving the form                                                           */
/* ------------------------------------------------------------------------- */

export interface LeadInput {
  readonly name?: string
  readonly email?: string
  readonly business?: string
}

export async function openSubmit(page: Page): Promise<void> {
  await page.getByTestId('submit-open').click()
  await expect(page.getByTestId('submit-view')).toBeVisible()
}

/**
 * Open the editor on a `?submit-stub=…` URL — the seam `src/submit/appPorts.ts`
 * honours in the `--mode test` build only, mirroring `?export-engine=fallback`.
 * The start surfaces come back on every fresh visit, so they are cleared here
 * exactly as `openCanvas` does.
 */
export async function openCanvasWithStub(page: Page, stub: string): Promise<void> {
  const response = await page.goto(`./?submit-stub=${stub}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('canvas-page')).toBeVisible()
  await dismissStartSurfaces(page)
}

export async function fillLead(page: Page, lead: LeadInput): Promise<void> {
  if (lead.name !== undefined) await page.getByTestId('submit-client-name').fill(lead.name)
  if (lead.email !== undefined) await page.getByTestId('submit-client-email').fill(lead.email)
  if (lead.business !== undefined) {
    const field = page.getByTestId('submit-business-name')
    await field.fill(lead.business)
    // The business name is a committed field: it reaches the document on blur.
    await field.blur()
  }
}

export function sendButton(page: Page) {
  return page.getByTestId('submit-send')
}

/**
 * Fill the honeypot the way a BOT would — scripted straight into the DOM, never
 * by typing. React tracks a controlled input's last value and ignores an `input`
 * event whose value it believes it already knows, so the assignment has to go
 * through the native setter on the prototype; that is the standard idiom for
 * driving a controlled input from outside React, not a trick specific to here.
 */
export async function fillHoneypot(page: Page, value: string): Promise<void> {
  await page.getByTestId('submit-honeypot').evaluate((element, text) => {
    const input = element as HTMLInputElement
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called via `.call` on the very instance it came from.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

/* ------------------------------------------------------------------------- */
/* Seeding a design                                                           */
/* ------------------------------------------------------------------------- */

interface SeedHost {
  __blueprintStore?: {
    getState: () => {
      replaceDocument: (document: { siteSettings: unknown; pages: StoredPage[] }) => void
    }
  }
}

export interface SeedOptions {
  readonly businessName?: string
  readonly pages: StoredPage[]
}

/**
 * Seeds through the store bridge, the same seam `e2e/support/exportPng.ts` uses.
 * The SUBMIT half of the journey is driven entirely through the real UI — this
 * only stands in for the twenty minutes of sketching that precede it.
 */
export interface FixtureOptions {
  /** Blank the home heading (V19) and strand a generate block (V5). */
  readonly withBlockers?: boolean
}

/**
 * TWO PAGES, chosen so one submission exercises the whole contract without
 * paying for four renders on WebKit (which is ~9× slower than chromium):
 *  · every block type the walkthrough narrates, including an EMPTY image slot
 *  · a pen annotation, so `hasStrokes` reaches the compression ladder for real
 *  · page 2 linked from nothing → V15 WARN
 *  · one untouched template block → V23 WARN and the pre-flight list
 */
export function submitFixturePages(options: FixtureOptions = {}): StoredPage[] {
  const blocked = options.withBlockers === true

  return [
    {
      id: 'page-home',
      name: 'Home',
      blocks: [
        {
          id: 'home-nav',
          type: 'nav-bar',
          x: 0,
          y: 0,
          width: 1200,
          height: 64,
          text: 'Home',
          items: [{ id: 'home-nav-1', label: 'Home', link: { kind: 'page', pageId: 'page-home' } }],
        },
        {
          id: 'home-heading',
          type: 'heading',
          x: 80,
          y: 120,
          width: 640,
          height: 80,
          text: blocked ? '   ' : 'Bread worth the walk',
          copyMode: 'real',
        },
        {
          id: 'home-intro',
          type: 'text',
          x: 80,
          y: 240,
          width: 560,
          height: 140,
          text: 'Sourdough, rye and a very good cinnamon bun. Open from six, most days.',
          copyMode: 'real',
        },
        {
          id: 'home-blurb',
          type: 'text',
          x: 80,
          y: 400,
          width: 560,
          height: 120,
          text: '',
          copyMode: 'generate',
          generateDescription: blocked ? '' : 'A warm two-sentence welcome for a family bakery',
          lengthHint: '~2 sentences',
        },
        {
          id: 'home-photo',
          type: 'image',
          x: 720,
          y: 120,
          width: 400,
          height: 320,
          text: '',
          description: 'The shopfront at first light',
        },
        {
          id: 'home-cta',
          type: 'button',
          x: 80,
          y: 560,
          width: 240,
          height: 64,
          text: 'See the menu',
          link: { kind: 'none' },
        },
      ],
      penStrokes: [
        {
          id: 'home-note',
          color: '#c0392b',
          width: 6,
          points: Array.from({ length: 16 }).map((_, index) => ({
            x: 120 + index * 24,
            y: 720 + (index % 2) * 28,
          })),
        },
      ],
    },
    {
      id: 'page-contact',
      name: 'Contact',
      blocks: [
        {
          id: 'contact-heading',
          type: 'heading',
          x: 80,
          y: 120,
          width: 500,
          height: 80,
          text: 'Come say hi',
          copyMode: 'real',
        },
        {
          id: 'contact-details',
          type: 'text',
          x: 80,
          y: 240,
          width: 440,
          height: 160,
          text: '123 Agricola St, Halifax\nWed to Sun, 8am to 2pm',
          copyMode: 'real',
          // Untouched template filler: V23 WARN plus the pre-flight list.
          fromTemplate: true,
        },
      ],
      penStrokes: [],
    },
  ]
}

export async function seedSubmitDesign(page: Page, options: SeedOptions): Promise<void> {
  await page.evaluate((seeded) => {
    const store = (globalThis as SeedHost).__blueprintStore
    if (!store) throw new Error('The store test bridge is missing from this build')

    store.getState().replaceDocument({
      siteSettings: {
        businessName: seeded.businessName ?? '',
        tagline: 'Bread worth the walk',
        about: 'A family bakery on Agricola Street.',
        vibe: 'warm',
        styleNotes: '',
        colors: ['#2F5D50'],
      },
      pages: seeded.pages,
    })
  }, options)
}
