// @vitest-environment node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  candidateSentences,
  BUILD_NOTES_MISPLACED_HINT,
  collectToolUses,
  extractFinalText,
  parseTranscript,
  scanFinalText,
  scanPermissionDenials,
  scanSegment,
  scanToolUses,
  stripForScan,
  TranscriptInfraError,
  triageBuildNotes,
} from './scan-transcript.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const line = (event) => `${JSON.stringify(event)}\n`
const assistantText = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
const success = (result) => ({ type: 'result', subtype: 'success', result })

describe('R5.1 — parsing', () => {
  it('treats a malformed line as INFRA, never as a skipped line', () => {
    // Silently skipping is how a question hides.
    expect(() => parseTranscript(`${line(assistantText('ok'))}{not json\n`)).toThrow(TranscriptInfraError)
  })

  it('collects tool uses across every assistant event', () => {
    const text =
      line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } }) +
      line({ type: 'assistant', content: [{ type: 'tool_use', name: 'Write' }] })
    expect(collectToolUses(parseTranscript(text)).map((u) => u.name)).toEqual(['Read', 'Write'])
  })

  it('prefers the successful result event for the final text', () => {
    const events = parseTranscript(line(assistantText('penultimate')) + line(success('the answer')))
    expect(extractFinalText(events)).toBe('the answer')
  })

  it('falls back to the last assistant text when there is no success result', () => {
    const events = parseTranscript(line(assistantText('first')) + line(assistantText('last')))
    expect(extractFinalText(events)).toBe('last')
  })

  it('returns null when neither exists, so H2 is reported unevaluable', () => {
    expect(extractFinalText(parseTranscript(line({ type: 'system', subtype: 'init' })))).toBeNull()
  })
})

describe('R5.2 — rule 1, tool level', () => {
  it.each(['AskUserQuestion', 'ExitPlanMode'])('fails H2 on %s', (name) => {
    expect(scanToolUses([{ name }])).toHaveLength(1)
  })

  it('fails H2 on any tool the catch-all predicate matches', () => {
    expect(scanToolUses([{ name: 'mcp__thing__ask_user_input' }])).toHaveLength(1)
    expect(scanToolUses([{ name: 'AskUserForColour' }])).toHaveLength(1)
  })

  it('does not fire on ordinary tools', () => {
    expect(scanToolUses([{ name: 'Read' }, { name: 'Write' }, { name: 'Bash' }])).toHaveLength(0)
  })
})

describe('R5.3 — the strip order', () => {
  it('removes fenced blocks first, keeping character offsets', () => {
    const stripped = stripForScan('before\n```\nDo you want more?\n```\nafter')
    expect(stripped).not.toContain('Do you want more')
    expect(stripped.length).toBe('before\n```\nDo you want more?\n```\nafter'.length)
  })

  it('removes inline code spans', () => {
    expect(stripForScan('run `is this your file?` now')).not.toContain('your file')
  })

  it('removes guillemet and quoted spans so client copy may contain a question mark', () => {
    expect(stripForScan('kept «Do you deliver?» verbatim')).not.toContain('Do you deliver')
    expect(stripForScan('reads "Can you dig it?" exactly')).not.toContain('Can you dig it')
  })

  it('caps a quoted span at QUOTE_SPAN_CAP so one stray quote cannot swallow the message', () => {
    const long = `"${'x'.repeat(500)}" and then: does your logo exist?`
    // The over-long span is NOT treated as a quote, so the real question still surfaces.
    expect(scanFinalText(long).hits).toHaveLength(1)
  })

  it('splits on lines first, then on sentence boundaries', () => {
    const sentences = candidateSentences('One. Two!\nThree?')
    expect(sentences.map((s) => s.text)).toEqual(['One.', 'Two!', 'Three?'])
    expect(sentences[2].offset).toBe('One. Two!\n'.length)
  })
})

