// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { buildRubricManifest, validateJudgments } from './evaluator.mjs'
import { checkCopyLength, estimateFrameChars, findWrittenCopy, lcsLength, parseLengthHint } from './evaluate.mjs'
import { acceptJudgments, mergeReport, renderMarkdown } from './report.mjs'
import { checkSet } from './ship-gate.mjs'
import { deltaE00, hexToRgb, rgbToLab } from './lib/image-metrics.mjs'
import { NEAR_MISS_FLOOR, PASS_SCORE } from './thresholds.mjs'

const site = {
  siteSettings: { colors: ['#2f5233'] },
  pages: [
    {
      id: 'pg_0001',
      name: 'Home',
      slug: 'home',
      blocks: [{ id: 'blk_0002', type: 'text', copyMode: 'generate', generateDescription: 'two sentences' }],
    },
  ],
}
const scenario = { id: 'A', pages: [{ slug: 'home', pen: [{ ref: 'big-note', role: 'annotation', meaning: 'BIG!' }] }] }

/** A deterministic pass: every gate green, every det dimension at full marks. */
function perfectDet() {
  return {
    gates: {
      H4: { ok: true, problems: [] },
      H5: { ok: true, problems: [] },
      H6: { ok: true, problems: [] },
      H7: { ok: true, problems: [] },
    },
    dimensions: {
      S1: { points: 25, floorMet: true, mean: 1, pages: [] },
      S3: { allSane: true, items: [] },
      S4: { points: 15, floorMet: true, fraction: 1 },
      S5: { points: 7, floorMet: true, colourMet: true, perPage: [] },
    },
  }
}

const cleanScan = { h2: { ok: true, hits: [] }, h3: { ok: true }, h8: { ok: true }, permissionDenials: [], buildNotes: null }
const cleanGate = { ok: true, failures: [] }
const topScores = [
  { id: 'S2:home', score: 2, evidence: 'shots/home.png' },
  { id: 'S3:blk_0002', score: 2, evidence: 'shots/home.png' },
  { id: 'S5:home', score: 2, evidence: 'shots/home.png' },
  { id: 'S6:big-note', score: 2, evidence: 'BUILD_NOTES.md' },
]

describe('R7.2/R7.3 — the evaluator contract', () => {
  it('generates the item list from the artefacts, never from the agent', () => {
    const manifest = buildRubricManifest({ site, scenario })
    expect(manifest.items.map((i) => i.id).sort()).toEqual(['S2:home', 'S3:blk_0002', 'S5:home', 'S6:big-note'])
  })

  it('rejects an out-of-range score, an unknown id and UNCITED evidence', () => {
    const rubricManifest = buildRubricManifest({ site, scenario })
    const { accepted, rejected, missing } = acceptJudgments({
      judgments: {
        items: [
          { id: 'S2:home', score: 3, evidence: 'shots/home.png' },
          { id: 'S9:invented', score: 2, evidence: 'shots/home.png' },
          { id: 'S5:home', score: 2, evidence: 'it looks great' },
          { id: 'S3:blk_0002', score: 1, evidence: 'shots/home.png shows two sentences' },
        ],
      },
      rubricManifest,
    })
    expect(accepted.map((i) => i.id)).toEqual(['S3:blk_0002'])
    expect(rejected.map((r) => r.why)).toEqual([
      'score must be an integer 0..2',
      'id is not in rubric-manifest.json',
      'evidence must name at least one artefact file',
    ])
    expect(missing).toContain('S6:big-note')
  })

  it('rejects evidence that cites a file which was never staged', () => {
    // The shape check alone accepted any string matching the regex, so a citation to a
    // shot that does not exist — the exact shape a hallucinated one takes — counted.
    const rubricManifest = buildRubricManifest({ site, scenario })
    const { accepted, rejected } = acceptJudgments({
      judgments: {
        items: [
          { id: 'S2:home', score: 2, evidence: 'shots/homepage.png shows the hero' },
          { id: 'S5:home', score: 2, evidence: 'shots/home.png is unmistakably modern' },
        ],
      },
      rubricManifest,
      stagedFiles: ['BUILD_NOTES.md', 'rubric.md', 'shots/home.png', 'site.json'],
    })
    expect(accepted.map((i) => i.id)).toEqual(['S5:home'])
    expect(rejected[0].why).toContain('none of which was staged')
  })

  it('still checks the shape when no listing is available', () => {
    const rubricManifest = buildRubricManifest({ site, scenario })
    const { accepted } = acceptJudgments({
      judgments: { items: [{ id: 'S2:home', score: 2, evidence: 'shots/anything.png' }] },
      rubricManifest,
    })
    expect(accepted).toHaveLength(1)
  })

  it('rejects a malformed or wrong-scenario judgments file', () => {
    const rubricManifest = buildRubricManifest({ site, scenario })
    expect(validateJudgments('{oops', rubricManifest).ok).toBe(false)
    expect(validateJudgments(JSON.stringify({ scenario: 'B', items: topScores }), rubricManifest).ok).toBe(false)
    expect(validateJudgments(JSON.stringify({ scenario: 'A', items: topScores }), rubricManifest).ok).toBe(true)
  })
})

