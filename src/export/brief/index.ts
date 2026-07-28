/** The brief generator's public surface — `docs/export-format.md` §3. */

export { generateBrief } from './generateBrief.ts'
export {
  DEFINITION_OF_DONE_LINES,
  RESPONSIVE_LINES,
  ROLE_LINES,
} from './boilerplate.ts'
export { escapeClientText, quote, quoteTruncated, quoteFilename } from './text.ts'
