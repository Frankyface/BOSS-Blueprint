/**
 * SEG-6 judgment layer (R7) — the evaluator agent's sandbox, inputs and output contract.
 *
 * Two properties matter more than anything else here:
 *   R7.2 the builder transcript is NEVER copied into the evaluator sandbox — no anchoring
 *        on the builder's self-report — and the staged contents are asserted against a
 *        CLOSED expected set, so "we didn't copy it" is a check, not a claim;
 *   R7.4 one malformed output → exactly one retry → then INFRA, never a product FAIL. A
 *        flaky evaluator must not be able to manufacture a verdict in either direction.
 */

import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv from 'ajv';

import { EVALUATOR_SANDBOX_ALLOWED, EVAL_SCORE_MAX } from './thresholds.mjs';
import { listRecursive } from './sandbox.mjs';

export const JUDGMENTS_SCHEMA = Object.freeze({
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Round-trip evaluator output (protocol Appendix B)',
  type: 'object',
  additionalProperties: false,
  required: ['scenario', 'items'],
  properties: {
    scenario: { type: 'string', minLength: 1 },
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'score', 'evidence'],
        properties: {
          id: { type: 'string', minLength: 1 },
          score: { type: 'integer', minimum: 0, maximum: EVAL_SCORE_MAX },
          evidence: { type: 'string', minLength: 1 },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
});

/**
 * R7.2 — the harness generates the item list, so the evaluator cannot invent, skip or
 * rename an item. Every id here is derived from `site.json` and the scenario, never typed.
 */
export function buildRubricManifest({ site, scenario }) {
  const items = [];
  for (const sitePage of site.pages ?? []) {
    items.push({ id: `S2:${sitePage.slug}`, dimension: 'S2', subject: `sketch vs shot for "${sitePage.name}"` });
    items.push({ id: `S5:${sitePage.slug}`, dimension: 'S5', subject: `vibe of "${sitePage.name}"` });
    for (const block of sitePage.blocks ?? []) {
      if (block.copyMode === 'generate') {
        items.push({
          id: `S3:${block.id}`,
          dimension: 'S3',
          subject: block.generateDescription ?? '',
          page: sitePage.slug,
        });
      }
    }
  }
  for (const scenarioPage of scenario.pages ?? []) {
    for (const cluster of scenarioPage.pen ?? []) {
      items.push({
        id: `S6:${cluster.ref}`,
        dimension: 'S6',
        role: cluster.role,
        subject: cluster.meaning ?? cluster.ref,
        page: scenarioPage.slug,
      });
    }
  }
  return { scenario: scenario.id, generatedBy: 'harness', items };
}

/**
 * Stage the evaluator sandbox, then PROVE it holds only what R7.2 allows.
 * @returns {Promise<{ dir: string, listing: string[] }>}
 */
export async function stageEvaluatorSandbox({ sandboxDir, packageDir, shotsDir, siteJsonPath, scenarioPath, buildNotesPath, harnessDir, rubricManifest }) {
  await mkdir(sandboxDir, { recursive: true });
  await copyFile(siteJsonPath, path.join(sandboxDir, 'site.json'));
  await copyFile(scenarioPath, path.join(sandboxDir, 'scenario.json'));
  await copyFile(path.join(harnessDir, 'rubric.md'), path.join(sandboxDir, 'rubric.md'));
  await writeFile(
    path.join(sandboxDir, 'rubric-manifest.json'),
    `${JSON.stringify(rubricManifest, null, 2)}\n`,
    'utf8',
  );
  if (buildNotesPath) {
    await copyFile(buildNotesPath, path.join(sandboxDir, 'BUILD_NOTES.md')).catch(() => undefined);
  }

  for (const [from, to] of [
    [path.join(packageDir, 'pages'), path.join(sandboxDir, 'pages')],
    [shotsDir, path.join(sandboxDir, 'shots')],
  ]) {
    await mkdir(to, { recursive: true });
    const entries = await readdir(from, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.png')) continue;
      await copyFile(path.join(from, entry.name), path.join(to, entry.name));
    }
  }

  const listing = await listRecursive(sandboxDir);
  const stray = listing.filter((entry) => {
    if (entry.startsWith('pages/') || entry.startsWith('shots/')) return !entry.endsWith('.png');
    return !EVALUATOR_SANDBOX_ALLOWED.includes(entry);
  });
  if (stray.length > 0) {
    throw new Error(`the evaluator sandbox holds files outside the closed input set: ${stray.join(', ')}`);
  }
  if (listing.some((entry) => /transcript|scan-report|prompt\.txt/.test(entry))) {
    throw new Error('the builder transcript reached the evaluator sandbox (R7.2)');
  }
  return { dir: sandboxDir, listing };
}

/** The evaluator's own prompt. Plumbing only, exactly like the builder's. */
export const EVALUATOR_PROMPT =
  'Read ./rubric.md and follow it. Score every item listed in ./rubric-manifest.json, ' +
  'write ./judgments.json as the rubric specifies, then print exactly EVALUATION COMPLETE ' +
  'as your final line.\n';

/** @returns {{ ok: boolean, problems: string[], judgments: object|null }} */
export function validateJudgments(text, rubricManifest) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, problems: [`judgments.json is not valid JSON: ${err.message}`], judgments: null };
  }
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(JUDGMENTS_SCHEMA);
  if (!validate(parsed)) {
    return {
      ok: false,
      problems: (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`),
      judgments: null,
    };
  }
  if (parsed.scenario !== rubricManifest.scenario) {
    return {
      ok: false,
      problems: [`judgments.json is for scenario "${parsed.scenario}", expected "${rubricManifest.scenario}"`],
      judgments: null,
    };
  }
  return { ok: true, problems: [], judgments: parsed };
}

export async function readJudgments(sandboxDir, rubricManifest) {
  const file = path.join(sandboxDir, 'judgments.json');
  const text = await readFile(file, 'utf8').catch(() => null);
  if (text === null) return { ok: false, problems: ['judgments.json was not written'], judgments: null };
  return validateJudgments(text, rubricManifest);
}