describe('R8.3 — the verdict is arithmetic, not judgment', () => {
  const merge = (over = {}) =>
    mergeReport({ det: perfectDet(), scan: cleanScan, gate: cleanGate, judged: topScores, scenarioId: 'A', ...over })

  it('PASSes on all gates, full score and every floor', () => {
    const report = merge()
    expect(report.total).toBe(100)
    expect(report.verdict).toBe('PASS')
    expect(report.exitCode).toBe(0)
  })

  it('a single failed hard gate is FAIL regardless of score', () => {
    const report = merge({ gate: { ok: false, failures: [{ code: 'V12', message: 'extra entry' }] } })
    expect(report.gates.H1.ok).toBe(false)
    expect(report.verdict).toBe('FAIL')
    expect(report.exitCode).toBe(1)
  })

  it('reports NEAR MISS as a FAIL — it says how far off, it does not pass', () => {
    const judged = topScores.map((i) => (i.id.startsWith('S4') ? i : { ...i, score: 1 }))
    const report = merge({ judged })
    expect(report.total).toBeGreaterThanOrEqual(NEAR_MISS_FLOOR)
    expect(report.total).toBeLessThan(PASS_SCORE)
    expect(report.verdict).toBe('NEAR MISS')
    expect(report.exitCode).toBe(1)
  })

  it('a floor miss fails even at a passing total', () => {
    const det = perfectDet()
    det.dimensions.S4.floorMet = false
    const report = merge({ det })
    expect(report.total).toBeGreaterThanOrEqual(PASS_SCORE)
    expect(report.verdict).not.toBe('PASS')
  })

  it('an S2 zero on any page misses that floor', () => {
    const judged = topScores.map((i) => (i.id.startsWith('S2') ? { ...i, score: 0 } : i))
    expect(merge({ judged }).dimensions.S2.floorMet).toBe(false)
  })

  it('an EMPTY score array misses the floor rather than clearing it vacuously', () => {
    // `[].every(…)` is true, so an evaluator that said nothing about a dimension used to
    // clear that dimension's floor by silence — the one direction a missing measurement
    // must never fall.
    const report = merge({ judged: [] })
    expect(report.dimensions.S2.floorMet).toBe(false)
    expect(report.dimensions.S3.floorMet).toBe(false)
    expect(report.dimensions.S6.floorMet).toBe(false)
    expect(report.verdict).not.toBe('PASS')
  })

  it('smoke skips the judged dimensions and applies the same det floors', () => {
    const report = merge({ smoke: true, judged: null })
    expect(report.verdict).toBe('SMOKE-PASS')
    expect(report.dimensions.S2.points).toBeNull()
    const failing = mergeReport({
      det: { ...perfectDet(), dimensions: { ...perfectDet().dimensions, S4: { points: 5, floorMet: false } } },
      scan: cleanScan,
      gate: cleanGate,
      judged: null,
      scenarioId: 'B',
      smoke: true,
    })
    expect(failing.verdict).toBe('SMOKE-FAIL')
  })

  it('pre-fills a routing row for every miss', () => {
    const report = merge({ scan: { ...cleanScan, h2: { ok: false, hits: [{ rule: 'R5.3-2a-lead', sentence: 'Is this what you wanted?', offset: 0 }] } } })
    const miss = report.misses.find((m) => m.id === 'H2')
    expect(miss.route).toContain('brief generator')
    expect(renderMarkdown(report, { runDir: 'X', manifest: { git: {} } })).toContain('Is this what you wanted?')
  })
})

