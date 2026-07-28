/**
 * The check inventory, in protocol §2 step order. Pure: takes the loaded package
 * plus the extracted schema, returns an ordered array of immutable CheckResults.
 */

import { check } from '../report.mjs';
import { expectedPageSlugs } from '../slug.mjs';
import { pagesOf } from './walk.mjs';
import { filenameChecks, v12ZipLayout, entryOrderCheck, fileConventionChecks } from './layout.mjs';
import {
  v1Schema,
  v2Referential,
  v3Uniqueness,
  v5GenerateDescription,
  v8Submission,
  v9Population,
  v9NearEmpty,
  v13DuplicateNames,
  v14EmptySlotDescription,
  v19BlankRealText,
  v20StrandedDescription,
  v26LabelsAndNav,
} from './structure.mjs';
import {
  v11ExternalUrls,
  v15Reachability,
  v17ScreenshotPaths,
  v18OffPage,
  v22Legibility,
  v23TemplateFiller,
  v24IdentityRemap,
  v25RightOverflow,
  slugDerivationCheck,
} from './links-frames.mjs';
import { v4AssetBijection, v6PageRenders, v10ZipSize, v16Extension, v21ManifestMatchesFile } from './assets-png.mjs';
import { v7BriefCrossChecks, n13OverflowMarker } from './brief.mjs';

/**
 * @param {object} pkg loaded package bundle
 * @param {object} opts { schema, options, internalIds }
 * @returns {ReadonlyArray<object>}
 */
export function runAllChecks(pkg, { schema, options, internalIds }) {
  const ctx = { strictConventions: options.strictConventions };
  const site = pkg.site;
  const results = [];

  // ---- Protocol §2 step 1 — filename + exact zip layout -------------------
  results.push(...filenameChecks(pkg, ctx));
  results.push(v12ZipLayout(pkg, ctx));
  results.push(entryOrderCheck(pkg, ctx));
  results.push(fileConventionChecks(pkg, ctx));

  // ---- Protocol §2 step 2 — ajv schema validation --------------------------
  results.push(v1Schema(pkg, schema, ctx));

  // ---- Protocol §2 step 3 — validator replay (V2-V26) ---------------------
  results.push(runOrSkip('V02', site, () => v2Referential(site, ctx)));
  results.push(runOrSkip('V03', site, () => v3Uniqueness(site, ctx)));
  results.push(runOrSkip('V04', site, () => v4AssetBijection(pkg, ctx)));
  results.push(runOrSkip('V05', site, () => v5GenerateDescription(site, ctx)));
  results.push(runOrSkip('V06', site, () => v6PageRenders(pkg, ctx)));
  results.push(runOrSkip('V07', site, () => v7BriefCrossChecks(pkg, ctx)));
  results.push(runOrSkip('V08', site, () => v8Submission(site, ctx)));
  results.push(runOrSkip('V09', site, () => v9Population(site, ctx)));
  results.push(runOrSkip('V09w', site, () => v9NearEmpty(site, ctx)));
  results.push(v10ZipSize(pkg, options.maxZipMb, ctx));
  results.push(runOrSkip('V11', site, () => v11ExternalUrls(site, ctx)));
  results.push(runOrSkip('V13', site, () => v13DuplicateNames(site, ctx)));
  results.push(runOrSkip('V14', site, () => v14EmptySlotDescription(site, ctx)));
  results.push(runOrSkip('V15', site, () => v15Reachability(site, ctx)));
  results.push(runOrSkip('V16', site, () => v16Extension(site, ctx)));
  results.push(runOrSkip('V17', site, () => v17ScreenshotPaths(site, ctx)));
  results.push(runOrSkip('V18', site, () => v18OffPage(site, ctx)));
  results.push(runOrSkip('V19', site, () => v19BlankRealText(site, ctx)));
  results.push(runOrSkip('V20', site, () => v20StrandedDescription(site, ctx)));
  results.push(runOrSkip('V21', site, () => v21ManifestMatchesFile(pkg, ctx)));
  results.push(runOrSkip('V22', site, () => v22Legibility(site, ctx)));
  results.push(runOrSkip('V23', site, () => v23TemplateFiller(site, ctx)));
  results.push(
    runOrSkip('V24', site, () => v24IdentityRemap(site, pkg.briefText?.text ?? null, internalIds, ctx)),
  );
  results.push(runOrSkip('V25', site, () => v25RightOverflow(site, ctx)));
  results.push(runOrSkip('V26', site, () => v26LabelsAndNav(site, ctx)));
  results.push(runOrSkip('N13', site, () => n13OverflowMarker(pkg, ctx)));
  results.push(
    runOrSkip('C03', site, () => slugDerivationCheck(site, expectedPageSlugs(pagesOf(site)), ctx)),
  );

  // ---- Protocol §2 step 4 — expected-manifest diff (Stage 4) ---------------
  results.push(manifestStep(options));

  return Object.freeze(results);
}

function runOrSkip(id, site, run) {
  return site === null ? unparseable(id) : run();
}

function unparseable(id) {
  return check({
    id,
    title: 'skipped — site.json is missing or unparseable',
    ref: 'export-format §5',
    cls: 'STEP',
    skipped: true,
  });
}

function manifestStep(options) {
  if (options.noManifest) {
    return check({
      id: 'M04',
      title: 'expected-manifest diff skipped by --no-manifest (protocol §2 step 4, Stage 4 work)',
      ref: 'roundtrip-protocol §2.4',
      cls: 'STEP',
      skipped: true,
    });
  }
  return check({
    id: 'M04',
    title: 'expected-manifest diff (protocol §2 step 4) is not implemented in this gate',
    ref: 'roundtrip-protocol §2.4',
    cls: 'WARN',
    problems: [
      'sketch-fidelity diff against a scenario file is Stage 4 work — pass --no-manifest to acknowledge, ' +
        'or run the Stage 4 gate for scenario A/B',
    ],
  });
}
