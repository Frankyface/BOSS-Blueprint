#!/usr/bin/env node
/**
 * THE ORCHESTRATOR — `docs/roundtrip-protocol.md` §0's pipeline, segment by segment.
 *
 *   npm run roundtrip:full  -- --scenario A --target preview
 *   npm run roundtrip:smoke
 *
 * It halts at the first failed HARD GATE: later segments are pointless once H1 is red,
 * and SEG-3 is where the money is. Exit code 0 ⇔ PASS.
 *
 * `--mock-builder <dir>` swaps the real `claude -p` session for a copy of a canned site
 * plus a synthetic transcript. It exists to prove the pipeline MECHANICALLY end to end
 * without spending a builder budget, and every run that uses it is recorded as
 * `cached: true` in the manifest — R10.4: a run with any cached segment can never be
 * part of the ship gate.
 */

import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import AdmZip from 'adm-zip';

import { applySmokeBudget, elapsedMinutes } from './budget.mjs';
import { captureSite } from './capture.mjs';
import { buildRubricManifest, EVALUATOR_PROMPT, readJudgments, stageEvaluatorSandbox } from './evaluator.mjs';
import { evaluateDeterministic } from './evaluate.mjs';
import { BUILTIN_MANIFEST, builtinsFor } from './builtin-manifest.mjs';
import { authFailureOf, buildArgv, assertSessionPurity, runSession } from './claude-session.mjs';
import { resolveExecutable } from './lib/resolve-command.mjs';
import { acceptJudgments, mergeReport, writeReport } from './report.mjs';
import { loadScenario, scenarioPathFor } from './scenario-load.mjs';
import { diffManifest } from './manifest-diff.mjs';
import {
  assertNoAncestorContext,
  createSterileConfigDir,
  detectManagedPolicy,
  isNonEmptyFile,
  PreconditionError,
  runDirName,
  runsRoot,
  scrubCredentials,
  scrubEnvironment,
} from './sandbox.mjs';
import { parseTranscript, scanSegment } from './scan-transcript.mjs';
import { assertDeployedIsHead, gitFacts, hashRuleFiles, ruleFilesDrifted, writeManifest } from './run-manifest.mjs';
import {
  BUILDER_TIMEOUT_MIN,
  CLIENT_BUDGET_MIN,
  EVALUATOR_MAX_RETRIES,
  SEGMENT_HARD_STOP_MIN,
} from './thresholds.mjs';

const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const MINUTE = 60_000;

/** Aliases only, never pinned version ids (`performance.md`, R4.3). */
const GATING_MODEL = 'opus';
const SMOKE_MODEL = 'haiku';

/** R4.3a — the CLI is resolved to an absolute image once and reused by both sessions. */
const CLAUDE_COMMAND = 'claude';

export function parseRunArgs(argv) {
  const out = {
    scenario: 'A',
    target: 'preview',
    smoke: false,
    mockBuilder: null,
    checkRelay: false,
    keepGoing: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--scenario') out.scenario = argv[(i += 1)];
    else if (token === '--target') out.target = argv[(i += 1)];
    else if (token === '--mock-builder') out.mockBuilder = argv[(i += 1)];
    else if (token === '--smoke') out.smoke = true;
    // R2.8 — OFF by default, and it never affects the verdict.
    else if (token === '--check-relay') out.checkRelay = true;
    else throw new Error(`unknown argument "${token}"`);
  }
  if (out.smoke) out.scenario = 'B';
  return out;
}