describe('R5.3 — rule 2a, the extended interrogative set (ruling 6)', () => {
  const cases = [
    ['Is this what you wanted?', 'is'],
    ['Are you happy for me to proceed?', 'are'],
    ['Does your business have a logo?', 'does'],
    ['Did you want the gallery first?', 'did'],
    ['You want me to use the green?', 'reverse order'],
    ['Which colour would you like?', 'which/would'],
  ]
  it.each(cases)('fails H2 on %s (%s)', (sentence) => {
    expect(scanFinalText(sentence).hits.length).toBeGreaterThan(0)
  })

  it('strips trailing decoration before testing for the question mark', () => {
    expect(scanFinalText('**Is this what you wanted?**').hits).toHaveLength(1)
  })

  it('does not fire on a rhetorical question with no second-person address', () => {
    expect(scanFinalText('Why did I choose a two-column hero?').hits).toHaveLength(0)
  })
})

describe('R5.3 — rule 2a clause 3, the first-person offer (2026-07-29)', () => {
  // Both earlier clauses need the word `you` somewhere. Every sentence here is an ask
  // that cannot be answered in `-p` mode, and every one of them passed H2 before this.
  it.each([
    ['Should I add a favicon as well?', 'should i'],
    ['Shall I wire the footer nav to the same four pages?', 'shall i'],
    ['Shall we go with the sand colour?', 'shall we'],
    ['Want me to swap the hero photo?', 'want me to'],
    ['Anything else?', 'anything else'],
  ])('fails H2 on %s (%s)', (sentence) => {
    const { hits } = scanFinalText(sentence)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].rule).toBe('R5.3-2a-offer')
  })

  it('still needs the question mark — clause 3 is part of 2a, not 2b', () => {
    expect(scanFinalText('Anything else the client sketched is already on the page.').hits).toHaveLength(0)
  })

  it('is word-order sensitive, so an ordinary statement about myself survives', () => {
    expect(scanFinalText('I should include the opening hours, so I did.').hits).toHaveLength(0)
    expect(scanFinalText('Should the hero be full width?').hits).toHaveLength(0)
  })
})

describe('R5.3 — rule 2b, the phrase list', () => {
  it.each([
    'Let me know if that works.',
    'Please confirm the phone number.',
    'I need more information about this.',
    'Before I proceed, one note.',
    'Awaiting your go-ahead.',
    'I am unable to proceed without the photo.',
    'Which option do you prefer?',
  ])('fails H2 on %s', (sentence) => {
    expect(scanFinalText(sentence).hits.length).toBeGreaterThan(0)
  })

  it('records the rule id and character offset of every hit', () => {
    const { hits } = scanFinalText('All done.\nLet me know if that works.')
    expect(hits[0].rule).toContain('let me know')
    expect(hits[0].offset).toBe('All done.\n'.length)
  })
})

describe('R5.5 — the regression corpus', () => {
  it('fails every mustFail entry and passes every mustPass entry', async () => {
    const corpus = JSON.parse(await readFile(path.join(HERE, 'scan-corpus.json'), 'utf8'))
    for (const entry of corpus.mustFail) {
      expect(scanFinalText(entry.text).hits.length, `mustFail: ${entry.text}`).toBeGreaterThan(0)
    }
    for (const entry of corpus.mustPass) {
      expect(scanFinalText(entry.text).hits, `mustPass: ${entry.text}`).toHaveLength(0)
    }
  })
})

describe('R5.6 — permission-denial detection', () => {
  const denial = {
    type: 'user',
    message: {
      content: [{ type: 'tool_result', is_error: true, tool_use_id: 't1', content: 'Bash(npm i) requires approval' }],
    },
  }

  it('counts tool_result errors that read as a blocked tool', () => {
    expect(scanPermissionDenials(parseTranscript(line(denial)))).toHaveLength(1)
  })

  it('routes an H2 failure WITH a denial to the harness, never to the product', () => {
    const report = scanSegment({
      transcriptText: line(denial) + line(success('Which colour do you want?')),
      pageCount: 1,
    })
    expect(report.h2.ok).toBe(false)
    expect(report.routing).toBe('harness')
  })

  it('routes an H2 failure without a denial to the product', () => {
    const report = scanSegment({ transcriptText: line(success('Which colour do you want?')), pageCount: 1 })
    expect(report.routing).toBe('product')
  })

  it('reports a denial with H2 passing as a WARN only', () => {
    const report = scanSegment({ transcriptText: line(denial) + line(success('BUILD COMPLETE')), pageCount: 1 })
    expect(report.h2.ok).toBe(true)
    expect(report.permissionDenialWarn).toBe(true)
  })
})

