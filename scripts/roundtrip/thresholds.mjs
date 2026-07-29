/**
 * EVERY number and EVERY frozen rule set the round-trip harness obeys.
 *
 * `staging/stage-4-roundtrip-launch/feature-roundtrip-harness.md` R10.1 is binding:
 * a threshold that lives inline in a rule module can be loosened in a one-line diff
 * nobody reads. Here, each value is asserted by `thresholds.test.mjs` against the
 * literal in the spec, and the whole file is sha256-hashed into every
 * `run-manifest.json` at run start AND run end (R9.3), so an edit mid-run marks the
 * run INVALID instead of quietly producing a nicer verdict.
 *
 * Nothing in this file may change without a `docs/decisions.md` entry and a full
 * rerun (R10.1, R10.7).
 */

/* ─────────────────────────── R8.3 · verdict thresholds ─────────────────────── */

/** Total soft score a run must reach to PASS. */
export const PASS_SCORE = 85;
/** Below this a run is a structural FAIL rather than a NEAR MISS. */
export const NEAR_MISS_FLOOR = 70;

/* ─────────────────────────── R8.2 · per-dimension floors ───────────────────── */

/** S1: mean per-page reading-order match across the site. */
export const S1_MEAN_FLOOR = 0.85;
/** S1: no single page may fall below this. */
export const S1_PAGE_FLOOR = 0.75;
/** S3: every GENERATE item must score at least this from the evaluator. */
export const S3_MIN_ITEM_SCORE = 1;
/** S4: fraction of image placements + empty slots that must land correctly. */
export const S4_FLOOR = 0.8;

/**
 * R8.2 S3 · the length rule — "within `lengthHint`, or 0.3–3× the frame estimate".
 *
 * The band is wide on purpose: this is a SANITY check ("did the builder write a
 * paragraph where a paragraph goes, or three words?"), not a judgment about the copy.
 * Whether the copy is any GOOD is the evaluator's half of S3.
 */
export const S3_LENGTH_MIN_RATIO = 0.3;
export const S3_LENGTH_MAX_RATIO = 3;

/**
 * Frame → character estimate, at the export's 1200px design width. Roughly a 16px
 * body face: ~8px of advance per glyph, ~24px per line box.
 */
export const FRAME_CHAR_WIDTH_PX = 8;
export const FRAME_LINE_HEIGHT_PX = 24;

/** A `lengthHint` counted in sentences is met within ±1 of the stated number. */
export const S3_SENTENCE_HINT_TOLERANCE = 1;

/** Soft-score point weights, S1..S6 — 100 points total (R8.2). */
export const SCORE_WEIGHTS = Object.freeze({
  S1: 25,
  S2: 20,
  S3: 15,
  S4: 15,
  S5: 15,
  S6: 10,
});

/** S5 splits its 15 points between a deterministic half and the evaluator half. */
export const S5_DET_POINTS = 7;
export const S5_EVAL_POINTS = 8;

/** Every judged dimension is scored 0..2 by the evaluator agent (R8.2, Appendix B). */
export const EVAL_SCORE_MIN = 0;
export const EVAL_SCORE_MAX = 2;

/* ─────────────────────────── geometry + image matching ─────────────────────── */

/**
 * R2.4 · placement tolerance, per edge, in page pixels. Used by BOTH the driver's
 * post-placement assertion and the manifest diff — one constant, so the diff can
 * never be more forgiving than the thing that produced the geometry.
 */
export const POSITION_TOLERANCE_PX = 24;

/** R8.1 H7 · maximum dHash hamming distance for "this is the same photo". */
export const DHASH_MAX_HAMMING = 10;

/** R8.2 S5 · CIEDE2000 distance under which a rendered colour counts as the client's. */
export const DELTA_E_MAX = 12;

/* ─────────────────────────── R4 · builder session ──────────────────────────── */

/** R4.3 · `--max-turns` for the builder session. */
export const MAX_TURNS = 250;
/** R4.4 · builder segment budget, minutes. */
export const BUILDER_TIMEOUT_MIN = 45;
/** R4.4 · orchestrator hard stop for ANY segment, minutes. */
export const SEGMENT_HARD_STOP_MIN = 60;
/** R2.9 · client driver budget, minutes. */
export const CLIENT_BUDGET_MIN = 8;
/** Success criteria · whole-run budget for `--smoke`, minutes. */
export const SMOKE_BUDGET_MIN = 12;

