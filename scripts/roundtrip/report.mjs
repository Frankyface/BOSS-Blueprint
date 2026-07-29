/**
 * SEG-6 merger — deterministic + agent → `report.json` / `report.md` / `verdict.txt`.
 *
 * R8.3's verdict rule is arithmetic, not judgment: PASS = all H gates ∧ total ≥ 85 ∧
 * every floor. There is no `--force-pass`, no waiver file and no known-flaky list
 * (R10.2); a rule that is wrong gets changed in code with a `docs/decisions.md` entry
 * and the run is repeated from scratch.
 *
 * Every miss carries its evidence link AND its pre-filled routing row, because a FAIL
 * whose owner is unclear is a FAIL that gets argued about instead of fixed.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  EVAL_SCORE_MAX,
  EVIDENCE_ARTEFACT_RE,
  NEAR_MISS_FLOOR,
  PASS_SCORE,
  S3_MIN_ITEM_SCORE,
  SCORE_WEIGHTS,
  S5_EVAL_POINTS,
} from './thresholds.mjs';

/** The routing table of the feature file's "Failure-class routing" section, as data. */
export const ROUTES = Object.freeze({
  H1: 'Stage 3 packaging / schema / export mapper — or Stage 2 store if the UI did not record the action',
  H2: 'brief generator §3 fallback strings (content) or prompt.txt (process); harness if a permission denial is present',
  H3: 'brief DoD wording, or --max-turns (infra) — read the transcript to tell which',
  H4: 'brief generator §4.4 inventory',
  H5: 'brief generator §4.4 nav-map algorithm',
  H6: 'strengthen brief DoD item 4 wording (builder editorialising)',
  H7: 'brief generator §4.4 / assets section',
  H8: 'brief DoD wording — BUILD_NOTES.md is required at the build root',
  S1: 'brief §4.4 algorithms; PNG contract',
  S2: 'brief §4.4 algorithms; PNG contract',
  S3: 'brief copy-list generation; V5 / description-field coaching if the description itself was vague',
  S4: 'brief generator §4.4 / assets usage lines',
  S5: 'brief generator look-&-feel rendering of settings',
  S6: 'brief §4.5 narration; legibility → renderer ruling',
  INFRA: 'harness only — never a product FAIL',
});

/** Every artefact filename an evidence string names, not merely whether it names one. */
export function citedArtefacts(evidence) {
  const global = new RegExp(EVIDENCE_ARTEFACT_RE.source, 'g');
  return [...String(evidence ?? '').matchAll(global)].map((match) => match[0]);
}

/**
 * R7.3 — an evaluator item is only counted if it is in range AND cites an artefact
 * that WAS ACTUALLY STAGED.
 *
 * The shape check alone was satisfied by any string matching the regex, so
 * `"shots/homepage.png shows the hero"` passed for a site whose only shot is
 * `shots/home.png` — a citation to a file that does not exist, which is exactly the
 * shape a hallucinated one takes. Intersecting with the staged listing turns "cites an
 * artefact" into "cites an artefact the evaluator could see".
 *
 * @param {string[]|null} stagedFiles the listing returned by `stageEvaluatorSandbox`.
 *   `null` means the caller has no listing and only the shape can be checked; `run.mjs`
 *   always passes one.
 */
export function acceptJudgments({ judgments, rubricManifest, stagedFiles = null }) {
  const accepted = [];
  const rejected = [];
  const known = new Set(rubricManifest.items.map((i) => i.id));
  const staged = stagedFiles === null ? null : new Set(stagedFiles);
  for (const item of judgments?.items ?? []) {
    const cited = typeof item.evidence === 'string' ? citedArtefacts(item.evidence) : [];
    if (!known.has(item.id)) {
      rejected.push({ item, why: 'id is not in rubric-manifest.json' });
    } else if (!Number.isInteger(item.score) || item.score < 0 || item.score > EVAL_SCORE_MAX) {
      rejected.push({ item, why: `score must be an integer 0..${EVAL_SCORE_MAX}` });
    } else if (cited.length === 0) {
      rejected.push({ item, why: 'evidence must name at least one artefact file' });
    } else if (staged !== null && !cited.some((name) => staged.has(name))) {
      rejected.push({ item, why: `evidence cites ${cited.join(', ')}, none of which was staged into the evaluator sandbox` });
    } else {
      accepted.push(item);
    }
  }
  const missing = [...known].filter((id) => !accepted.some((i) => i.id === id));
  return { accepted, rejected, missing };
}

function meanOf(scores) {
  return scores.length === 0 ? 0 : scores.reduce((n, s) => n + s, 0) / scores.length;
}

