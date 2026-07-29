import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  addPage,
  blockById,
  deleteBlock,
  drawStroke,
  fillPanelField,
  frameOf,
  insertBlock,
  inspectBlock,
  movePageLeft,
  movePageRight,
  openPanel,
  placeBlock,
  putPenAway,
  renamePage,
  selectBlock,
  setBlockText,
  setLink,
  switchToPage,
  takeUpPen,
  type ScenarioLink,
} from './actions.ts'

/**
 * SEG-1 — THE SCRIPTED FAKE CLIENT.
 *
 * This spec is an INTERPRETER for the scenario file, not a transcript of one. R1.1 makes
 * the scenario the single source of truth consumed three times — the driver executes it,
 * `manifest-diff.mjs` diffs `site.json` against it, the evaluator receives it as the
 * expectation list — and a hand-written spec per scenario would be a second copy of every
 * string, which R1.6 forbids for exactly the reason you would expect: the copies drift,
 * and then a green run means nothing.
 *
 * Every action below is a user-visible affordance (R2.2): no in-page script, no init
 * script, and no reach into app state. Against the production bundle the test-only store
 * bridge is not merely unused, it is absent — it is folded out at build time.
 */

/* ─────────────────────────── scenario types ─────────────────────────── */

interface ScenarioBlock {
  readonly ref: string
  readonly type: 'section' | 'heading' | 'text' | 'imageSlot' | 'button' | 'navBar'
  readonly origin: { readonly kind: 'template' | 'insert'; readonly id?: string }
  readonly frame: readonly number[]
  readonly fromTemplate: boolean
  readonly expect?: 'untouched-filler'
  readonly copyMode?: 'real' | 'generate'
  readonly text?: string
  readonly generateDescription?: string | null
  readonly lengthHint?: string | null
  readonly upload?: string | null
  readonly fit?: 'cover' | 'contain'
  readonly description?: string | null
  readonly label?: string
  readonly link?: ScenarioLink
  readonly items?: readonly { readonly label: string; readonly link: ScenarioLink }[]
}

interface ScenarioPage {
  readonly name: string
  readonly slug: string
  readonly deleteTemplateBlocks?: readonly string[]
  readonly blocks: readonly ScenarioBlock[]
  readonly pen?: readonly {
    readonly ref: string
    readonly role: string
    readonly target: string
    readonly color: string
    readonly width: string
    readonly strokes: readonly (readonly (readonly number[])[])[]
  }[]
}

interface Scenario {
  readonly id: string
  readonly title: string
  readonly start: { readonly mode: 'template' | 'blank'; readonly template?: string }
  readonly settings: {
    readonly businessName: string
    readonly tagline?: string | null
    readonly about?: string | null
    readonly vibe?: string | null
    readonly styleNotes?: string | null
    readonly colors?: readonly string[]
  }
  readonly submit: { readonly name: string; readonly email: string }
  readonly pageActions?: readonly { readonly action: string; readonly target?: string; readonly to?: string; readonly name?: string }[]
  readonly pages: readonly ScenarioPage[]
}

const PALETTE_ID: Record<ScenarioBlock['type'], string> = {
  section: 'section',
  heading: 'heading',
  text: 'text',
  imageSlot: 'image',
  button: 'button',
  navBar: 'nav-bar',
}

/* ─────────────────────────── run wiring ─────────────────────────── */