async function main() {
  const options = parseRunArgs(process.argv.slice(2));
  const startedAt = new Date();
  const git = await gitFacts(REPO_ROOT);
  const scenarioFile = scenarioPathFor(options.scenario);

  // R1.4 — an invalid scenario aborts as INFRA before the browser opens.
  const scenario = await loadScenario(scenarioFile);

  const runDir = path.join(runsRoot(), runDirName({ startedAt, scenarioId: scenario.id, gitSha: git.sha }));
  await mkdir(path.join(runDir, 'client'), { recursive: true });

  const manifest = {
    scenario: scenario.id,
    target: options.target,
    smoke: options.smoke,
    startedAt: startedAt.toISOString(),
    git,
    runDir,
    cached: options.mockBuilder !== null,
    invalid: false,
    ruleHashes: { start: await hashRuleFiles(HERE, scenarioFile), end: null },
    managedPolicy: await detectManagedPolicy(),
    segments: {},
  };
  await writeManifest(runDir, manifest);

  const finish = async (verdictLine, exitCode) => {
    manifest.ruleHashes.end = await hashRuleFiles(HERE, scenarioFile);
    const drift = ruleFilesDrifted(manifest.ruleHashes.start, manifest.ruleHashes.end);
    manifest.invalid = drift.length > 0;
    manifest.ruleDrift = drift;
    manifest.finishedAt = new Date().toISOString();
    manifest.elapsedMin = elapsedMinutes(startedAt);

    // The smoke budget is a SUCCESS CRITERION ("completes in ≤ 12 minutes"), so it is
    // enforced rather than merely pinned: a smoke run that took twenty minutes has not
    // met the criterion, whatever the gates said.
    const budget = applySmokeBudget({
      smoke: options.smoke,
      elapsedMin: manifest.elapsedMin,
      verdictLine,
      exitCode,
    });
    manifest.smokeBudgetBreached = budget.breached;
    const line = budget.verdictLine;
    const code = budget.exitCode;

    Object.assign(manifest, await scrubCredentials(runDir));
    manifest.verdict = line;
    await writeManifest(runDir, manifest);
    await writeFile(path.join(runDir, 'verdict.txt'), `${line}\n`, 'utf8');
    process.stdout.write(`\n${line}\n${runDir}\n`);
    process.exit(manifest.invalid ? 1 : code);
  };

  try {
    if (options.target === 'deployed') await assertDeployedFreshness(manifest);

    /* ── SEG-1 · the client ───────────────────────────────────────────── */
    await segment(manifest, 'SEG-1', CLIENT_BUDGET_MIN, async () => {
      // The already-installed Playwright CLI, invoked through node directly. Not a
      // package runner: ruling 5 keeps the whole harness off the npm registry, and
      // spawning a `.cmd` shim on Windows needs a shell we would rather not have.
      await exec(
        process.execPath,
        [
          path.join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js'),
          'test',
          '--config',
          'playwright.roundtrip.config.ts',
        ],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, ROUNDTRIP_SCENARIO: scenario.id, ROUNDTRIP_RUN_DIR: runDir, ROUNDTRIP_TARGET: options.target },
          maxBuffer: 32 * 1024 * 1024,
        },
      );
    });

    /* ── SEG-2 · the package gate (H1) ────────────────────────────────── */
    const driverReport = JSON.parse(await readFile(path.join(runDir, 'client', 'driver-report.json'), 'utf8'));
    const packagePath = path.join(runDir, driverReport.packageFilename);
    const packageDir = path.join(runDir, 'package');
    new AdmZip(await readFile(packagePath), { noSort: true }).extractAllTo(packageDir, true);
    const site = JSON.parse(await readFile(path.join(packageDir, 'site.json'), 'utf8'));

    const gate = await segment(manifest, 'SEG-2', SEGMENT_HARD_STOP_MIN, async () => {
      await exec('node', [
        path.join(HERE, 'gate.mjs'),
        '--package', packagePath,
        '--scenario', scenarioFile,
        '--out', path.join(runDir, 'gate'),
      ], { cwd: REPO_ROOT, maxBuffer: 32 * 1024 * 1024 }).catch((err) => err);
      return JSON.parse(await readFile(path.join(runDir, 'gate', 'gate-report.json'), 'utf8'));
    });
    if (!gate.ok) return finish(`FAIL — H1 package gate (${gate.failures.length} failure(s))`, 1);

    /* ── SEG-3 · the builder ──────────────────────────────────────────── */
    const builderDir = path.join(runDir, 'builder');
    const sandboxDir = path.join(builderDir, 'sandbox');
    await mkdir(sandboxDir, { recursive: true });
    await cp(packageDir, path.join(sandboxDir, 'package'), { recursive: true });
    await assertNoAncestorContext(sandboxDir);

    const prompt = await readFile(path.join(HERE, 'prompt.txt'), 'utf8');
    await writeFile(path.join(builderDir, 'prompt.txt'), prompt, 'utf8');
    const transcriptPath = path.join(builderDir, 'transcript.jsonl');

    await segment(manifest, 'SEG-3', BUILDER_TIMEOUT_MIN, async () => {
      if (options.mockBuilder) {
        manifest.builder = await runMockBuilder({ mockDir: options.mockBuilder, builderDir, sandboxDir, transcriptPath });
        return;
      }
      const { dir: configDir, auth, listing } = await createSterileConfigDir({ parentDir: builderDir });
      const { env, dropped } = scrubEnvironment({ configDir, useApiKey: auth.method === 'api-key-env' });
      const argv = buildArgv({ model: options.smoke ? SMOKE_MODEL : GATING_MODEL });
      const command = await resolveClaude();
      manifest.builder = { auth, configDirListing: listing, droppedEnv: dropped, argv, command };
      const result = await runSession({
        argv,
        prompt,
        cwd: sandboxDir,
        env,
        transcriptPath,
        timeoutMs: BUILDER_TIMEOUT_MIN * MINUTE,
        command: command.path,
        // R4.6 fires HERE — on the streaming init, before a token of builder budget is
        // spent. Asserting after the session returns cost nothing only while auth was
        // dead; with a live credential it would burn a full run and then abort.
        onInit: (init) => assertPure('builder', manifest.builder, [init], configDir),
      });
      const { init, ...session } = result;
      Object.assign(manifest.builder, session, { resolvedModel: manifest.builder.purity?.model ?? null });
      const events = parseTranscript(await readFile(transcriptPath, 'utf8'));
      // Belt and braces: an init that never arrived (or arrived without its newline)
      // must still fail the run rather than skip the assertion.
      if (init === null) assertPure('builder', manifest.builder, events, configDir);
      assertAuthenticated('builder', events);
    });

    /* ── SEG-4 · the scan (H2, H3, H8) ────────────────────────────────── */
    const scan = await segment(manifest, 'SEG-4', SEGMENT_HARD_STOP_MIN, async () => {
      // BUILD_NOTES.md lives at the BUILD root — `site/` — not the sandbox root.
      // The brief says "at the root of your build" and `prompt.txt` puts the build in
      // ./site/, so they name the same directory. This check used to look one level up,
      // which failed the first real build that ever completed even though the builder had
      // followed the only coherent reading of its instructions (docs/decisions.md,
      // 2026-07-29 — H3 BUILD_NOTES location fixed to the build root). `index.html` was
      // always resolved against `site/`; now the notes are too.
      const buildRoot = path.join(sandboxDir, 'site');
      const buildNotesPath = path.join(buildRoot, 'BUILD_NOTES.md');
      const report = scanSegment({
        transcriptText: await readFile(transcriptPath, 'utf8'),
        buildNotesText: await readFile(buildNotesPath, 'utf8').catch(() => null),
        indexHtmlExists: await isNonEmptyFile(path.join(buildRoot, 'index.html')),
        buildNotesExists: await isNonEmptyFile(buildNotesPath),
        // Named, never accepted: a stray copy one level up turns "does not exist" into
        // the actual diagnosis, without widening what the gate lets through.
        buildNotesAtSandboxRoot: await isNonEmptyFile(path.join(sandboxDir, 'BUILD_NOTES.md')),
        pageCount: site.pages.length,
      });
      await writeFile(path.join(builderDir, 'scan-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      return report;
    });
    if (!scan.h2.ok) {
      return finish(`FAIL — H2 clarifying question (routed to ${scan.routing ?? 'product'})`, 1);
    }
    if (!scan.h3.ok) return finish('FAIL — H3 incomplete build', 1);

    /* ── SEG-5 · capture ──────────────────────────────────────────────── */
    const shotsDir = path.join(runDir, 'shots');
    const capture = await segment(manifest, 'SEG-5', SEGMENT_HARD_STOP_MIN, () =>
      captureSite({ siteDir: path.join(sandboxDir, 'site'), outDir: shotsDir, site }),
    );
    if (capture.problems.length > 0) return finish(`FAIL — H3 built site does not serve cleanly`, 1);

    /* ── SEG-6 · evaluation ───────────────────────────────────────────── */
    const det = await evaluateDeterministic({ site, scenario, shotsDir, packageDir, crawl: capture.crawl });
    await mkdir(path.join(runDir, 'eval'), { recursive: true });
    await writeFile(path.join(runDir, 'eval', 'evaluate.json'), `${JSON.stringify(det, null, 2)}\n`, 'utf8');

    let judged = null;
    if (!options.smoke) {
      judged = await segment(manifest, 'SEG-6-eval', SEGMENT_HARD_STOP_MIN, () =>
        runEvaluator({ manifest, runDir, packageDir, shotsDir, site, scenario, scenarioFile, sandboxDir, options }),
      );
    }

    const report = mergeReport({
      det,
      scan,
      gate,
      judged,
      scenarioId: scenario.id,
      smoke: options.smoke,
    });
    await writeReport({ outDir: path.join(runDir, 'eval'), report, runDir, manifest });

    const line = `${report.verdict} ${report.total}`;
    return finish(line, report.exitCode);
  } catch (err) {
    const kind = err instanceof PreconditionError ? 'PRECONDITION' : 'INFRA';
    manifest.error = { kind, message: err.message, detail: err.detail ?? null };
    // A PRECONDITION or INFRA abort is NEVER written as a scored verdict (R3.6, R7.4):
    // ship-gate.mjs ignores it rather than counting it as a product failure.
    manifest.ruleHashes.end = await hashRuleFiles(HERE, scenarioFile);
    manifest.finishedAt = new Date().toISOString();
    manifest.elapsedMin = elapsedMinutes(startedAt);
    // A failed run leaves the same credential copies behind as a passing one.
    Object.assign(manifest, await scrubCredentials(runDir));
    await writeManifest(runDir, manifest);
    process.stderr.write(`\n${kind}: ${err.message}\n${(err.detail ?? []).join('\n')}\n${runDir}\n`);
    process.exit(2);
  }
}