/* ─────────────────────────── R5 · transcript scanning ──────────────────────── */

/** R5.7 · BUILD_NOTES entries per page above which FRICTION is warned (strict `>`). */
export const FRICTION_PER_PAGE = 1.5;

/** R5.3 step 4 · character cap on a quoted span, so one stray `"` cannot swallow a message. */
export const QUOTE_SPAN_CAP = 400;

/**
 * R5.2 · tool names that constitute asking the user something. The predicate is the
 * catch-all for tools that do not exist yet — in `-p` print mode no answer can ever
 * arrive, so any attempt to ask is unambiguous.
 */
export const USER_INPUT_TOOLS = Object.freeze(['AskUserQuestion', 'ExitPlanMode']);
export const USER_INPUT_TOOL_PREDICATE = /askuser|userinput|user_input/i;

/**
 * R5.3 rule 2a, clause 1 — "lead → you".
 *
 * DELIBERATELY STRONGER than protocol §4.2 (ruled 2026-07-28, Open Question 6):
 * the protocol's set was `(do|would|could|can|should|shall|which|what|where|who|how)`,
 * and `\b(do)\b` does not match "does", so "Is this what you wanted?" and "Are you happy
 * for me to proceed?" both passed H2 as written. The strengthening lands BEFORE any
 * gating run exists, because changing a scan rule after a verdict exists is exactly what
 * R5.5 and R10.2 forbid.
 */
export const INTERROGATIVE_LEAD_SET = Object.freeze([
  'do', 'does', 'did', 'would', 'could', 'can', 'may', 'might', 'should', 'shall', 'will',
  'is', 'are', 'was', 'were',
  'which', 'what', 'where', 'when', 'who', 'whom', 'whose', 'why', 'how',
]);

/** R5.3 rule 2a, clause 2 — "you → verb of choice" (the reverse-order direction). */
export const CHOICE_VERB_SET = Object.freeze([
  'want', 'prefer', 'like', 'need', 'confirm', 'decide', 'choose', 'pick',
]);

/** Compiled form of clause 1. Built from the set so the set stays the single source. */
export const INTERROGATIVE_LEAD_RE = new RegExp(
  `\\b(${INTERROGATIVE_LEAD_SET.join('|')})\\b[^?]*\\byou(r|rs)?\\b`,
  'i',
);

/** Compiled form of clause 2. */
export const CHOICE_VERB_RE = new RegExp(
  `\\byou(r|rs)?\\b[^?]*\\b(${CHOICE_VERB_SET.join('|')})\\b`,
  'i',
);

/**
 * R5.3 rule 2a, clause 3 — "first-person offer" (added 2026-07-29, before run 1).
 *
 * Both existing clauses need the word `you` somewhere in the sentence, so the whole
 * family of offers a builder makes about ITSELF slipped through: "Should I add a
 * favicon?", "Shall we wire the footer nav too?", "Want me to swap the hero photo?",
 * "Anything else?". In `-p` print mode none of those can ever be answered, which is
 * exactly the condition that makes an ask unambiguous — the same argument ruling 6
 * used, applied to the direction it missed.
 *
 * DELIBERATELY NARROW. A general "lead → I" clause would swallow the rhetorical
 * self-questions a builder legitimately writes ("Why did I choose a two-column
 * hero?"), which the corpus keeps in `mustPass`. These four forms are matched
 * literally, and only in a sentence that already ends in `?`.
 *
 * The cost is accepted knowingly: a rhetorical "Should I have used a table? No — the
 * sketch shows cards." now fails H2. R5.5 says a hit is an auto-FAIL with no waving
 * through, so the honest place to pay that cost is here, before any verdict exists.
 */
export const FIRST_PERSON_OFFER_SET = Object.freeze([
  'should i',
  'shall (i|we)',
  'want me to',
  'anything else',
]);

