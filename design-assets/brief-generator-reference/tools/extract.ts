/**
 * Spec fixture extractor — Appendix A equality test B requires BOTH blocks to be
 * "extracted from `docs/export-format.md` itself", so the spec stays the single
 * source of truth and a spec edit cannot silently pass.
 *
 * §7.1 is a 3-backtick ```json fence.
 * §7.2 is a 4-backtick ````markdown fence that CONTAINS a 3-backtick fence
 * (the rule-8 verbatim sub-block), so the extractor must close on ```` only.
 */

import { readFileSync } from 'node:fs';

export interface Extracted {
  /** Raw fence body, lines joined with LF, terminated with a final LF. */
  text: string;
  /** 1-based line number of the fence's first content line in the spec. */
  startLine: number;
}

function extractFence(doc: string, headingPrefix: string, openFence: RegExp, closeFence: RegExp): Extracted {
  const lines = doc.split('\n');
  const headingIndex = lines.findIndex((l) => l.startsWith(headingPrefix));
  if (headingIndex < 0) throw new Error(`heading not found: ${headingPrefix}`);
  let open = -1;
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    if (openFence.test(lines[i])) {
      open = i;
      break;
    }
  }
  if (open < 0) throw new Error(`opening fence not found after ${headingPrefix}`);
  let close = -1;
  for (let i = open + 1; i < lines.length; i += 1) {
    if (closeFence.test(lines[i])) {
      close = i;
      break;
    }
  }
  if (close < 0) throw new Error(`closing fence not found after ${headingPrefix}`);
  return { text: `${lines.slice(open + 1, close).join('\n')}\n`, startLine: open + 2 };
}

export interface SpecFixtures {
  siteJsonText: Extracted;
  briefText: Extracted;
}

export function extractSpecFixtures(specPath: string): SpecFixtures {
  const doc = readFileSync(specPath, 'utf8');
  if (doc.includes('\r')) throw new Error('spec has CR bytes; expected LF-only');
  return {
    siteJsonText: extractFence(doc, '### 7.1 ', /^```json$/, /^```$/),
    // The inner ``` fence must not close the outer block: close only on exactly ````.
    briefText: extractFence(doc, '### 7.2 ', /^````markdown$/, /^````$/),
  };
}
