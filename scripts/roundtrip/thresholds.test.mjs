// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { applySmokeBudget, elapsedMinutes } from './budget.mjs'
import * as T from './thresholds.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * R10.1 — "every number AND every frozen rule set in this spec lives in thresholds.mjs,
 * and a unit test asserts each exact value. Lowering or loosening one fails a test and
 * shows up in the diff."
 *
 * These assertions are deliberately dumb literals. A test that computed the expected
 * value from the module would pass for any value the module happened to hold, which is
 * the exact hole this rule exists to close.
 */
describe('R10.1 — the pinned inventory', () => {
  it('pins the verdict thresholds', () => {
    expect(T.PASS_SCORE).toBe(85)
    expect(T.NEAR_MISS_FLOOR).toBe(70)
  })

  it('pins every per-dimension floor', () => {
    expect(T.S1_MEAN_FLOOR).toBe(0.85)
    expect(T.S1_PAGE_FLOOR).toBe(0.75)
    expect(T.S3_MIN_ITEM_SCORE).toBe(1)
    expect(T.S4_FLOOR).toBe(0.8)
  })

  it('pins the score weights to 100 points', () => {
    expect(T.SCORE_WEIGHTS).toEqual({ S1: 25, S2: 20, S3: 15, S4: 15, S5: 15, S6: 10 })
    expect(Object.values(T.SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
    expect(T.S5_DET_POINTS + T.S5_EVAL_POINTS).toBe(T.SCORE_WEIGHTS.S5)
  })

  it('pins the S3 length rule (R8.2)', () => {
    expect(T.S3_LENGTH_MIN_RATIO).toBe(0.3)
    expect(T.S3_LENGTH_MAX_RATIO).toBe(3)
    expect(T.FRAME_CHAR_WIDTH_PX).toBe(8)
    expect(T.FRAME_LINE_HEIGHT_PX).toBe(24)
    expect(T.S3_SENTENCE_HINT_TOLERANCE).toBe(1)
  })

  it('pins the geometry and image-matching constants', () => {
    expect(T.POSITION_TOLERANCE_PX).toBe(24)
    expect(T.DHASH_MAX_HAMMING).toBe(10)
    expect(T.DELTA_E_MAX).toBe(12)
  })

  it('pins the budgets', () => {
    expect(T.MAX_TURNS).toBe(250)
    expect(T.BUILDER_TIMEOUT_MIN).toBe(45)
    expect(T.SEGMENT_HARD_STOP_MIN).toBe(60)
    expect(T.CLIENT_BUDGET_MIN).toBe(8)
    expect(T.SMOKE_BUDGET_MIN).toBe(12)
    expect(T.FRICTION_PER_PAGE).toBe(1.5)
    expect(T.QUOTE_SPAN_CAP).toBe(400)
  })

  it('pins the viewports', () => {
    expect(T.SHOT_VIEWPORT).toEqual({ width: 1200, height: 900 })
    expect(T.CLIENT_VIEWPORT).toEqual({ width: 1440, height: 900 })
    expect(T.GUARD_ABSENT_AT).toEqual({ width: 1440, height: 900 })
  })

  it('pins the user-input tool set and its catch-all predicate (R5.2)', () => {
    expect([...T.USER_INPUT_TOOLS]).toEqual(['AskUserQuestion', 'ExitPlanMode'])
    expect(T.USER_INPUT_TOOL_PREDICATE.source).toBe('askuser|userinput|user_input')
    expect(T.USER_INPUT_TOOL_PREDICATE.flags).toContain('i')
  })

  it('pins the EXTENDED interrogative lead set ruled 2026-07-28 (R5.3 2a)', () => {
    // The protocol's original set. Ruling 6 extended it BEFORE any gating run existed,
    // because changing a scan rule once a verdict exists is what R5.5/R10.2 forbid.
    const original = ['do', 'would', 'could', 'can', 'should', 'shall', 'which', 'what', 'where', 'who', 'how']
    for (const word of original) expect(T.INTERROGATIVE_LEAD_SET).toContain(word)
    for (const added of ['does', 'did', 'may', 'might', 'will', 'is', 'are', 'was', 'were', 'when', 'whom', 'whose', 'why']) {
      expect(T.INTERROGATIVE_LEAD_SET, `${added} is part of ruling 6`).toContain(added)
    }
    expect(T.INTERROGATIVE_LEAD_SET).toHaveLength(24)
  })

  it('pins the reverse-order choice verbs (R5.3 2a clause 2)', () => {
    expect([...T.CHOICE_VERB_SET]).toEqual(['want', 'prefer', 'like', 'need', 'confirm', 'decide', 'choose', 'pick'])
  })

  it('pins the first-person offer forms added 2026-07-29 (R5.3 2a clause 3)', () => {
    expect([...T.FIRST_PERSON_OFFER_SET]).toEqual(['should i', 'shall (i|we)', 'want me to', 'anything else'])
    expect(T.FIRST_PERSON_OFFER_RE.flags).toContain('i')
    // Word order is load-bearing: "I should" is a statement, "should I" is an offer.
    expect(T.FIRST_PERSON_OFFER_RE.test('Should I add a favicon?')).toBe(true)
    expect(T.FIRST_PERSON_OFFER_RE.test('I should include the hours.')).toBe(false)
  })

  it('pins the seven question phrases (R5.3 2b)', () => {
    expect(T.QUESTION_PHRASES.map((re) => re.source)).toEqual([
      'let me know',
      'please (clarify|confirm|provide|specify)',
      'need (more|additional) (info|information|details)',
      'before i (proceed|continue)',
      'awaiting (your|further)',
      'unable to proceed without',
      'which (option|one) (do you|would you)',
    ])
    for (const re of T.QUESTION_PHRASES) expect(re.flags).toContain('i')
  })

  it('denies npx and npm to the builder (ruling 5, R3.5)', () => {
    expect(T.DENIED_BASH_PREFIXES).toContain('npx')
    expect(T.DENIED_BASH_PREFIXES).toContain('npm')
    expect(T.BUILDER_DENY).toContain('Bash(npx *)')
    expect(T.BUILDER_DENY).toContain('Bash(npm *)')
  })

  it('bans the skip-permissions flag outright (R4.5, hooks.md)', () => {
    expect(T.BANNED_FLAGS).toContain('--dangerously-skip-permissions')
    expect(T.BANNED_PERMISSION_MODES).toEqual(['bypassPermissions', 'acceptEdits'])
  })

  it('names the exact ship-gate leg set (R9.4)', () => {
    expect(T.SHIP_GATE_LEGS.map((l) => `${l.scenario}/${l.target}`)).toEqual([
      'A/preview',
      'A/deployed',
      'B/preview',
    ])
  })

  it('pins the evaluator contract (R7.2/R7.3/R7.4)', () => {
    // R10.1 says EVERY frozen rule set lives here with an exact-value test. These four
    // govern what an evaluator may score, cite, retry and see — the loosest of them is
    // the one a future edit would reach for first.
    expect(T.EVAL_SCORE_MIN).toBe(0)
    expect(T.EVAL_SCORE_MAX).toBe(2)
    expect(T.EVALUATOR_MAX_RETRIES).toBe(1)
    expect(T.EVIDENCE_ARTEFACT_RE.source).toBe('(shots|pages)\\/[\\w.-]+\\.png|BUILD_NOTES\\.md')
    expect([...T.EVALUATOR_SANDBOX_ALLOWED]).toEqual([
      'site.json',
      'scenario.json',
      'rubric.md',
      'rubric-manifest.json',
      'BUILD_NOTES.md',
    ])
    // R7.2's whole point: the builder transcript is not in the set.
    expect(T.EVALUATOR_SANDBOX_ALLOWED).not.toContain('transcript.jsonl')
  })

  it('hashes every rule file R9.3 names', () => {
    expect([...T.RULE_FILES]).toEqual([
      'prompt.txt',
      'rubric.md',
      'thresholds.mjs',
      'scan-transcript.mjs',
      'manifest-diff.mjs',
      'builtin-manifest.json',
    ])
  })
})

/**
 * R4.2 — the prompt is part of the MEASURED CONTRACT. The no-questions instruction lives
 * ONLY in brief.md; the harness prompt staying silent on it is precisely what makes H2
 * measure the package instead of the harness. This hash is the tripwire.
 */
describe('R4.2 — the frozen builder prompt', () => {
  it('matches its pinned sha256', async () => {
    const bytes = await readFile(path.join(HERE, 'prompt.txt'))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(T.PROMPT_SHA256)
  })

  it('says nothing about the business, the tool, sketches, or asking questions', async () => {
    const text = (await readFile(path.join(HERE, 'prompt.txt'), 'utf8')).toLowerCase()
    for (const forbidden of ['boss', 'blueprint', 'sketch', 'png', 'copy mode', 'question', 'clarif', 'business']) {
      expect(text, `prompt.txt must not mention "${forbidden}"`).not.toContain(forbidden)
    }
    expect(text).toContain('build complete')
  })

  it('is LF-only with a single trailing newline', async () => {
    const text = await readFile(path.join(HERE, 'prompt.txt'), 'utf8')
    expect(text).not.toContain('\r')
    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
  })
})

describe('the smoke budget is ENFORCED, not merely pinned', () => {
  const line = 'SMOKE-PASS 91.4'

  it('leaves a run inside the budget exactly as the gates left it', () => {
    const out = applySmokeBudget({ smoke: true, elapsedMin: 11.9, verdictLine: line, exitCode: 0 })
    expect(out).toEqual({ verdictLine: line, exitCode: 0, breached: false })
  })

  it('fails a smoke run that overruns, whatever the gates said', () => {
    // "completes in ≤ 12 minutes" is a Success Criterion, and a criterion nothing
    // checks is a wish. The gate result is kept in the line so the evidence still says
    // what the run scored.
    const out = applySmokeBudget({ smoke: true, elapsedMin: 18.42, verdictLine: line, exitCode: 0 })
    expect(out.breached).toBe(true)
    expect(out.exitCode).toBe(1)
    expect(out.verdictLine).toContain('SMOKE-FAIL')
    expect(out.verdictLine).toContain('18.4 min')
    expect(out.verdictLine).toContain(line)
  })

  it('never touches a full gating run — that budget is per segment, and INFRA', () => {
    const out = applySmokeBudget({ smoke: false, elapsedMin: 44, verdictLine: 'PASS 91', exitCode: 0 })
    expect(out).toEqual({ verdictLine: 'PASS 91', exitCode: 0, breached: false })
  })

  it('measures wall-clock minutes from the run start', () => {
    const started = new Date('2026-07-29T10:00:00.000Z')
    expect(elapsedMinutes(started, started.getTime() + 90_000)).toBe(1.5)
  })
})