/** Compiled form of clause 3. Built from the set so the set stays the single source. */
export const FIRST_PERSON_OFFER_RE = new RegExp(`\\b(${FIRST_PERSON_OFFER_SET.join('|')})\\b`, 'i');

/** R5.3 rule 2b · the seven phrase regexes, case-insensitive, applied per sentence. */
export const QUESTION_PHRASES = Object.freeze([
  /let me know/i,
  /please (clarify|confirm|provide|specify)/i,
  /need (more|additional) (info|information|details)/i,
  /before i (proceed|continue)/i,
  /awaiting (your|further)/i,
  /unable to proceed without/i,
  /which (option|one) (do you|would you)/i,
]);

/** R5.6 · a tool_result error that means "the harness blocked me", not "I am confused". */
export const PERMISSION_DENIAL_RE = /permission|not allowed|denied|requires approval/i;

/** R5.7 · a BUILD_NOTES entry that reads as a package defect rather than a design call. */
export const PACKAGE_DEFECT_RE =
  /missing|contradict|couldn'?t find|not provided|no .* (given|specified)|broken|invalid/i;

/** R5.4 · the completion sentinel the prompt asks for, verbatim. */
export const BUILD_SENTINEL = 'BUILD COMPLETE';

/* ─────────────────────────── viewports ─────────────────────────────────────── */

/** R6.5 · capture viewport: 1200 wide so a shot and a 1200px sketch are comparable. */
export const SHOT_VIEWPORT = Object.freeze({ width: 1200, height: 900 });
/** R2.1 · the client driver's viewport. */
export const CLIENT_VIEWPORT = Object.freeze({ width: 1440, height: 900 });
/** R2.3 · the desktop guard must be ABSENT at this size; if present the run aborts. */
export const GUARD_ABSENT_AT = Object.freeze({ width: 1440, height: 900 });
/** R6.1 · where `static-server.mjs` serves the built site. */
export const STATIC_SERVER_PORT = 4173;
export const STATIC_SERVER_HOST = '127.0.0.1';

/* ─────────────────────────── R4.2 · the frozen prompt ──────────────────────── */

/**
 * sha256 of `scripts/roundtrip/prompt.txt`, LF, with its single trailing newline.
 *
 * The prompt is part of the MEASURED CONTRACT: the no-questions instruction lives only
 * in `brief.md`, and the harness prompt staying silent on it is precisely what makes H2
 * measure the package instead of the harness. This hash is the tripwire against a future
 * implementer "helpfully" adding it.
 */
export const PROMPT_SHA256 = '6ef395fefc8e0e910e48c5b299169952545c7db013bf30b819ed2a22f1ebce74';

/* ─────────────────────────── R3.5 · the builder allowlist ──────────────────── */

/**
 * Ruled 2026-07-28 (Open Question 5): `npx` and `npm` are DENIED, not allowed.
 * Protocol §3.1 allowed `Bash(npx serve*)` while declaring the build hermetic, but `npx`
 * fetches from the npm registry on a cold cache — the allowlist contradicted its own
 * network-denial rationale. SEG-5 serves the built site with the committed,
 * dependency-free `static-server.mjs` instead, which also removes the harness's own
 * network dependency.
 */
export const BUILDER_ALLOW = Object.freeze([
  'Read', 'Glob', 'Grep', 'Write', 'Edit',
  'Bash(mkdir *)', 'Bash(dir *)', 'Bash(ls *)', 'Bash(copy *)', 'Bash(cp *)',
  'Bash(node *)',
]);

export const BUILDER_DENY = Object.freeze([
  'WebFetch', 'WebSearch', 'Bash(curl *)', 'Bash(git *)',
  'Bash(npm *)', 'Bash(npx *)', 'Bash(pip *)', 'Bash(powershell *)',
]);

/** R3.5 · bash prefixes that must never appear in an allow entry. */
export const DENIED_BASH_PREFIXES = Object.freeze(['npx', 'npm', 'pip', 'powershell', 'curl', 'git']);