/* ─────────────────────────── helpers ─────────────────────────── */

/**
 * R4.3a — resolve `claude` to an absolute image `spawn` can run with `shell: false`.
 * Attempt 1 of the 2026-07-29 live run died here in 29 ms: the bare name is an `sh`
 * shim (ENOENT) and the `.cmd` beside it is what Node refuses to spawn shell-less
 * (EINVAL, CVE-2024-27980). A resolution failure is INFRA — the CLI's absence is an
 * operator problem, not a product FAIL.
 */
async function resolveClaude() {
  try {
    const resolved = await resolveExecutable(CLAUDE_COMMAND);
    return { path: resolved.path, via: resolved.via, shim: resolved.shim };
  } catch (err) {
    throw new Error(`${err.message}\n${(err.detail ?? []).join('\n')}`);
  }
}

/**
 * R4.6 — one place where the amended predicate is applied, so the builder and the
 * evaluator cannot drift apart (HIGH-3). The outcome is recorded on `sink` either way:
 * the evidence that a session WAS sterile is as load-bearing as the abort.
 */
/**
 * A session that could not log in built nothing, and "nothing" is indistinguishable from
 * a builder that ignored the brief once it reaches H3. So it is caught in SEG-3 and
 * aborts as PRECONDITION — never written to `verdict.txt`, never seen by `ship-gate.mjs`.
 */