/**
 * A floor over an EMPTY score array reads UNMET, never met.
 *
 * `[].every(…)` is `true`, so an evaluator that returned nothing for a dimension used
 * to clear that dimension's floor by saying nothing at all — the one direction a
 * missing measurement must never be allowed to fall. R10.7: a criterion that passes
 * vacuously is a criterion that has been weakened.
 */
function floorOver(scores, predicate) {
  return scores.length >= 1 && scores.every(predicate);
}

/**
 * Merge one run's evidence into the score table, the floors and the verdict.
 *
 * @param {object} input
 * @param {object} input.det      `evaluate.json`
 * @param {object} input.scan     `scan-report.json`
 * @param {object} input.gate     `gate-report.json`
 * @param {object|null} input.judged accepted evaluator items, or null in --smoke
 * @returns {object} the `report.json` payload
 */
export function mergeReport({ det, scan, gate, judged, scenarioId, smoke = false }) {
  const gates = {
    H1: { ok: gate?.ok === true, problems: (gate?.failures ?? []).map((f) => `${f.code}: ${f.message}`) },
    H2: { ok: scan?.h2?.ok === true, problems: (scan?.h2?.hits ?? []).map(describeHit) },
    H3: { ok: scan?.h3?.ok === true, problems: describeH3(scan?.h3) },
    H4: det.gates.H4,
    H5: det.gates.H5,
    H6: det.gates.H6,
    H7: det.gates.H7,
    H8: { ok: scan?.h8?.ok === true, problems: scan?.h8?.ok ? [] : ['BUILD_NOTES.md is missing at the build root'] },
  };

  const byDim = (prefix) => (judged ?? []).filter((i) => i.id.startsWith(`${prefix}:`)).map((i) => i.score);

  const s2Scores = byDim('S2');
  const s3Scores = byDim('S3');
  const s5Scores = byDim('S5');
  const s6Scores = byDim('S6');

  const dimensions = {
    S1: { points: det.dimensions.S1.points, max: SCORE_WEIGHTS.S1, floorMet: det.dimensions.S1.floorMet, detail: det.dimensions.S1 },
    S2: {
      points: smoke ? null : (SCORE_WEIGHTS.S2 * meanOf(s2Scores)) / EVAL_SCORE_MAX,
      max: SCORE_WEIGHTS.S2,
      floorMet: smoke ? true : floorOver(s2Scores, (s) => s > 0),
      detail: { scores: s2Scores },
    },
    S3: {
      points: smoke ? null : (SCORE_WEIGHTS.S3 * meanOf(s3Scores)) / EVAL_SCORE_MAX,
      max: SCORE_WEIGHTS.S3,
      floorMet:
        det.dimensions.S3.allSane && (smoke || floorOver(s3Scores, (s) => s >= S3_MIN_ITEM_SCORE)),
      detail: { det: det.dimensions.S3, scores: s3Scores },
    },
    S4: { points: det.dimensions.S4.points, max: SCORE_WEIGHTS.S4, floorMet: det.dimensions.S4.floorMet, detail: det.dimensions.S4 },
    S5: {
      points: det.dimensions.S5.points + (smoke ? 0 : (S5_EVAL_POINTS * meanOf(s5Scores)) / EVAL_SCORE_MAX),
      max: SCORE_WEIGHTS.S5,
      floorMet: det.dimensions.S5.floorMet,
      detail: { det: det.dimensions.S5, scores: s5Scores },
    },
    S6: {
      points: smoke ? null : (SCORE_WEIGHTS.S6 * meanOf(s6Scores)) / EVAL_SCORE_MAX,
      max: SCORE_WEIGHTS.S6,
      floorMet: smoke ? true : floorOver(s6Scores, (s) => s > 0),
      detail: { scores: s6Scores },
    },
  };

  const total = Object.values(dimensions).reduce((n, d) => n + (d.points ?? 0), 0);
  const gatesOk = Object.values(gates).every((g) => g.ok);
  const floorsOk = Object.values(dimensions).every((d) => d.floorMet);

  let verdict;
  if (smoke) verdict = gatesOk && floorsOk ? 'SMOKE-PASS' : 'SMOKE-FAIL';
  else if (gatesOk && total >= PASS_SCORE && floorsOk) verdict = 'PASS';
  else if (gatesOk && total >= NEAR_MISS_FLOOR) verdict = 'NEAR MISS';
  else verdict = 'FAIL';

  return {
    scenario: scenarioId,
    verdict,
    // R8.3: NEAR MISS is REPORTED AS FAIL. It exists to say how far off, not to pass.
    exitCode: verdict === 'PASS' || verdict === 'SMOKE-PASS' ? 0 : 1,
    total: Number(total.toFixed(2)),
    passScore: PASS_SCORE,
    gates,
    dimensions,
    misses: collectMisses(gates, dimensions),
    scanNotes: {
      permissionDenials: scan?.permissionDenials?.length ?? 0,
      routing: scan?.routing ?? null,
      buildNotes: scan?.buildNotes ?? null,
    },
  };
}

