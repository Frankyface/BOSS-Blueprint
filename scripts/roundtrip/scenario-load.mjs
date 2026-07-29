/**
 * R1.4 — scenario loading and validation.
 *
 * A scenario that fails its schema aborts the run as INFRA **before the browser
 * opens**: an invalid expectation list would otherwise produce a verdict against a
 * moving target, which is worse than no verdict at all.
 *
 * `ref` handle uniqueness is asserted here rather than in the JSON Schema — draft-07
 * cannot express "unique across a nested collection" — and the pen clusters' targets
 * are resolved against those refs, so a typo in a target is caught at load time
 * instead of showing up as a mystifying stroke-count mismatch three segments later.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCENARIO_SCHEMA_PATH = path.join(HERE, 'scenarios', 'scenario.schema.json');

export class ScenarioError extends Error {
  constructor(message, problems = []) {
    super(message);
    this.name = 'ScenarioError';
    this.problems = problems;
  }
}

/** Where scenario `<id>` lives, so callers never hand-build the path. */
export function scenarioPathFor(id) {
  return path.join(HERE, 'scenarios', `scenario-${id}.json`);
}

/**
 * @param {string} file
 * @returns {Promise<object>} the frozen scenario
 * @throws {ScenarioError} on a schema violation or a cross-reference problem
 */
export async function loadScenario(file) {
  const [schemaText, scenarioText] = await Promise.all([
    readFile(SCENARIO_SCHEMA_PATH, 'utf8'),
    readFile(file, 'utf8'),
  ]);

  let scenario;
  try {
    scenario = JSON.parse(scenarioText);
  } catch (err) {
    throw new ScenarioError(`${path.basename(file)} is not valid JSON: ${err.message}`);
  }

  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(JSON.parse(schemaText));
  if (!validate(scenario)) {
    throw new ScenarioError(
      `${path.basename(file)} does not validate against scenario.schema.json`,
      (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`),
    );
  }

  const problems = crossCheck(scenario);
  if (problems.length > 0) {
    throw new ScenarioError(`${path.basename(file)} is internally inconsistent`, problems);
  }

  return Object.freeze(scenario);
}

/** The rules a JSON Schema cannot state. */
export function crossCheck(scenario) {
  const problems = [];
  const refs = new Set();
  const pageNames = new Set(scenario.pages.map((p) => p.name));

  for (const page of scenario.pages) {
    for (const block of page.blocks) {
      if (refs.has(block.ref)) problems.push(`duplicate block ref "${block.ref}"`);
      refs.add(block.ref);

      if (block.origin.kind === 'template' && !block.origin.id) {
        problems.push(`${block.ref}: a template-origin block needs origin.id`);
      }
      if (block.origin.kind === 'insert' && block.origin.id) {
        problems.push(`${block.ref}: an inserted block must not carry origin.id`);
      }
      if ((block.type === 'heading' || block.type === 'text') && !block.textFromFixture) {
        if (!block.copyMode) problems.push(`${block.ref}: a copy block needs copyMode`);
        if (block.copyMode === 'generate' && !block.generateDescription) {
          problems.push(`${block.ref}: a generate block needs generateDescription`);
        }
      }
      if (block.type === 'imageSlot') {
        if (!block.fit) problems.push(`${block.ref}: an image slot needs fit`);
        if (!block.description) problems.push(`${block.ref}: an image slot needs a description`);
      }
      if (block.type === 'button') {
        if (!block.label) problems.push(`${block.ref}: a button needs a label`);
        if (!block.link) problems.push(`${block.ref}: a button needs a link`);
      }
      if (block.type === 'navBar' && !block.items) problems.push(`${block.ref}: a nav bar needs items`);
      for (const link of linksOf(block)) {
        if (link.kind === 'page' && !pageNames.has(link.page)) {
          problems.push(`${block.ref}: links to page "${link.page}", which the scenario does not declare`);
        }
        if (link.kind === 'external' && !link.url) problems.push(`${block.ref}: an external link needs a url`);
      }
    }
  }

  for (const page of scenario.pages) {
    for (const cluster of page.pen ?? []) {
      if (refs.has(cluster.ref)) problems.push(`duplicate pen ref "${cluster.ref}"`);
      refs.add(cluster.ref);
      const onPage = page.blocks.some((b) => b.ref === cluster.target);
      if (!onPage) {
        problems.push(`pen cluster "${cluster.ref}" targets "${cluster.target}", not a block on ${page.name}`);
      }
    }
  }

  if (scenario.start.mode === 'template' && !scenario.start.template) {
    problems.push('start.mode "template" needs start.template');
  }
  if (scenario.start.mode === 'blank' && scenario.start.template) {
    problems.push('start.mode "blank" must not name a template');
  }
  if (scenario.start.mode === 'blank') {
    const seeded = scenario.pages.flatMap((p) => p.blocks).filter((b) => b.origin.kind === 'template');
    if (seeded.length > 0) {
      problems.push(`a blank start cannot adopt template blocks (${seeded.map((b) => b.ref).join(', ')})`);
    }
  }

  return problems;
}

function linksOf(block) {
  const links = [];
  if (block.link) links.push(block.link);
  for (const item of block.items ?? []) links.push(item.link);
  return links;
}