function assertAuthenticated(who, events) {
  const failure = authFailureOf(events);
  if (failure === null) return;
  throw new PreconditionError(`the ${who} session could not authenticate — nothing was built, so there is nothing to score`, [
    failure,
    '',
    'Re-authenticate the CLI (run `claude` interactively and /login), then rerun.',
    'R3.4 copies the credentials file faithfully; a dead credential copies across dead.',
  ]);
}

function assertPure(who, sink, events, configDir) {
  const purity = assertSessionPurity(events, { configDir });
  sink.purity = {
    ok: purity.ok,
    kind: purity.kind,
    cliVersion: purity.version,
    baseline: builtinsFor(purity.version) === null ? null : purity.version,
    model: purity.model,
    problems: purity.problems,
  };
  if (!purity.ok) throw new PreconditionError(`the ${who} session was not sterile`, purity.problems);
  return purity;
}

async function segment(manifest, id, budgetMin, body) {
  const started = Date.now();
  try {
    const value = await body();
    manifest.segments[id] = { ok: true, ms: Date.now() - started, budgetMin };
    if (Date.now() - started > budgetMin * MINUTE) {
      manifest.segments[id].overBudget = true;
      throw new Error(`${id} exceeded its ${String(budgetMin)}-minute budget — INFRA, not a product FAIL`);
    }
    return value;
  } catch (err) {
    manifest.segments[id] = { ok: false, ms: Date.now() - started, budgetMin, error: err.message };
    throw err;
  }
}