/** R3.5 · the regex the anti-weakening test uses against every generated allow entry. */
export const BANNED_ALLOW_RE = /^Bash\((npx|npm)\b/;

/** R4.5 · flags that must never appear in the assembled builder argv. */
export const BANNED_FLAGS = Object.freeze(['--dangerously-skip-permissions']);

/** R4.5 · permission modes that would defeat the allowlist if defaulted in settings. */
export const BANNED_PERMISSION_MODES = Object.freeze(['bypassPermissions', 'acceptEdits']);

/* ─────────────────────────── R3 · sandbox + environment ────────────────────── */

/** R3.2 · a sandbox ancestor holding any of these defeats the zero-context premise. */
export const CONTEXT_LEAK_FILES = Object.freeze([
  'CLAUDE.md',
  'AGENTS.md',
  '.claude/CLAUDE.md',
  '.claude/settings.json',
]);

/** R3.7 · the ONLY parent-environment variables a sterile session inherits. */
export const ENV_ALLOWLIST = Object.freeze([
  'PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME',
  'COMSPEC', 'PATHEXT', 'NUMBER_OF_PROCESSORS', 'OS', 'PROCESSOR_ARCHITECTURE',
]);

/** R3.7 · every variable matching one of these is dropped unless explicitly re-added. */
export const ENV_SCRUB_PREFIXES = Object.freeze(['CLAUDE_', 'ANTHROPIC_', 'CLAUDE_CODE_']);

/** R3.4 · candidate credential filenames, in preference order. Contents are NEVER read. */
export const CREDENTIAL_FILENAMES = Object.freeze(['.credentials.json', 'credentials.json']);

/** R3.7 · machine-level policy files that cannot be isolated; presence is recorded. */
export const MANAGED_POLICY_PATHS = Object.freeze([
  'C:\\ProgramData\\ClaudeCode\\managed-settings.json',
  '/Library/Application Support/ClaudeCode/managed-settings.json',
  '/etc/claude-code/managed-settings.json',
]);

/** R3.1 · default run root, OUTSIDE the repo tree. Override with ROUNDTRIP_RUNS_DIR. */
export const RUNS_DIR_ENV = 'ROUNDTRIP_RUNS_DIR';
export const RUNS_DIR_SUBPATH = Object.freeze(['boss-blueprint', 'roundtrip-runs']);

/* ─────────────────────────── R9.3 · rule-file hashing ──────────────────────── */

/**
 * Hashed at run start AND run end. Any difference marks the run INVALID and
 * `ship-gate.mjs` refuses it — editing a rule mid-run is the single easiest way to
 * fake a PASS, so it is made visible in the evidence rather than trusted away.
 * Paths are relative to `scripts/roundtrip/`; the scenario file is added per run.
 */
export const RULE_FILES = Object.freeze([
  'prompt.txt',
  'rubric.md',
  'thresholds.mjs',
  'scan-transcript.mjs',
  'manifest-diff.mjs',
  // R4.6's baseline (amended 2026-07-29). Relaxing the builtin set mid-run is the
  // cheapest way to make a contaminated session look sterile, so it is hashed like
  // every other rule rather than trusted.
  'builtin-manifest.json',
]);

/** R9.4 · the exact set of (scenario, target) legs a ship gate must contain. */
export const SHIP_GATE_LEGS = Object.freeze([
  Object.freeze({ scenario: 'A', target: 'preview' }),
  Object.freeze({ scenario: 'A', target: 'deployed' }),
  Object.freeze({ scenario: 'B', target: 'preview' }),
]);

/* ─────────────────────────── R7 · evaluator contract ───────────────────────── */

/** R7.3 · an evidence string must name at least one real artefact file. */
export const EVIDENCE_ARTEFACT_RE = /(shots|pages)\/[\w.-]+\.png|BUILD_NOTES\.md/;

/** R7.4 · exactly one retry on malformed evaluator output, then INFRA. */
export const EVALUATOR_MAX_RETRIES = 1;

/** R7.2 · nothing outside this set may be staged into the evaluator sandbox. */
export const EVALUATOR_SANDBOX_ALLOWED = Object.freeze([
  'site.json',
  'scenario.json',
  'rubric.md',
  'rubric-manifest.json',
  'BUILD_NOTES.md',
]);