/**
 * `fileURLToPath`, never a hand-rolled `new URL(...).pathname` — the URL form
 * percent-encodes, so any repo path containing a space resolves to a directory that
 * does not exist and the scenario file fails to open before a single test runs.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')

const scenarioId = process.env.ROUNDTRIP_SCENARIO ?? 'A'
const runDir = path.resolve(process.env.ROUNDTRIP_RUN_DIR ?? path.join(REPO_ROOT, '.roundtrip-dryrun'))
const stepsDir = path.join(runDir, 'client', 'steps')
const scenarioFile = path.join(REPO_ROOT, 'scripts', 'roundtrip', 'scenarios', `scenario-${scenarioId}.json`)
const fixturesDir = path.join(REPO_ROOT, 'scripts', 'roundtrip', 'fixtures')

const scenario = JSON.parse(readFileSync(scenarioFile, 'utf8')) as Scenario

let stepIndex = 0
const stepLog: { step: number; name: string; shot: string }[] = []

/** One numbered filmstrip frame. Frames are ordered by when they were taken. */
async function frame(page: Page, name: string): Promise<void> {
  const file = `${String(stepIndex).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
  await page.screenshot({ path: path.join(stepsDir, file) })
  stepLog.push({ step: stepIndex, name, shot: `client/steps/${file}` })
  stepIndex += 1
}

/** R2.5 — every step screenshots, so a client-segment failure is an instant filmstrip. */
async function step(page: Page, name: string, act: () => Promise<void>): Promise<void> {
  await test.step(name, act)
  await frame(page, name)
}

/* ─────────────────────────── the journey ─────────────────────────── */

test.describe.configure({ mode: 'serial' })

test(`round-trip client · scenario ${scenarioId} · ${scenario.title}`, async ({ page }) => {
  mkdirSync(stepsDir, { recursive: true })
  const findings: Record<string, unknown> = { scenario: scenarioId, startedAt: new Date().toISOString() }

  await step(page, 'open the app', async () => {
    const response = await page.goto('./')
    expect(response?.status(), 'the app did not load').toBe(200)
  })

  await step(page, 'dismiss the first-run surfaces', async () => {
    // R2.3 — the desktop guard must be ABSENT at 1440×900. A guard here is a
    // desktop-guard defect, not a product FAIL, and it aborts the run as PRECONDITION.
    await expect(
      page.getByTestId('desktop-guard'),
      'the desktop guard appeared at 1440x900 — PRECONDITION, not a product failure',
    ).toHaveCount(0)

    if (scenario.start.mode === 'template') {
      await page.getByTestId(`template-card-${scenario.start.template}`).click()
    } else {
      await page.getByTestId('template-card-blank').click()
      const coach = page.getByTestId('blank-start-coach-dismiss')
      if ((await coach.count()) > 0) await coach.click()
    }
    await expect(page.getByTestId('template-picker')).toBeHidden()
    await expect(page.getByTestId('canvas-page')).toBeVisible()
  })

  await step(page, 'dismiss the onboarding tour', async () => {
    /**
     * R2.3 — the tour is dismissed through its REAL control, so its dismissal path is
     * gating evidence rather than something the harness routes around. The driver may
     * not seed the seen-flag: `addInitScript` is banned outright by R2.2, and seeding
     * would skip the very path this step exists to prove.
     *
     * It runs here rather than before the template pick because the tour SUPPRESSES
     * itself behind the picker (`OnboardingTour.tsx`: "template picker > desktop guard >
     * tour"), so there is nothing to dismiss until the canvas is up. On the production
     * bundle in a fresh profile the tour therefore always auto-starts at this point, and
     * its absence would be a real regression — hence an assertion, not a tolerated skip.
     *
     * Leaving it open is not harmless: the bubble takes pointer events even though its
     * layer does not, and it parks over the lower-left canvas for the rest of the run.
     */
    const bubble = page.getByTestId('tour-bubble')
    await expect(bubble, 'the first-run tour did not auto-start on a fresh profile').toBeVisible()
    findings.tourPresent = true
    findings.tourFirstStep = await bubble.getAttribute('data-tour-step')
    findings.tourStepCount = await bubble.getAttribute('data-tour-count')

    // The step frame is taken AFTER the act, so on its own it evidences a canvas with
    // no tour on it — which is indistinguishable from a tour that never appeared. R2.3
    // wants the dismissal itself in the filmstrip, so the bubble gets its own frame
    // while it is still up.
    await frame(page, 'onboarding tour before dismissal')

    await page.getByTestId('tour-skip').click()
    await expect(bubble, 'Skip did not close the tour').toBeHidden()
  })

  await step(page, 'fill the site settings', async () => {
    await openPanel(page, 'site')
    await fillPanelField(page, 'setting-business-name', scenario.settings.businessName)
    if (scenario.settings.tagline) await fillPanelField(page, 'setting-tagline', scenario.settings.tagline)
    if (scenario.settings.about) await fillPanelField(page, 'setting-about', scenario.settings.about)
    if (scenario.settings.vibe) await page.getByTestId('setting-vibe').selectOption(scenario.settings.vibe)
    if (scenario.settings.styleNotes) {
      await fillPanelField(page, 'setting-style-notes', scenario.settings.styleNotes)
    }
    const colors = scenario.settings.colors ?? []
    for (const [index, colour] of colors.entries()) {
      await fillPanelField(page, `site-color-${String(index)}`, colour)
    }
  })

  await step(page, 'set up the pages', async () => {
    for (const action of scenario.pageActions ?? []) {
      if (action.action === 'rename') await renamePage(page, action.target!, action.to!)
      else if (action.action === 'add') await addPage(page, action.name!)
      else if (action.action === 'moveLeft') await movePageLeft(page, action.target!)
      else if (action.action === 'moveRight') await movePageRight(page, action.target!)
    }
    const names = await page.getByTestId('page-tab').allInnerTexts()
    expect(
      names.map((n) => n.trim().split('\n')[0]),
      'the page strip does not match the scenario order',
    ).toEqual(scenario.pages.map((p) => p.name))
  })

  for (const scenarioPage of scenario.pages) {
    await step(page, `page ${scenarioPage.name} — remove what the client does not want`, async () => {
      await switchToPage(page, scenarioPage.name)
      for (const id of scenarioPage.deleteTemplateBlocks ?? []) {
        await deleteBlock(page, blockById(page, id))
      }
    })

    await step(page, `page ${scenarioPage.name} — lay out the blocks`, async () => {
      for (const block of scenarioPage.blocks) {
        if (block.expect === 'untouched-filler') continue // R1.2b — never touched, by definition
        const target = await resolveBlock(page, block)
        if (block.type !== 'navBar') await placeBlock(page, target, frameOf(block.frame))
        await configureBlock(page, target, block)
      }
    })

    if ((scenarioPage.pen ?? []).length > 0) {
      await step(page, `page ${scenarioPage.name} — draw the pen marks`, async () => {
        for (const cluster of scenarioPage.pen ?? []) {
          await takeUpPen(page, cluster.color, cluster.width)
          for (const stroke of cluster.strokes) await drawStroke(page, stroke)
          await putPenAway(page)
        }
        const strokeCount = await page.getByTestId('pen-stroke').count()
        const expected = (scenarioPage.pen ?? []).reduce((n, c) => n + c.strokes.length, 0)
        expect(strokeCount, `${scenarioPage.name}: pen stroke count`).toBe(expected)
      })
    }
  }

  await step(page, 'download the design file', async () => {
    // R2.7 — a real UI feature, and it enables the cheap re-export loop in protocol §8.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('design-download').click(),
    ])
    await download.saveAs(path.join(runDir, 'design.blueprint'))
    findings.designFile = download.suggestedFilename()
  })

  await step(page, 'fill the submit form', async () => {
    await page.getByTestId('submit-open').click()
    await expect(page.getByTestId('submit-view')).toBeVisible()
    await page.getByTestId('submit-client-name').fill(scenario.submit.name)
    await page.getByTestId('submit-client-email').fill(scenario.submit.email)

    // R2.6 — the driver fills only human-visible fields. Touching the honeypot would
    // legitimately block the submission, so the assertion is that it stayed empty.
    await expect(page.getByTestId('submit-honeypot')).toHaveValue('')
  })

  await step(page, 'check the pre-flight filler warning', async () => {
    /**
     * R1.2b — Scenario A leaves exactly one untouched `fromTemplate` copy block, which is
     * the only path that exercises V23's WARN for real client copy end to end. The WARN
     * is shown, it names the block, and the package SHIPS ANYWAY — a WARN never blocks
     * (`feature-submit-gate.md`). Scenario B is a blank start and cannot carry filler at
     * all, so the same assertion runs inverted.
     */
    const declared = scenario.pages.flatMap((p) => p.blocks.filter((b) => b.expect === 'untouched-filler'))
    const filler = page.getByTestId('submit-filler')
    if (declared.length === 0) {
      await expect(filler).toHaveCount(0)
      findings.fillerWarn = { shown: false, items: [] }
      return
    }
    await expect(filler).toBeVisible()
    const items = await page.getByTestId('submit-filler-item').allInnerTexts()
    expect(items.length, 'the V23 filler warning listed the wrong number of blocks').toBe(declared.length)
    findings.fillerWarn = { shown: true, items }
  })

  await step(page, 'send the sketch', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('submit-send').click(),
    ])
    /**
     * Saved TWICE, on purpose. Protocol §0's run directory names the artefact
     * `package.zip`, but the gate's F01/F02/F03 checks read the DELIVERED FILENAME —
     * `blueprint_<slug>_<uuid8>.zip` — so a run that only kept the protocol's name would
     * silently stop testing three checks. The original-named copy is what SEG-2 gates.
     */
    const delivered = download.suggestedFilename()
    expect(delivered).toMatch(/^blueprint_[a-z0-9-]+_[0-9a-f]{8}\.zip$/)
    await download.saveAs(path.join(runDir, delivered))
    copyFileSync(path.join(runDir, delivered), path.join(runDir, 'package.zip'))
    findings.packageFilename = delivered
  })

  await step(page, 'confirm the two-step completion UX', async () => {
    // R2.7 — assert the mailto anchor EXISTS; never activate it (no OS mail client here).
    await expect(page.getByTestId('submit-view')).toHaveAttribute('data-screen', 'done')
    await expect(page.getByTestId('submit-step-downloaded')).toBeVisible()
    await expect(page.getByTestId('submit-step-email')).toBeVisible()
    await expect(page.getByTestId('submit-mailto')).toHaveAttribute('href', /^mailto:/)
    findings.warnings = await page.getByTestId('submit-warning').allInnerTexts()
  })

  findings.steps = stepLog
  findings.finishedAt = new Date().toISOString()
  writeFileSync(path.join(runDir, 'client', 'driver-report.json'), `${JSON.stringify(findings, null, 2)}\n`, 'utf8')
})

/* ─────────────────────────── interpreter helpers ─────────────────────────── */

async function resolveBlock(page: Page, block: ScenarioBlock): Promise<Locator> {
  if (block.origin.kind === 'template') {
    const target = blockById(page, block.origin.id!)
    await expect(target, `template block ${block.origin.id} is missing`).toHaveCount(1)
    return target
  }
  return insertBlock(page, PALETTE_ID[block.type])
}

async function configureBlock(page: Page, target: Locator, block: ScenarioBlock): Promise<void> {
  if (block.type === 'section') return

  if (block.type === 'heading' || block.type === 'text') {
    if (block.copyMode === 'generate') {
      await inspectBlock(page, target)
      await page.getByTestId('copy-mode-generate').click()
      await fillPanelField(page, 'copy-description', String(block.generateDescription ?? ''))
      if (block.lengthHint) await fillPanelField(page, 'copy-length-hint', block.lengthHint)
    } else {
      await setBlockText(page, target, String(block.text ?? ''))
    }
    return
  }

  if (block.type === 'button') {
    await setBlockText(page, target, String(block.label ?? ''))
    await inspectBlock(page, target)
    await setLink(page, 'button', block.link!)
    return
  }

  if (block.type === 'navBar') {
    const labels = (block.items ?? []).map((item) => item.label)
    await setBlockText(page, target, labels.join(', '))
    await inspectBlock(page, target)
    for (const [index, item] of (block.items ?? []).entries()) {
      await setLink(page, `nav-item-${String(index)}`, item.link)
    }
    return
  }

  // imageSlot
  if (block.upload) {
    await selectBlock(page, target)
    await target.getByTestId('image-file-input').setInputFiles(path.join(fixturesDir, block.upload))
    await expect(target.getByTestId('image-slot')).toHaveAttribute('data-has-image', 'true', { timeout: 30_000 })
  }
  await inspectBlock(page, target)
  if (block.upload && block.fit) await page.getByTestId(`image-fit-${block.fit}`).click()
  await fillPanelField(page, 'image-description', String(block.description ?? ''))
}