async function assertDeployedFreshness(manifest) {
  await exec('npm', ['run', 'build'], {
    cwd: REPO_ROOT,
    maxBuffer: 32 * 1024 * 1024,
    // Windows resolves `npm` through a .cmd shim, which Node will not spawn directly.
    shell: process.platform === 'win32',
  });
  const { DEPLOYED_BASE_URL } = await import(path.join(REPO_ROOT, 'site.config.ts'));
  const check = await assertDeployedIsHead({
    distIndexHtml: path.join(REPO_ROOT, 'dist', 'index.html'),
    deployedUrl: DEPLOYED_BASE_URL,
  });
  manifest.deployedBundle = check;
  if (!check.ok) {
    throw new PreconditionError('deployed bundle is not HEAD — wait for the Pages deploy', [
      `local: ${check.local}`,
      `deployed: ${check.deployed}`,
    ]);
  }
  if (!manifest.git.clean) {
    throw new PreconditionError('the worktree is dirty — a gating run must be reproducible', manifest.git.dirtyFiles);
  }
}

/** The version the mock transcript claims to be. Must have a builtin-manifest entry. */
const MOCK_CLI_VERSION = Object.keys(BUILTIN_MANIFEST.versions).at(-1);

/**
 * The init event the mock builder emits — REALISTIC, not empty.
 *
 * This used to be `{ agents: [], skills: [], plugins: [] }`, and that is precisely how
 * the unsatisfiable R4.6 predicate survived review: the only transcript it had ever
 * judged was one the harness wrote to satisfy it. The same agrees-with-itself failure
 * the gate's README rejects for `src/export/validate`. Now the mock reproduces the real
 * CLI's baseline, so `--mock-builder` exercises the real predicate — and a leak planted
 * in `extra` makes it abort exactly as a contaminated live session would.
 *
 * @param {{ claudeHome: string, extra?: object }} options
 */
export function mockBuilderEvents({ claudeHome, extra = {} }) {
  const baseline = builtinsFor(MOCK_CLI_VERSION);
  return [
    {
      type: 'system',
      subtype: 'init',
      model: 'mock-builder',
      claude_code_version: MOCK_CLI_VERSION,
      mcp_servers: [],
      plugins: [],
      agents: [...baseline.agents],
      skills: [...baseline.skills],
      slash_commands: [...baseline.slash_commands],
      output_style: baseline.output_style,
      memory_paths: { auto: path.join(claudeHome, 'projects', 'mock-builder', 'memory') },
      ...extra,
    },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Built the site.' }] } },
    { type: 'result', subtype: 'success', result: 'Built the site from the brief.\n\nBUILD COMPLETE' },
  ];
}

/**
 * The MOCK builder. Copies a canned site into the sandbox and writes the transcript a
 * clean session would have produced. It proves every segment after SEG-3 without a token
 * of spend — and it is recorded as a cached segment so the run can never ship.
 *
 * R4.6 runs on the mock transcript too. It has to: a purity check the mock path skips is
 * a purity check nobody notices breaking.
 */