describe('S1 alignment maths', () => {
  it('is order-sensitive and gap-tolerant', () => {
    expect(lcsLength(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(3)
    expect(lcsLength(['a', 'b', 'c'], ['a', 'x', 'b', 'c'])).toBe(3)
    expect(lcsLength(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(1)
  })
})

describe('S3 deterministic half (R8.2)', () => {
  const node = (kind, text, y) => ({ kind, tag: kind === 'heading' ? 'h2' : 'p', text, box: { x: 40, y, w: 600, h: 60 } })
  const sitePage = {
    slug: 'home',
    height: 1600,
    blocks: [
      { id: 'blk_real', type: 'text', copyMode: 'real', text: 'We answer the phone.' },
      { id: 'blk_top', type: 'text', copyMode: 'generate', generateDescription: 'intro', frame: { x: 40, y: 100, w: 600, h: 120 } },
      { id: 'blk_low', type: 'text', copyMode: 'generate', generateDescription: 'outro', frame: { x: 40, y: 1300, w: 600, h: 120 } },
    ],
  }
  const digest = {
    nodes: [
      node('text', 'A short introduction to the company, two sentences long. It reads well.', 90),
      node('text', 'We answer the phone.', 700),
      node(
        'text',
        'A much longer closing paragraph that happens to be the longest thing anywhere on this page by a wide margin indeed.',
        1400,
      ),
    ],
  }

  it('reads the BLOCK’s own copy by position, not the longest string on the page', () => {
    // The old rule handed every generate block on a page the same string — whichever was
    // longest — so a block could be graded against a neighbour's copy entirely.
    const top = findWrittenCopy({ digest, sitePage, block: sitePage.blocks[1] })
    const low = findWrittenCopy({ digest, sitePage, block: sitePage.blocks[2] })
    expect(top).toContain('short introduction')
    expect(low).toContain('closing paragraph')
    expect(top).not.toBe(low)
  })

  it('never returns another block’s real copy', () => {
    const written = findWrittenCopy({
      digest,
      sitePage,
      block: { type: 'text', generateDescription: 'x', frame: { x: 40, y: 780, w: 600, h: 60 } },
    })
    expect(written).not.toBe('We answer the phone.')
  })

  it('estimates a frame’s character capacity from its own geometry', () => {
    expect(estimateFrameChars({ w: 800, h: 240 })).toBe(1000)
    expect(estimateFrameChars({ w: 0, h: 0 })).toBe(1)
  })

  it('reads a lengthHint in sentences, words or characters', () => {
    expect(parseLengthHint('~2 sentences')).toEqual({ count: 2, unit: 'sentences' })
    expect(parseLengthHint('about 40 words')).toEqual({ count: 40, unit: 'words' })
    expect(parseLengthHint('80 characters')).toEqual({ count: 80, unit: 'characters' })
    expect(parseLengthHint(null)).toBeNull()
    expect(parseLengthHint('short and punchy')).toBeNull()
  })

  it('honours the lengthHint when the client gave one', () => {
    const two = 'One sentence here. And a second one.'
    expect(checkCopyLength({ written: two, lengthHint: '~2 sentences', frame: { w: 600, h: 120 } }).ok).toBe(true)
    // Five sentences against a two-sentence hint is outside ±1.
    const five = 'One. Two. Three. Four. Five.'
    expect(checkCopyLength({ written: five, lengthHint: '~2 sentences', frame: { w: 600, h: 120 } }).ok).toBe(false)
  })

  it('falls back to 0.3–3× the frame estimate when there is no hint', () => {
    const frame = { w: 600, h: 120 } // 75 × 5 = 375 chars
    const result = checkCopyLength({ written: 'x'.repeat(200), lengthHint: null, frame })
    expect(result.rule).toBe('frame estimate')
    expect(result.ok).toBe(true)
    // Three words where a paragraph belongs is the case the rule exists to catch.
    expect(checkCopyLength({ written: 'Nice garden.', lengthHint: null, frame }).ok).toBe(false)
    expect(checkCopyLength({ written: 'x'.repeat(4000), lengthHint: null, frame }).ok).toBe(false)
  })
})

describe('S5 colour maths', () => {
  it('scores identical colours at zero and obviously different ones well past the threshold', () => {
    const green = rgbToLab(hexToRgb('#2f5233'))
    expect(deltaE00(green, green)).toBeCloseTo(0, 6)
    expect(deltaE00(green, rgbToLab(hexToRgb('#d9c7a7')))).toBeGreaterThan(12)
    // A shade a renderer might plausibly land on stays under it.
    expect(deltaE00(green, rgbToLab(hexToRgb('#33562f')))).toBeLessThan(12)
  })
})

describe('R9.4 — the ship gate validates three runs AS A SET', () => {
  const run = (over = {}) => ({
    dir: `/runs/${over.scenario ?? 'A'}-${over.target ?? 'preview'}`,
    manifest: {
      verdict: 'PASS 92',
      scenario: 'A',
      target: 'preview',
      invalid: false,
      cached: false,
      git: { sha: 'abc123', clean: true },
      ruleHashes: { start: { 'thresholds.mjs': 'h1', 'prompt.txt': 'h2' } },
      ...over,
    },
  })
  const goodSet = () => [run(), run({ scenario: 'A', target: 'deployed' }), run({ scenario: 'B', target: 'preview' })]

  it('passes on three clean runs at one commit with identical rules', () => {
    expect(checkSet(goodSet()).ok).toBe(true)
  })

  it.each([
    ['a run marked INVALID', (set) => { set[0].manifest.invalid = true; set[0].manifest.ruleDrift = ['thresholds.mjs'] }, 'INVALID'],
    ['a dirty worktree', (set) => { set[1].manifest.git = { sha: 'abc123', clean: false } }, 'dirty'],
    ['a cached segment', (set) => { set[2].manifest.cached = true }, 'cache'],
    ['a non-PASS verdict', (set) => { set[0].manifest.verdict = 'NEAR MISS 82' }, 'verdict is'],
    ['two different commits', (set) => { set[1].manifest.git = { sha: 'def456', clean: true } }, 'different commits'],
    ['the wrong leg set', (set) => { set[2].manifest.scenario = 'A'; set[2].manifest.target = 'preview' }, 'leg set'],
    ['rule-file drift between runs', (set) => { set[1].manifest.ruleHashes.start['thresholds.mjs'] = 'CHANGED' }, 'differs from the first run'],
  ])('refuses %s', (_name, mutate, needle) => {
    const set = goodSet()
    mutate(set)
    const result = checkSet(set)
    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toContain(needle)
  })

  it('refuses a set that is not three runs', () => {
    expect(checkSet(goodSet().slice(0, 2)).ok).toBe(false)
  })
})