describe('R5.4 — the completion cross-check', () => {
  const complete = line(success('All done.\n\nBUILD COMPLETE'))

  it('passes H3 with the sentinel, index.html and BUILD_NOTES', () => {
    const report = scanSegment({
      transcriptText: complete,
      indexHtmlExists: true,
      buildNotesExists: true,
      pageCount: 4,
    })
    expect(report.h3.ok).toBe(true)
    expect(report.h8.ok).toBe(true)
  })

  it('fails H3 when the sentinel is not the final non-empty line', () => {
    const report = scanSegment({
      transcriptText: line(success('BUILD COMPLETE\n\nOne more thing.')),
      indexHtmlExists: true,
      buildNotesExists: true,
    })
    expect(report.h3.sentinelPresent).toBe(false)
  })

  it('routes error_max_turns to infra/turns rather than to a question', () => {
    const report = scanSegment({
      transcriptText: line({ type: 'result', subtype: 'error_max_turns' }) ,
      indexHtmlExists: true,
      buildNotesExists: true,
    })
    expect(report.h3.maxTurns).toBe(true)
  })

  /**
   * BUILD_NOTES.md lives at the BUILD root — `site/` — and `run.mjs` resolves
   * `buildNotesExists` there (docs/decisions.md, 2026-07-29). Live-run attempt 4 failed a
   * complete, correct build because the check looked one level up, so the three placements
   * are pinned here: in the build root passes; ONLY at the sandbox root still fails, but
   * names the misreading; absent fails plainly.
   */
  describe('the BUILD_NOTES location (attempt-4 regression)', () => {
    const at = (extra) => scanSegment({ transcriptText: complete, indexHtmlExists: true, ...extra })

    it('PASSES when the notes are in the build root', () => {
      const report = at({ buildNotesExists: true, buildNotesAtSandboxRoot: false })
      expect(report.h3.ok).toBe(true)
      expect(report.h8.ok).toBe(true)
      expect(report.h3.hint).toBeUndefined()
    })

    it('FAILS, with the misreading NAMED, when they are only at the sandbox root', () => {
      const report = at({ buildNotesExists: false, buildNotesAtSandboxRoot: true })
      expect(report.h3.ok).toBe(false)
      expect(report.h8.ok).toBe(false)
      // Precision, not tolerance: still a FAIL, but it says what actually happened.
      expect(report.h3.hint).toBe(BUILD_NOTES_MISPLACED_HINT)
      expect(report.h8.hint).toBe(BUILD_NOTES_MISPLACED_HINT)
      expect(report.h3.hint).toMatch(/site\/BUILD_NOTES\.md/)
      expect(report.h3.hint).toMatch(/sandbox root/)
      expect(report.h3.buildNotesAtSandboxRoot).toBe(true)
    })

    it('FAILS plainly when they do not exist anywhere — no misleading hint', () => {
      const report = at({ buildNotesExists: false, buildNotesAtSandboxRoot: false })
      expect(report.h3.ok).toBe(false)
      expect(report.h8.ok).toBe(false)
      expect(report.h3.hint).toBeUndefined()
      expect(report.h8.hint).toBeUndefined()
    })

    it('does not let a stray copy rescue a build whose notes ARE in the build root', () => {
      // Both present is still a pass — the stray file is only ever a diagnostic.
      expect(at({ buildNotesExists: true, buildNotesAtSandboxRoot: true }).h3.ok).toBe(true)
    })
  })
})

describe('R5.7 — BUILD_NOTES triage', () => {
  const notes = [
    '# Build notes',
    '- The brief did not say which photo belongs on Our Work, so I used the first.',
    '- Nav order taken from the walkthrough.',
    '- The contact button had no link target given, so I left it inert.',
  ].join('\n')

  it('flags package-defect candidates without failing H2', () => {
    const triage = triageBuildNotes(notes, 4)
    expect(triage.entryCount).toBe(3)
    expect(triage.defectCandidates.length).toBeGreaterThan(0)
    expect(triage.friction).toBe(false)
  })

  it('raises FRICTION on strictly more than 1.5 entries per page, with no rounding', () => {
    const two = '- missing thing one\n- missing thing two\n- missing thing three\n'
    expect(triageBuildNotes(two, 2).friction).toBe(false) // 3 === 1.5 * 2, strict >
    expect(triageBuildNotes(`${two}- missing thing four\n`, 2).friction).toBe(true)
  })
})