async function runMockBuilder({ mockDir, builderDir, sandboxDir, transcriptPath }) {
  await cp(path.resolve(mockDir), sandboxDir, { recursive: true });
  const claudeHome = path.join(builderDir, 'claude-home');
  const events = mockBuilderEvents({ claudeHome });
  await writeFile(transcriptPath, `${events.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8');
  const builder = { mock: true, mockDir: path.resolve(mockDir), resolvedModel: 'mock-builder' };
  assertPure('builder', builder, events, claudeHome);
  return builder;
}

async function runEvaluator({ manifest, runDir, packageDir, shotsDir, site, scenario, scenarioFile, sandboxDir, options }) {
  const evalDir = path.join(runDir, 'eval');
  const evalSandbox = path.join(evalDir, 'sandbox');
  const rubricManifest = buildRubricManifest({ site, scenario });

  const { listing: stagedFiles } = await stageEvaluatorSandbox({
    sandboxDir: evalSandbox,
    packageDir,
    shotsDir,
    siteJsonPath: path.join(packageDir, 'site.json'),
    scenarioPath: scenarioFile,
    buildNotesPath: path.join(sandboxDir, 'BUILD_NOTES.md'),
    harnessDir: HERE,
    rubricManifest,
  });
  await assertNoAncestorContext(evalSandbox);

  // The evaluator gets the SAME evidence trail as the builder. It is a second sterile
  // `claude -p` session with the same power to be contaminated, and a verdict produced
  // by a session carrying this repo's memory would be worth nothing — but until now
  // only the builder's purity was asserted and only the builder's session was recorded.
  manifest.evaluator = { stagedFiles, attempts: [] };

  const command = await resolveClaude();
  manifest.evaluator.command = command;

  for (let attempt = 0; attempt <= EVALUATOR_MAX_RETRIES; attempt += 1) {
    const { dir: configDir, auth, listing } = await createSterileConfigDir({ parentDir: path.join(evalDir, `attempt-${String(attempt)}`) });
    const { env, dropped } = scrubEnvironment({ configDir, useApiKey: auth.method === 'api-key-env' });
    const transcriptPath = path.join(evalDir, `transcript-${String(attempt)}.jsonl`);
    // Pushed BEFORE the session runs, so the streaming purity abort still has somewhere
    // to record what it saw — an abort with no evidence is the worst of both.
    const record = { attempt, auth, configDirListing: listing, droppedEnv: dropped };
    manifest.evaluator.attempts.push(record);

    const session = await runSession({
      argv: buildArgv({ model: options.smoke ? SMOKE_MODEL : GATING_MODEL }),
      prompt: EVALUATOR_PROMPT,
      cwd: evalSandbox,
      env,
      transcriptPath,
      timeoutMs: SEGMENT_HARD_STOP_MIN * MINUTE,
      command: command.path,
      onInit: (init) => assertPure('evaluator', record, [init], configDir),
    });
    Object.assign(record, {
      exitCode: session.code,
      timedOut: session.timedOut,
      elapsedMs: session.elapsedMs,
      resolvedModel: record.purity?.model ?? null,
      pure: record.purity?.ok ?? false,
    });
    const events = parseTranscript(await readFile(transcriptPath, 'utf8'));
    if (session.init === null) assertPure('evaluator', record, events, configDir);
    assertAuthenticated('evaluator', events);

    const result = await readJudgments(evalSandbox, rubricManifest);
    if (result.ok) {
      const { accepted, rejected, missing } = acceptJudgments({ judgments: result.judgments, rubricManifest, stagedFiles });
      if (rejected.length === 0 && missing.length === 0) {
        await writeFile(path.join(evalDir, 'judgments.json'), `${JSON.stringify(result.judgments, null, 2)}\n`, 'utf8');
        return accepted;
      }
      record.rejected = rejected.map((r) => `${r.item?.id ?? '?'}: ${r.why}`);
      record.missing = missing;
    } else {
      record.problems = result.problems;
    }
  }
  // R7.4 — a flaky evaluator fails the run as INFRA, never as a product FAIL.
  throw new Error('the evaluator produced malformed output twice — INFRA, not a product FAIL');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`roundtrip: ${err.message}\n`);
    process.exit(2);
  });
}
