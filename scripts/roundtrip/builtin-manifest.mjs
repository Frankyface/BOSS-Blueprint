/**
 * R4.6 — the committed, VERSION-KEYED builtin manifest and the two questions asked of it.
 *
 * `builtin-manifest.json` is data, not code, and it is hashed as a rule file (R9.3) so a
 * mid-run edit marks the run INVALID: relaxing the baseline is the single easiest way to
 * make a contaminated session look sterile, and it is made visible rather than trusted away.
 *
 * The JSON is read with `readFileSync` rather than an import attribute so the module works
 * identically under node, vitest and the gate's own runner, with no loader flags.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** R9.3 hashes it by this name; `run.mjs` records the version it matched against. */
export const BUILTIN_MANIFEST_FILENAME = 'builtin-manifest.json';
export const BUILTIN_MANIFEST_PATH = path.join(HERE, BUILTIN_MANIFEST_FILENAME);

export const BUILTIN_MANIFEST = Object.freeze(JSON.parse(readFileSync(BUILTIN_MANIFEST_PATH, 'utf8')));

/** The sets a purity check compares against. Order never matters; membership always does. */
export const BUILTIN_SET_FIELDS = Object.freeze(['agents', 'skills', 'slash_commands']);

/** Every version this harness has measured. A session reporting anything else is a mismatch. */
export function pinnedVersions(manifest = BUILTIN_MANIFEST) {
  return Object.keys(manifest.versions ?? {});
}

/**
 * @returns {object|null} the baseline for `version`, or null when the manifest has never
 * been captured for it — which is a loud PRECONDITION at the call site, never a silent pass.
 */
export function builtinsFor(version, manifest = BUILTIN_MANIFEST) {
  if (typeof version !== 'string' || version === '') return null;
  return manifest.versions?.[version] ?? null;
}