function describeHit(hit) {
  return hit.sentence
    ? `${hit.rule} @${hit.offset}: ${hit.sentence}`
    : `${hit.rule}: tool "${hit.tool}" — ${hit.reason}`;
}

function describeH3(h3) {
  if (!h3 || h3.ok) return [];
  const problems = [];
  if (h3.unevaluableFinalText) problems.push('no final assistant message — H2 was unevaluable (INFRA note)');
  if (!h3.sentinelPresent) problems.push('BUILD COMPLETE was not the final non-empty line');
  if (!h3.indexHtmlExists) problems.push('site/index.html does not exist');
  if (!h3.buildNotesExists) {
    problems.push(h3.hint ?? 'site/BUILD_NOTES.md does not exist');
  }
  if (h3.maxTurns) problems.push('the session ended with error_max_turns — infra/turns');
  return problems;
}

function collectMisses(gates, dimensions) {
  const misses = [];
  for (const [id, gate] of Object.entries(gates)) {
    if (gate.ok) continue;
    for (const problem of gate.problems) misses.push({ id, kind: 'gate', problem, route: ROUTES[id] });
  }
  for (const [id, dim] of Object.entries(dimensions)) {
    if (dim.floorMet) continue;
    misses.push({ id, kind: 'floor', problem: `${id} floor not met`, route: ROUTES[id] });
  }
  return misses;
}

/* ───────────────────────── rendering ───────────────────────── */

export function renderMarkdown(report, { runDir, manifest }) {
  const lines = [
    `# Round-trip report — scenario ${report.scenario}`,
    '',
    `**${report.verdict} ${report.total}/100** (pass needs ≥ ${report.passScore}, all hard gates, all floors)`,
    '',
    `- run dir: \`${runDir}\``,
    `- commit: \`${manifest?.git?.sha ?? 'unknown'}\` (${manifest?.git?.clean ? 'clean' : 'DIRTY'})`,
    `- target: \`${manifest?.target ?? '?'}\` · builder model: \`${manifest?.builder?.resolvedModel ?? 'n/a'}\``,
    `- run validity: ${manifest?.invalid ? '**INVALID — a rule file changed mid-run**' : 'valid'}`,
    '',
    '## Hard gates',
    '',
    '| Gate | Result | Detail |',
    '|---|---|---|',
  ];
  for (const [id, gate] of Object.entries(report.gates)) {
    lines.push(`| ${id} | ${gate.ok ? 'PASS' : '**FAIL**'} | ${escapeCell(gate.problems.join('; ')) || '—'} |`);
  }

  lines.push('', '## Score', '', '| Dim | Points | Max | Floor |', '|---|---|---|---|');
  for (const [id, dim] of Object.entries(report.dimensions)) {
    lines.push(
      `| ${id} | ${dim.points === null ? 'skipped' : dim.points.toFixed(1)} | ${dim.max} | ${dim.floorMet ? 'met' : '**missed**'} |`,
    );
  }
  lines.push(`| **Total** | **${report.total.toFixed(1)}** | **100** | |`);

  if (report.misses.length > 0) {
    lines.push('', '## Misses and where they route', '', '| Id | Problem | Fix lands in |', '|---|---|---|');
    for (const miss of report.misses) {
      lines.push(`| ${miss.id} | ${escapeCell(miss.problem)} | ${escapeCell(miss.route ?? '')} |`);
    }
  }

  const notes = report.scanNotes.buildNotes;
  if (notes) {
    lines.push(
      '',
      '## BUILD_NOTES triage',
      '',
      `${notes.entryCount} entr${notes.entryCount === 1 ? 'y' : 'ies'}, ` +
        `${notes.defectCandidates.length} package-defect candidate(s)` +
        `${notes.friction ? ' — **FRICTION**: the brief is making the builder guess too much' : ''}`,
    );
    for (const candidate of notes.defectCandidates) lines.push(`- ${candidate}`);
  }

  if (report.scanNotes.permissionDenials > 0) {
    lines.push(
      '',
      `> ${report.scanNotes.permissionDenials} permission denial(s) in the transcript. ` +
        'R5.6: an H2 failure alongside a denial routes to **harness (allowlist too tight)**, never to the product.',
    );
  }

  return `${lines.join('\n')}\n`;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export async function writeReport({ outDir, report, runDir, manifest }) {
  await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outDir, 'report.md'), renderMarkdown(report, { runDir, manifest }), 'utf8');
  return report;
}
